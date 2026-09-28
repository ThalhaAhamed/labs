const test = require("node:test");
const assert = require("node:assert/strict");
const WebSocket = require("ws");
const { decodeToPcm, pcmToWav } = require("../src/audio");
const { startControlServer, play, SEND_RATE } = require("../src/recorder");

test("the speaker bot's socket receives the clip as real-time-paced sendaudio chunks", async () => {
  // 2.5s of a 440 Hz tone at 16 kHz, round-tripped through a WAV file's
  // bytes so the ffmpeg decode + resample to 48 kHz is exercised too.
  const src = Buffer.alloc(16_000 * 2.5 * 2);
  for (let i = 0; i < src.length / 2; i++) src.writeInt16LE(Math.round(8000 * Math.sin((2 * Math.PI * 440 * i) / 16_000)), i * 2);
  const pcm = await decodeToPcm(pcmToWav(src, 16_000), SEND_RATE);
  assert.ok(Math.abs(pcm.length - SEND_RATE * 2.5 * 2) <= 2 * 48, `48 kHz decode length ${pcm.length}`);

  const { server, socket } = await startControlServer(0);
  const port = server.address().port;
  const bot = new WebSocket(`ws://127.0.0.1:${port}/control`);
  const received = [];
  bot.on("message", (m) => received.push({ at: Date.now(), msg: JSON.parse(m.toString()) }));
  await new Promise((r) => bot.on("open", r));

  const log = process.stdout.write;
  process.stdout.write = () => true;
  const started = Date.now();
  try {
    await play(await socket, "bot-speaker", pcm);
  } finally {
    process.stdout.write = log;
  }
  await new Promise((r) => setTimeout(r, 100));
  bot.close();
  server.close();

  assert.equal(received.length, 3); // 1s + 1s + 0.5s
  for (const { msg } of received) {
    assert.equal(msg.command, "sendaudio");
    assert.equal(msg.bot_id, "bot-speaker");
    assert.equal(msg.sample_rate, 48_000);
    assert.equal(msg.encoding, "pcm16");
    assert.equal(msg.channels, 1);
    assert.equal(msg.endianness, "little");
  }
  const sent = Buffer.concat(received.map(({ msg }) => Buffer.from(msg.audiochunk, "base64")));
  assert.ok(sent.equals(pcm), "every byte of the clip arrives, in order");

  // Paced to the wall clock, half a second ahead: the last chunk (starting at
  // 2.0s of audio) goes out about 1.5s after the first.
  const lastAt = received[2].at - started;
  assert.ok(lastAt >= 1400 && lastAt < 2200, `last chunk sent after ${lastAt}ms`);
});
