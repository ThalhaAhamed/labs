import { WebSocketServer } from 'ws';

const OPENAI_MODEL = 'gpt-5.6-terra';
const normalize = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export const matchesWakeWord = (text, wakeWords) => wakeWords.some((word) => normalize(text).includes(normalize(word)));

export async function validateOpenAIKey(apiKey) {
  try {
    await generateOpenAI(apiKey, 'Reply OK.');
  } catch (error) {
    throw new Error(`OPENAI_API_KEY failed: ${error.message}`);
  }
}

export async function generateOpenAI(apiKey, input) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      reasoning: { effort: 'none' },
      instructions: 'You are a concise meeting assistant. Answer in plain text suitable for meeting chat. When asked to summarize, summarize the complete meeting transcript from the beginning, including discussion, decisions, and action items. Do not guess.',
      input,
      max_output_tokens: 500
    })
  }).catch(() => { throw new Error('Could not connect to OpenAI. Check your internet connection.'); });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || `OpenAI returned ${response.status}.`);
  return data.output_text || data.output?.flatMap((item) => item.content || []).find((item) => item.type === 'output_text')?.text;
}

export function attachBridge(server, { deepgramKey, openaiKey, wakeWords }) {
  const wss = new WebSocketServer({ noServer: true });
  const sessions = new Map();
  const triggers = wakeWords.map(normalize);

  server.on('upgrade', (request, socket, head) => {
    if (!['/bridge', '/bridge/audio'].includes(new URL(request.url, 'http://localhost').pathname)) return socket.destroy();
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  });

  wss.on('connection', (ws, request) => {
    const channel = new URL(request.url, 'http://localhost').pathname;
    let botId;

    ws.on('message', (raw, isBinary) => {
      if (!isBinary) {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ready' && message.bot_id) {
          botId = message.bot_id;
          const session = getSession(botId);
          session[channel === '/bridge' ? 'control' : 'audio'] = ws;
          if (channel === '/bridge') {
            console.log('✅ Meeting chat ready');
            sendChat(session, 'OpenAI chat bridge connected. Say "hey bot" followed by your question.');
          } else {
            connectDeepgram(session);
          }
        }
        return;
      }

      const session = botId && sessions.get(botId);
      if (!session?.deepgram || session.deepgram.readyState !== WebSocket.OPEN) return;
      const pcm = decodeAudioFrame(Buffer.from(raw));
      if (pcm) session.deepgram.send(pcm);
    });

    ws.on('close', () => {
      const session = botId && sessions.get(botId);
      if (!session) return;
      session[channel === '/bridge' ? 'control' : 'audio'] = null;
      if (!session.control && !session.audio) {
        session.deepgram?.close();
        sessions.delete(botId);
      }
    });
  });

  function getSession(botId) {
    if (!sessions.has(botId)) sessions.set(botId, { botId, recent: [], pending: '' });
    return sessions.get(botId);
  }

  function connectDeepgram(session) {
    if (session.deepgram) return;
    const url = 'wss://api.deepgram.com/v1/listen?model=nova-3&language=en&encoding=linear16&sample_rate=48000&channels=1&smart_format=true&interim_results=true&endpointing=500&utterance_end_ms=1000';
    const socket = new WebSocket(url, ['token', deepgramKey]);
    session.deepgram = socket;
    socket.addEventListener('open', () => console.log(`✅ Listening for: ${wakeWords.join(' / ')}`));
    socket.addEventListener('message', ({ data }) => {
      const event = JSON.parse(data);
      if (event.type === 'Results' && event.is_final) {
        const text = event.channel?.alternatives?.[0]?.transcript?.trim();
        if (text) session.pending = `${session.pending} ${text}`.trim();
        if (event.speech_final) finishUtterance(session);
      } else if (event.type === 'UtteranceEnd') finishUtterance(session);
    });
    socket.addEventListener('error', (error) => console.error(`❌ Deepgram connection failed: ${error.message || 'unknown error'}`));
    socket.addEventListener('close', ({ code }) => {
      if (![1000, 1005].includes(code)) console.warn(`⚠️ Transcription disconnected (${code})`);
    });
  }

  function finishUtterance(session) {
    const text = session.pending.trim();
    session.pending = '';
    if (!text) return;
    console.log(`🎤 ${text}`);
    session.recent.push(text);
    if (matchesWakeWord(text, triggers)) {
      session.responseQueue = (session.responseQueue || Promise.resolve()).then(() => respond(session, text));
    }
  }

  async function respond(session, request) {
    try {
      const context = session.recent.join('\n');
      const answer = (await generateOpenAI(openaiKey, `Complete meeting transcript:\n${context}\n\nCurrent request:\n${request}`))?.trim();
      if (!answer) throw new Error('OpenAI returned no text.');
      sendChat(session, answer);
      console.log(`💬 ${answer}`);
    } catch (error) {
      console.error(`❌ OpenAI response failed: ${error.message}`);
    }
  }

  server.closeBridge = () => {
    for (const ws of wss.clients) ws.terminate();
    for (const session of sessions.values()) session.deepgram?.close();
  };
}

function decodeAudioFrame(frame) {
  if (frame.length < 5 || frame[0] !== 1) return null;
  let offset = 3 + frame.readUInt16LE(1);
  if (offset + 2 > frame.length) return null;
  offset += 2 + frame.readUInt16LE(offset);
  return offset < frame.length ? frame.subarray(offset) : null;
}

function sendChat(session, text) {
  if (session.control?.readyState !== 1) return;
  session.control.send(JSON.stringify({ command: 'sendmsg', bot_id: session.botId, message: text, msg: text }));
}
