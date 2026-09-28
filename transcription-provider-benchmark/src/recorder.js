/**
 * Step 1: get the reference clip recorded as a real meeting.
 *
 * Two bots join the same call:
 *   - the listener records it, exactly as a customer's notetaker would;
 *   - the speaker plays the clip into the call over its control WebSocket
 *     (the `sendaudio` command), so no human has to press play and the audio
 *     goes through the meeting platform's own codec and mixing.
 *
 * The output is recordings/<listener_bot_id>.json. Step 2 (benchmark) sends
 * that one recording to every provider.
 */
const fs = require("fs");
const http = require("http");
const path = require("path");
const { WebSocketServer } = require("ws");
const api = require("./api");
const { decodeToPcm, sha256File } = require("./audio");
const { startTunnel } = require("./tunnel");

const SEND_RATE = 48_000;           // what sendaudio expects
const CHUNK_SECONDS = 1;
const LEAD_SECONDS = 0.5;           // stay this far ahead of real time so the bot never starves
const SETTLE_SECONDS = 5;           // silence before and after the clip
const JOIN_TIMEOUT_MS = 10 * 60_000; // time allowed for someone to admit the bots
const IN_CALL = new Set(["InMeeting", "Recording"]);
const FAILED = new Set(["Failed", "Denied", "NotAllowed", "Stopped", "Done"]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), ms)));
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function waitInCall(botId, label) {
  const deadline = Date.now() + JOIN_TIMEOUT_MS;
  let last = "";
  while (Date.now() < deadline) {
    const status = await api.getBotStatus(botId).catch((e) => `error (${api.describeError(e)})`);
    if (status !== last) {
      console.log(`   ${label.padEnd(8)} ${status}${status === "InWaitingRoom" ? "  <- admit it from the meeting" : ""}`);
      last = status;
    }
    if (IN_CALL.has(status)) return;
    if (FAILED.has(status)) throw new Error(`${label} bot ended with status ${status} before the clip was played`);
    await sleep(3000);
  }
  throw new Error(`${label} bot was not admitted within ${JOIN_TIMEOUT_MS / 60_000} minutes`);
}

/** Resolves with the first WebSocket the speaker bot opens to us. */
function startControlServer(port) {
  const server = http.createServer((_req, res) => res.end("ok"));
  const wss = new WebSocketServer({ server, path: "/control" });
  let resolveSocket;
  const socket = new Promise((r) => (resolveSocket = r));
  wss.on("connection", (ws) => {
    console.log("   speaker  control socket connected");
    let logged = 0;
    ws.on("message", (raw) => {
      // Log the first few messages so an unexpected handshake is visible.
      if (logged++ < 3) console.log(`   speaker  says: ${raw.toString().slice(0, 160)}`);
    });
    resolveSocket(ws);
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ server, wss, socket })));
}

async function play(ws, botId, pcm) {
  const bytesPerChunk = SEND_RATE * 2 * CHUNK_SECONDS;
  const started = Date.now();
  const total = Math.ceil(pcm.length / bytesPerChunk);
  for (let i = 0; i < total; i++) {
    const chunk = pcm.subarray(i * bytesPerChunk, (i + 1) * bytesPerChunk);
    ws.send(JSON.stringify({
      command: "sendaudio",
      bot_id: botId,
      audiochunk: chunk.toString("base64"),
      sample_rate: SEND_RATE,
      encoding: "pcm16",
      channels: 1,
      endianness: "little",
    }));
    if (i % 10 === 0) process.stdout.write(`\r   playing  ${i * CHUNK_SECONDS}s / ${total * CHUNK_SECONDS}s`);
    // Pace against the wall clock rather than sleeping a fixed amount per
    // chunk, so small delays don't accumulate into drift.
    const nextAt = started + ((i + 1) * CHUNK_SECONDS - LEAD_SECONDS) * 1000;
    await sleep(Math.max(0, nextAt - Date.now()));
  }
  process.stdout.write(`\r   playing  done (${(pcm.length / 2 / SEND_RATE).toFixed(1)}s)          \n`);
}

async function record({ meetingLink, audioPath, referencePath, port }) {
  const pcm = await decodeToPcm(audioPath, SEND_RATE);
  const clipSeconds = pcm.length / 2 / SEND_RATE;
  console.log(`  Clip       ${audioPath} (${clipSeconds.toFixed(1)}s)`);
  console.log(`  Reference  ${referencePath}`);
  console.log(`  Meeting    ${meetingLink}\n`);

  const { server, socket } = await startControlServer(port);
  const tunnel = await startTunnel(port);
  const controlUrl = tunnel.replace(/^http/, "ws") + "/control";

  const bots = {};
  const cleanup = async () => {
    for (const [label, id] of Object.entries(bots)) {
      await api.removeBot(id).then(
        () => console.log(`   ${label.padEnd(8)} removed`),
        (e) => console.warn(`   ${label.padEnd(8)} could not be removed: ${api.describeError(e)}`)
      );
    }
    server.close();
  };

  try {
    const listener = await api.createBot({
      meeting_link: meetingLink,
      bot_name: "Benchmark Recorder",
      video_required: false,
      recording_config: { transcript: { provider: { meetstream: { language: "auto" } } } },
    });
    bots.listener = listener.bot_id ?? listener.id;
    console.log(`  Listener bot ${bots.listener}`);

    const speaker = await api.createBot({
      meeting_link: meetingLink,
      bot_name: "Benchmark Speaker",
      video_required: false,
      socket_connection_url: { websocket_url: controlUrl },
    });
    bots.speaker = speaker.bot_id ?? speaker.id;
    console.log(`  Speaker bot  ${bots.speaker}\n`);

    console.log("  Waiting for both bots to be in the call (keep everyone else muted)...");
    await Promise.all([waitInCall(bots.listener, "listener"), waitInCall(bots.speaker, "speaker")]);
    const ws = await withTimeout(socket, 60_000, "speaker bot never opened its control WebSocket");

    await sleep(SETTLE_SECONDS * 1000);
    const playedAt = new Date().toISOString();
    await play(ws, bots.speaker, pcm);
    await sleep(SETTLE_SECONDS * 1000);

    const recording = {
      bot_id: bots.listener,
      speaker_bot_id: bots.speaker,
      meeting_platform: new URL(meetingLink).hostname,
      played_at: playedAt,
      clip: { path: path.relative(process.cwd(), audioPath), sha256: sha256File(audioPath), seconds: +clipSeconds.toFixed(3) },
      reference: { path: path.relative(process.cwd(), referencePath), sha256: sha256File(referencePath) },
    };
    fs.mkdirSync("recordings", { recursive: true });
    const out = path.join("recordings", `${bots.listener}.json`);
    fs.writeFileSync(out, JSON.stringify(recording, null, 2) + "\n");
    console.log(`\n  Recording saved -> ${out}`);
    console.log(`  Next: npm run benchmark -- --bot-id ${bots.listener}\n`);
    return recording;
  } finally {
    await cleanup();
  }
}

module.exports = { record, startControlServer, play, SEND_RATE };
