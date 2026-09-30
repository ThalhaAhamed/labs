/**
 * npm run ui: the benchmark in a browser.
 *
 * A thin local web server over the same commands the CLI runs. Each run is
 * `node index.js record ...` and/or `node index.js benchmark ...` started as a
 * child process; its output is streamed to the page as it happens, and its
 * results folder is read back when it finishes. Nothing is computed here that
 * the CLI does not compute, so a result from the UI is the same as one from
 * the terminal and can be re-scored the same way.
 *
 * It listens on 127.0.0.1 only: it holds your MeetStream key (from .env, or
 * typed into the page, kept in memory and never sent back to the browser) and
 * can send bots into your meetings, so it is not meant to be exposed.
 *
 * The desktop app (desktop/main.js) runs this same server inside Electron. It
 * passes a writable data folder in BENCH_DATA_DIR (an installed app cannot
 * write next to its own files) and a key store, so keys survive restarts.
 */
const fs = require("fs");
const path = require("path");
// Where runs, recordings, uploads, the sample clip and .env live. Defaults to
// this folder, which is what `npm run ui` has always used.
const DATA = process.env.BENCH_DATA_DIR || __dirname;
require("dotenv").config({ path: path.join(DATA, ".env") });
const crypto = require("crypto");
const { spawn } = require("child_process");
const express = require("express");
const { PROVIDERS } = require("./src/providers");
const { RATES, PRICES_AS_OF } = require("./src/pricing");
const { ttsEngine } = require("./src/tts");
const TTS = ttsEngine();

const PORT = parseInt(process.env.UI_PORT || "4173", 10);
const ROOT = __dirname;
const RESULTS = path.join(DATA, "results");
const UPLOADS = path.join(DATA, "uploads");
const RECORDINGS = path.join(DATA, "recordings");
const SAMPLE_AUDIO = path.join(DATA, "sample", "clip.wav");
const SAMPLE_REFERENCE = path.join(DATA, "sample", "reference.txt");
const BOT_ID = /^[0-9a-f-]{36}$/i;

// What this app knows about a bot it recorded (recordings/<bot>.json): what
// was played, and whether a reference transcript was saved with it. null for
// a bot recorded elsewhere.
function recordingInfo(botId) {
  const file = path.join(RECORDINGS, `${botId}.json`);
  if (!BOT_ID.test(botId) || !exists(file)) return null;
  const rec = JSON.parse(fs.readFileSync(file, "utf8"));
  const clip = rec.clip;
  const source = !clip ? "live" : clip.synthetic_speech ? "script" : /(^|\/)sample\/clip\.wav$/.test(clip.path ?? "") ? "sample" : "upload";
  const refFile = rec.reference?.path ? path.resolve(DATA, rec.reference.path) : null;
  const referenceWords = refFile && exists(refFile) ? fs.readFileSync(refFile, "utf8").split(/\s+/).filter(Boolean).length : null;
  return {
    source,
    recordedAt: rec.played_at ?? rec.joined_at ?? null,
    clipSeconds: clip?.seconds ?? null,
    speakerBotId: rec.speaker_bot_id ?? null,
    reference: referenceWords != null ? { words: referenceWords } : null,
  };
}

// Speaker bots this app sent: they only played audio, so there's nothing of
// theirs to transcribe.
function speakerBotIds() {
  if (!exists(RECORDINGS)) return new Set();
  return new Set(fs.readdirSync(RECORDINGS).filter((f) => f.endsWith(".json")).map((f) => {
    try { return JSON.parse(fs.readFileSync(path.join(RECORDINGS, f), "utf8")).speaker_bot_id; } catch { return null; }
  }).filter(Boolean));
}

// Which references make sense for an audio source. The sample's transcript
// only fits audio that was the sample clip; a typed script is its own
// reference; your own audio or live speech needs your own transcript.
function referenceKinds(mode, audioKind, rec) {
  if (mode === "two-bot") return { sample: ["sample", "none"], script: ["script", "none"], upload: ["text", "none"] }[audioKind] ?? [];
  if (mode === "recorder") return ["text", "none"];
  // An existing recording: its saved reference if it has one, the sample's if
  // it played the sample (or we can't tell), or your own transcript.
  const kinds = [];
  if (rec?.reference) kinds.push("saved");
  if (!rec || rec.source === "sample") kinds.push("sample");
  kinds.push("text", "none");
  return kinds;
}

// Under Electron, process.execPath is the app itself; ELECTRON_RUN_AS_NODE
// makes it behave as plain Node for the CLI, so users need no Node install.
const NODE_ENV = process.versions.electron ? { ELECTRON_RUN_AS_NODE: "1" } : {};
const runNode = (script, args, env = {}) =>
  spawn(process.execPath, [script, ...args], { cwd: DATA, env: { ...process.env, ...NODE_ENV, BENCH_DATA_DIR: DATA, ...env } });

// Keys come from .env, or are typed into the page. By default they live in
// memory for this process only; the desktop app supplies a store that keeps
// them (encrypted by the OS) between launches.
let keyStore = null;
const keys = {
  MEETSTREAM_API_KEY: process.env.MEETSTREAM_API_KEY || "",
  NGROK_AUTHTOKEN: process.env.NGROK_AUTHTOKEN || "",
};

const app = express();
app.use(express.json({ limit: "200mb" })); // uploaded audio arrives base64-encoded
app.use(express.static(path.join(ROOT, "public")));

const RUN_ID = /^[0-9TZ-]+$/;
const exists = (p) => { try { fs.accessSync(p); return true; } catch { return false; } };

// ── Status and settings ──────────────────────────────────────────────────────

app.get("/api/status", (_req, res) => {
  res.json({
    hasKey: Boolean(keys.MEETSTREAM_API_KEY),
    hasNgrok: Boolean(keys.NGROK_AUTHTOKEN),
    sampleReady: exists(SAMPLE_AUDIO) && exists(SAMPLE_REFERENCE),
    tts: TTS?.name ?? null,
    busy: Boolean(current && !current.done),
    currentJob: current && !current.done ? current.id : null,
    currentMode: current && !current.done ? current.spec.mode : null,
  });
});

app.post("/api/keys", (req, res) => {
  for (const name of ["MEETSTREAM_API_KEY", "NGROK_AUTHTOKEN"]) {
    if (typeof req.body?.[name] === "string" && req.body[name].trim()) keys[name] = req.body[name].trim();
  }
  try { keyStore?.save({ ...keys }); } catch (err) { console.warn(`  could not save keys: ${err.message}`); }
  res.json({ hasKey: Boolean(keys.MEETSTREAM_API_KEY), hasNgrok: Boolean(keys.NGROK_AUTHTOKEN) });
});

app.get("/api/providers", (_req, res) => {
  res.json({
    pricesAsOf: PRICES_AS_OF,
    providers: Object.keys(PROVIDERS).map((key) => ({
      key,
      config: PROVIDERS[key],
      rate: RATES[key]?.describe({ config: PROVIDERS[key] }) ?? null,
      pricing: RATES[key]?.source ?? null,
    })),
  });
});

app.get("/api/bots", async (_req, res) => {
  if (!keys.MEETSTREAM_API_KEY) return res.status(400).json({ error: "Add your MeetStream API key first." });
  try {
    const axios = require("axios");
    const { data } = await axios.get("https://api.meetstream.ai/api/v1/bots", {
      headers: { Authorization: `Token ${keys.MEETSTREAM_API_KEY}` },
      timeout: 20_000,
    });
    const speakers = speakerBotIds();
    res.json({
      bots: (data?.bots ?? []).filter((b) => !speakers.has(b.bot_id)).slice(0, 30).map((b) => ({
        bot_id: b.bot_id,
        name: b.bot_name ?? null,
        status: b.status ?? b.bot_status ?? null,
        created_at: b.created_at ?? b.createdAt ?? null,
        meeting: b.meeting_link ?? null,
        recorded_here: recordingInfo(b.bot_id)?.source ?? null,
      })),
    });
  } catch (err) {
    res.status(502).json({ error: err.response?.data?.error ?? err.message });
  }
});

app.get("/api/recordings/:botId", (req, res) => {
  if (!BOT_ID.test(req.params.botId)) return res.status(400).json({ error: "Not a bot ID." });
  const rec = recordingInfo(req.params.botId);
  res.json({ known: !!rec, speaker: speakerBotIds().has(req.params.botId), ...(rec ?? {}) });
});

// Builds sample/clip.wav + sample/reference.txt (npm run fetch-sample).
let sampleBuild = null;
app.post("/api/sample", (_req, res) => {
  if (exists(SAMPLE_AUDIO) && exists(SAMPLE_REFERENCE)) return res.json({ ready: true });
  if (!sampleBuild) {
    sampleBuild = new Promise((resolve) => {
      const child = runNode(path.join(ROOT, "scripts", "fetch-sample.js"), []);
      let out = "";
      child.stdout.on("data", (c) => (out += c));
      child.stderr.on("data", (c) => (out += c));
      child.on("close", (code) => resolve({ code, out }));
    }).finally(() => (sampleBuild = null));
  }
  sampleBuild.then(({ code, out }) =>
    code === 0 ? res.json({ ready: true }) : res.status(500).json({ error: out.trim().split("\n").pop() || "fetch-sample failed" }));
});

app.get("/api/sample/reference", (_req, res) => {
  if (!exists(SAMPLE_REFERENCE)) return res.status(404).json({ error: "Sample not built yet." });
  res.type("text/plain").send(fs.readFileSync(SAMPLE_REFERENCE, "utf8"));
});

// ── Past runs ────────────────────────────────────────────────────────────────

app.get("/api/runs", (_req, res) => {
  if (!exists(RESULTS)) return res.json({ runs: [] });
  const runs = fs.readdirSync(RESULTS)
    .filter((d) => RUN_ID.test(d) && exists(path.join(RESULTS, d, "results.json")))
    .map((d) => {
      const r = JSON.parse(fs.readFileSync(path.join(RESULTS, d, "results.json"), "utf8"));
      const run = JSON.parse(fs.readFileSync(path.join(RESULTS, d, "run.json"), "utf8"));
      return {
        id: d,
        bot_id: r.bot_id,
        bot_name: run.recording?.bot_name ?? null,
        scored: r.reference_words != null,
        providers: r.providers.filter((p) => p.ran).length,
        started_at: run.started_at ?? null,
      };
    })
    .sort((a, b) => b.id.localeCompare(a.id));
  res.json({ runs });
});

app.get("/api/runs/:id", (req, res) => {
  const id = req.params.id;
  const dir = path.join(RESULTS, id);
  if (!RUN_ID.test(id) || !exists(path.join(dir, "results.json"))) return res.status(404).json({ error: "No such run" });
  const results = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
  const run = JSON.parse(fs.readFileSync(path.join(dir, "run.json"), "utf8"));
  // Each provider's transcript as the scorer saw it (normalised), for reading in the page.
  const transcripts = {};
  for (const job of run.jobs.filter((j) => j.status === "Success" && j.transcript_file && !j.superseded)) {
    const f = path.join(dir, job.transcript_file.replace(/\.json$/, ".normalized.txt"));
    if (exists(f) && !transcripts[job.provider]) transcripts[job.provider] = fs.readFileSync(f, "utf8").trim();
  }
  const reference = exists(path.join(dir, "reference.normalized.txt"))
    ? fs.readFileSync(path.join(dir, "reference.normalized.txt"), "utf8").trim()
    : null;
  res.json({
    id,
    results,
    recording: run.recording,
    started_at: run.started_at,
    poll_seconds: run.environment?.poll_seconds,
    transcripts,
    reference,
  });
});

app.get("/api/runs/:id/download/:file", (req, res) => {
  const { id, file } = req.params;
  if (!RUN_ID.test(id) || !["results.md", "results.json", "run.json"].includes(file)) return res.sendStatus(404);
  const f = path.join(RESULTS, id, file);
  if (!exists(f)) return res.sendStatus(404);
  res.download(f, `${id}-${file}`);
});

// ── Running ──────────────────────────────────────────────────────────────────
//
// One run at a time: a run may hold the ngrok tunnel and has bots in a call.

let current = null;

function newJob(spec) {
  return { id: crypto.randomBytes(6).toString("hex"), spec, log: [], clients: new Set(), state: { phase: "starting", bots: {} }, done: false, child: null };
}

function emit(job, type, data) {
  const line = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of job.clients) res.write(line);
}

function setState(job, patch) {
  Object.assign(job.state, patch);
  emit(job, "state", job.state);
}

// Reads the CLI's own output to follow the run (the same lines a terminal shows).
function watchLine(job, line) {
  let m;
  if ((m = line.match(/(Listener|Recorder) bot\s+([0-9a-f-]{36})/))) setState(job, { bots: { ...job.state.bots, recorder: m[2] } });
  if ((m = line.match(/Speaker bot\s+([0-9a-f-]{36})/))) setState(job, { bots: { ...job.state.bots, speaker: m[1] } });
  if ((m = line.match(/^\s*(listener|recorder|speaker)\s+(\w+)/))) {
    setState(job, { botStatus: { ...(job.state.botStatus ?? {}), [m[1] === "listener" ? "recorder" : m[1]]: m[2] } });
  }
  if (/InWaitingRoom/.test(line)) setState(job, { phase: "waiting-room" });
  if (/Recording\. Speak or play/.test(line) || /^\s*playing\s/.test(line)) setState(job, { phase: "recording" });
  if (/Recording saved ->/.test(line)) setState(job, { phase: "recorded" });
  if (/Bot is \w+, waiting for the recording/.test(line)) setState(job, { phase: "processing" });
  if (/Round \d+\/\d+: submitting/.test(line)) setState(job, { phase: "transcribing" });
  // "   deepgram     Success  7.02s" / "   sarvam       not run  HTTP 400: ..." / "   meetstream   reusing ..."
  if ((m = line.match(/^\s+(\w+)\s+(Success|Failed|TimedOut|not run|reusing)\b\s*(?:([\d.]+)s)?\s*(.*)$/))) {
    const status = m[2] === "reusing" ? "Reused" : m[2] === "not run" ? "NotRun" : m[2];
    const seconds = m[3] ? parseFloat(m[3]) : null;
    setState(job, { providers: { ...(job.state.providers ?? {}), [m[1]]: { status, seconds, detail: m[4]?.trim() || null } } });
  }
  if ((m = line.match(/^\s+Providers\s+(.+)$/))) setState(job, { lanes: m[1].split(",").map((s) => s.trim()) });
  if (/Round \d+\/\d+: submitting/.test(line) && !job.state.submittedAt) setState(job, { submittedAt: Date.now() });
  if ((m = line.match(/Results -> results[\\/]([0-9TZ-]+)[\\/]results\.md/))) setState(job, { runId: m[1] });
}

function runStep(job, args, env) {
  return new Promise((resolve) => {
    const child = runNode(path.join(ROOT, "index.js"), args, { ...env, FORCE_COLOR: "0" });
    job.child = child;
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString().replace(/\r(?!\n)/g, "\n"); // progress lines rewrite with \r
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop();
      for (const raw of lines) {
        const line = raw.replace(/\u001b\[[0-9;]*m/g, "");
        if (!line.trim() || /^> /.test(line)) continue;
        job.log.push(line);
        emit(job, "log", line);
        watchLine(job, line);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("close", (code) => { if (buffer.trim()) onData("\n"); job.child = null; resolve(code); });
  });
}

function saveUpload(dir, name, base64) {
  fs.mkdirSync(dir, { recursive: true });
  const safe = path.basename(String(name || "upload")).replace(/[^\w.-]/g, "_") || "upload";
  const file = path.join(dir, safe);
  fs.writeFileSync(file, Buffer.from(base64, "base64"));
  return file;
}

app.post("/api/jobs", async (req, res) => {
  if (current && !current.done) return res.status(409).json({ error: "A run is already in progress." });
  const spec = req.body ?? {};
  const mode = spec.mode;
  if (!["existing", "two-bot", "recorder"].includes(mode)) return res.status(400).json({ error: "Pick where the audio comes from." });
  if (!keys.MEETSTREAM_API_KEY) return res.status(400).json({ error: "Add your MeetStream API key first." });
  if (mode === "two-bot" && !keys.NGROK_AUTHTOKEN) return res.status(400).json({ error: "The speaker bot needs an ngrok authtoken." });
  if (mode !== "existing" && !/^https:\/\/\S+$/.test(spec.meetingLink ?? "")) return res.status(400).json({ error: "Enter the meeting link." });
  if (mode === "existing" && !BOT_ID.test(spec.botId ?? "")) return res.status(400).json({ error: "Enter a bot ID (36 characters)." });
  if (mode === "existing" && speakerBotIds().has(spec.botId)) return res.status(400).json({ error: "That's a speaker bot: it only played the audio. Use the recorder bot from the same run." });
  const providers = (spec.providers ?? []).filter((p) => PROVIDERS[p]);
  if (!providers.length) return res.status(400).json({ error: "Pick at least one provider." });

  // The reference has to fit the audio (the sample's transcript is useless
  // against people talking, for example).
  const audioKind = mode === "two-bot" ? spec.audio?.kind ?? "sample" : null;
  const refKind = spec.reference?.kind ?? "none";
  if (!referenceKinds(mode, audioKind, mode === "existing" ? recordingInfo(spec.botId) : null).includes(refKind)) {
    return res.status(400).json({ error: "That reference doesn't fit this audio. Pick one of the options shown." });
  }
  const noReference = refKind === "none";

  const job = newJob(spec);
  const dir = path.join(UPLOADS, job.id);

  // Reference: the sample's, pasted text, the one saved with the recording
  // ("saved": the CLI reads it from recordings/<bot>.json), or none.
  let referencePath = null;
  if (spec.reference?.kind === "sample") referencePath = SAMPLE_REFERENCE;
  if (spec.reference?.kind === "text" && spec.reference.text?.trim()) {
    fs.mkdirSync(dir, { recursive: true });
    referencePath = path.join(dir, "reference.txt");
    fs.writeFileSync(referencePath, spec.reference.text);
  }
  if (referencePath && !exists(referencePath)) return res.status(400).json({ error: "Build the sample first (Get sample clip)." });

  // A typed script: the recorder speaks it (--script) and it is the reference.
  let scriptPath = null;
  if (mode === "two-bot" && spec.audio?.kind === "script") {
    if (!TTS) return res.status(400).json({ error: "No text-to-speech on this machine (on Linux, install espeak-ng)." });
    if (!spec.audio.text?.trim()) return res.status(400).json({ error: "Type what the bot should say." });
    fs.mkdirSync(dir, { recursive: true });
    scriptPath = path.join(dir, "script.txt");
    fs.writeFileSync(scriptPath, spec.audio.text);
    if (spec.reference?.kind === "script") referencePath = null; // the CLI uses the script
  }

  let audioPath = null;
  if (mode === "two-bot" && !scriptPath) {
    audioPath = spec.audio?.kind === "upload" && spec.audio.base64 ? saveUpload(dir, spec.audio.name, spec.audio.base64) : SAMPLE_AUDIO;
    if (!exists(audioPath)) return res.status(400).json({ error: "Build the sample first (Get sample clip), or upload audio." });
  }

  current = job;
  res.json({ id: job.id });

  const env = { MEETSTREAM_API_KEY: keys.MEETSTREAM_API_KEY, NGROK_AUTHTOKEN: keys.NGROK_AUTHTOKEN, MEETING_LINK: spec.meetingLink ?? "" };
  // Paths are handed to the CLI relative to its working folder (DATA); the
  // sample reference may live in the app bundle instead, so fall back to absolute.
  const rel = (p) => (p.startsWith(DATA) ? path.relative(DATA, p) : p);
  try {
    let botId = spec.botId;
    if (mode !== "existing") {
      const args = ["record"];
      if (mode === "recorder") {
        args.push("--listener-only", "--bot-name", spec.botName?.trim() || "Benchmark Recorder", "--max-minutes", String(spec.maxMinutes || 30));
      } else {
        if (scriptPath) args.push("--script", rel(scriptPath));
        else args.push("--audio", rel(audioPath));
      }
      if (referencePath) args.push("--reference", rel(referencePath));
      else if (noReference && mode === "two-bot") args.push("--no-reference");
      setState(job, { phase: "joining" });
      const code = await runStep(job, args, env);
      botId = job.state.bots.recorder;
      if (code !== 0 || !botId || job.state.phase !== "recorded") throw new Error(job.stopped ? "Stopped before anything was recorded." : "Recording did not finish; see the log.");
    }
    setState(job, { phase: "processing" });
    const args = ["benchmark", "--bot-id", botId, "--providers", providers.join(",")];
    if (referencePath) args.push("--reference", rel(referencePath));
    else if (noReference) args.push("--no-reference"); // not the one saved with the recording
    const code = await runStep(job, args, env);
    if (code !== 0 || !job.state.runId) throw new Error("The benchmark did not finish; see the log.");
    setState(job, { phase: "done" });
  } catch (err) {
    setState(job, { phase: "failed", error: err.message });
  } finally {
    job.done = true;
    emit(job, "end", job.state);
    for (const c of job.clients) c.end();
  }
});

app.get("/api/jobs/:id/events", (req, res) => {
  const job = current && current.id === req.params.id ? current : null;
  if (!job) return res.sendStatus(404);
  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  for (const line of job.log) res.write(`event: log\ndata: ${JSON.stringify(line)}\n\n`);
  res.write(`event: state\ndata: ${JSON.stringify(job.state)}\n\n`);
  if (job.done) { res.write(`event: end\ndata: ${JSON.stringify(job.state)}\n\n`); return res.end(); }
  job.clients.add(res);
  req.on("close", () => job.clients.delete(res));
});

// Recorder-only runs end when the recorder leaves; "Stop recording" removes it,
// and the run carries on to the benchmark. Any other run is cancelled.
app.post("/api/jobs/:id/stop", async (req, res) => {
  const job = current && current.id === req.params.id ? current : null;
  if (!job || job.done) return res.status(404).json({ error: "No run in progress." });
  const recorder = job.state.bots.recorder;
  if (job.spec.mode === "recorder" && job.state.phase === "recording" && recorder) {
    process.env.MEETSTREAM_API_KEY = keys.MEETSTREAM_API_KEY;
    const api = require("./src/api");
    try {
      await api.removeBot(recorder);
      emit(job, "log", "  Stopped from the browser: recorder removed; transcribing next.");
      return res.json({ stopped: "recording" });
    } catch (err) {
      return res.status(502).json({ error: api.describeError(err) });
    }
  }
  // Cancel. Remove the run's bots from here first: on Windows kill() ends the
  // child at once, so its own clean-up would not get to run.
  job.stopped = true;
  process.env.MEETSTREAM_API_KEY = keys.MEETSTREAM_API_KEY;
  const api = require("./src/api");
  const bots = Object.values(job.state.bots).filter(Boolean);
  await Promise.all(bots.map((id) => api.removeBot(id).catch(() => {})));
  if (bots.length) emit(job, "log", `  Stopped from the browser: removed ${bots.length} bot${bots.length === 1 ? "" : "s"} from the call.`);
  job.child?.kill();
  res.json({ stopped: "run" });
});

/**
 * Starts the server on 127.0.0.1. Port 0 picks a free port (the desktop app
 * does that, so it never collides with anything already running).
 * @returns {Promise<{ server: import("http").Server, port: number }>}
 */
function start({ port = PORT, store = null } = {}) {
  keyStore = store;
  const saved = store?.load() ?? {};
  for (const name of Object.keys(keys)) if (!keys[name] && saved[name]) keys[name] = saved[name];
  return new Promise((resolve, reject) => {
    const server = app.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port }));
    server.on("error", reject);
  });
}

module.exports = { start, DATA };

if (require.main === module) {
  start().then(({ port }) => {
    console.log(`\n  Transcription benchmark UI → http://localhost:${port}\n`);
    if (!keys.MEETSTREAM_API_KEY) console.log("  No MEETSTREAM_API_KEY in .env: you can paste it into the page.\n");
  });
}
