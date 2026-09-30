const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
// In the packaged desktop app the binary is unpacked next to app.asar.
const ffmpegPath = require("ffmpeg-static").replace(/app\.asar([\\/])/, "app.asar.unpacked$1");

/**
 * Decodes any audio ffmpeg understands (wav, flac, mp3, m4a, ...) to raw
 * signed 16-bit little-endian mono PCM at `sampleRate`.
 *
 * @param {string|Buffer} input  A file path, or the encoded bytes themselves
 * @returns {Promise<Buffer>}
 */
function decodeToPcm(input, sampleRate) {
  return new Promise((resolve, reject) => {
    const fromBuffer = Buffer.isBuffer(input) || input instanceof Uint8Array;
    const proc = spawn(ffmpegPath, [
      "-hide_banner", "-loglevel", "error",
      "-i", fromBuffer ? "pipe:0" : input,
      "-f", "s16le", "-acodec", "pcm_s16le", "-ac", "1", "-ar", String(sampleRate),
      "pipe:1",
    ]);
    const out = [];
    let err = "";
    proc.stdout.on("data", (c) => out.push(c));
    proc.stderr.on("data", (c) => (err += c));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve(Buffer.concat(out));
      else reject(new Error(`ffmpeg exited with ${code}: ${err.trim()}`));
    });
    if (fromBuffer) proc.stdin.end(Buffer.from(input));
  });
}

/** Wraps mono s16le PCM in a WAV header. */
function pcmToWav(pcm, sampleRate) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);          // fmt chunk size
  header.writeUInt16LE(1, 20);           // PCM
  header.writeUInt16LE(1, 22);           // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);           // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function sha256File(path) {
  return crypto.createHash("sha256").update(fs.readFileSync(path)).digest("hex");
}

/**
 * SHA-256 of a text file with its line endings made LF first, so the same
 * transcript hashes the same on a Windows checkout (CRLF) and a macOS or
 * Linux one (LF). Used for reference transcripts; audio uses sha256File.
 */
function textSha256(pathOrText, { isText = false } = {}) {
  const text = isText ? pathOrText : fs.readFileSync(pathOrText, "utf8");
  return crypto.createHash("sha256").update(text.replace(/\r\n?/g, "\n")).digest("hex");
}

module.exports = { decodeToPcm, pcmToWav, sha256File, textSha256, ffmpegPath };
