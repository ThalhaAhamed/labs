import express from 'express';
import ngrok from '@ngrok/ngrok';

export function startWebhookServer(port, onEvent = () => {}) {
  const app = express();
  app.use(express.json({ type: '*/*' }));

  app.get('/health', (_request, response) => response.json({ ok: true }));
  app.post(['/webhooks/meetstream', '/webhook'], (request, response) => {
    const event = request.body || {};
    onEvent(event);
    const output = formatWebhookEvent(event);
    if (output) console.log(output);
    response.status(200).send('ok');
  });
  app.use((error, _request, response, _next) => {
    console.error(`❌ Invalid webhook: ${error.message}`);
    response.status(400).send('invalid request');
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    server.once('listening', () => resolve(server));
    server.once('error', (error) => reject(new Error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Stop the other program or choose a different PORT in .env.`
        : `The webhook listener could not start: ${error.message}`
    )));
  });
}

export function createBotEventTracker() {
  const terminalBots = new Set();
  const waiters = new Map();

  return {
    handle(event) {
      const name = event.bot_event || event.event;
      if (!event.bot_id || !['bot.stopped', 'bot.kicked', 'bot.denied', 'bot.notallowed', 'bot.failed'].includes(name)) return;
      terminalBots.add(event.bot_id);
      waiters.get(event.bot_id)?.();
    },
    waitForTerminal(botId, timeoutMs = 30000) {
      if (terminalBots.has(botId)) return Promise.resolve();
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          waiters.delete(botId);
          reject(new Error('MeetStream did not confirm that the bot left.'));
        }, timeoutMs);
        waiters.set(botId, () => {
          clearTimeout(timeout);
          waiters.delete(botId);
          resolve();
        });
      });
    }
  };
}

export function formatWebhookEvent(payload = {}) {
  const { bot_event = '', event = '', bot_status = '', message = '' } = payload;
  const heard = payload.new_text
    || payload.data?.new_text
    || payload.channel?.alternatives?.[0]?.transcript
    || payload.result?.channel?.alternatives?.[0]?.transcript
    || (payload.end_of_turn ? payload.transcript : '');
  const name = bot_event || event;
  if (heard?.trim()) return `Heard: ${heard.trim()}`;
  if (name === 'bot.in_waiting_room') return '⏳ Waiting to be admitted';
  if (name === 'bot.inmeeting') return '✅ Bot joined the meeting';
  if (name === 'bot.recording') return '✅ Bot is listening';
  if (name === 'bot.leaving') return '⏳ Bot is leaving';
  if (name === 'bot.stopped') return '✅ MeetStream reports the bot stopped';
  if (name === 'bot.kicked') return '⚠️ Bot was removed by a meeting participant';
  if (/denied|failed|rejected|notallowed|error/i.test(name) || /agent|bridge|provider|quota|credit|billing/i.test(message)) {
    return `❌ ${message || bot_status || name}`;
  }
  return null;
}

export async function startNgrokTunnel(port) {
  try {
    return await ngrok.forward({ addr: port, authtoken_from_env: true });
  } catch {
    throw new Error('Could not start ngrok. Check NGROK_AUTHTOKEN in .env and your internet connection.');
  }
}
