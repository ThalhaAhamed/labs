/**
 * Runs the whole benchmark step against a stubbed MeetStream API, so the
 * orchestration (submit together, poll, fetch, score, write files) is checked
 * without a key, a meeting or any network.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const api = require("../src/api");

const REFERENCE = "MISTER QUILTER IS THE APOSTLE OF THE MIDDLE CLASSES";
const OUTPUTS = {
  meetstream: "Mr. Quilter is the apostle of the middle classes.",
  deepgram: "Mister Quilter is the apostle of the middle class.",
  assemblyai: "Mr. Quilter is an apostle of the middle classes and",
};

test("benchmark submits every provider, times them, scores them and reports the ones that could not run", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");

  // Each provider finishes on a different poll; sarvam is not configured on
  // the account and jigsawstack never finishes.
  const jobs = new Map();
  let polls = 0;
  const finishOnPoll = { meetstream: 1, deepgram: 2, assemblyai: 3, jigsawstack: Infinity };
  api.getBotStatus = async () => "Done";
  api.transcribe = async (botId, provider) => {
    const name = Object.keys(provider)[0];
    if (name === "sarvam") {
      const err = new Error("Request failed");
      err.response = { status: 400, data: { detail: "Sarvam is not configured for this account" } };
      throw err;
    }
    const id = `t-${name}-${jobs.size}`;
    jobs.set(id, name);
    return { bot_id: botId, transcript_id: id, provider: name };
  };
  api.listTranscriptions = async () => {
    polls++;
    return [...jobs].map(([id, name]) => ({
      transcript_id: id,
      provider: name,
      status: polls % 3 >= finishOnPoll[name] % 3 && polls >= finishOnPoll[name] ? "Success" : "Processing",
    }));
  };
  api.getTranscript = async (id) => [{ speaker: "A", start_time: 0, transcript: OUTPUTS[jobs.get(id)] }];

  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({
        botId: "bot-1",
        referencePath: "reference.txt",
        providers: ["meetstream", "deepgram", "assemblyai", "sarvam", "jigsawstack"],
        rounds: 2,
        pollSeconds: 0.01,
        timeoutMinutes: 0.005,
      });
    } finally {
      console.log = log;
    }

    const results = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
    const by = Object.fromEntries(results.providers.map((r) => [r.provider, r]));

    assert.equal(by.meetstream.wer, 0);
    assert.equal(by.deepgram.wer, 1 / 9);
    // the->an; the trailing "and" comes after the clip's last word, so it is
    // cut as outside the clip rather than counted.
    assert.equal(by.assemblyai.wer, 1 / 9);
    assert.equal(by.assemblyai.outside_clip_words, 1);
    assert.equal(by.assemblyai.wer_untrimmed, 2 / 9);
    // MeetStream runs each provider once per recording, so a provider that
    // succeeded is not resubmitted in round 2 (it would only be refused).
    assert.equal(by.meetstream.rounds, 1);
    assert.equal(by.deepgram.rounds, 1);
    assert.equal(by.deepgram.succeeded, 1);
    assert.ok(by.meetstream.turnaround_median_s <= by.deepgram.turnaround_median_s);

    assert.equal(by.sarvam.ran, false);
    assert.match(by.sarvam.reason, /HTTP 400.*not configured/);
    assert.equal(by.jigsawstack.ran, false);
    assert.match(by.jigsawstack.reason, /no result after/);

    // Ranked by WER, providers that did not run last.
    assert.deepEqual(results.providers.map((r) => r.provider).slice(0, 3), ["meetstream", "deepgram", "assemblyai"]);

    const md = fs.readFileSync(path.join(runDir, "results.md"), "utf8");
    assert.match(md, /\| Mia Transcribe \| 0\.0% \|/);
    assert.match(md, /\| Sarvam \| not run \|/);
    assert.match(md, /`S the→an`/);

    // Everything needed to re-score offline is inside the run directory.
    const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    assert.deepEqual(run.providers.deepgram, { deepgram: { model: "nova-3", language: "en" } });
    for (const job of run.jobs.filter((j) => j.status === "Success")) {
      assert.ok(fs.existsSync(path.join(runDir, job.transcript_file)));
    }

    // And re-scoring gives the same numbers.
    const { score } = require("../src/report");
    fs.rmSync(path.join(runDir, "results.json"));
    assert.deepEqual(score(runDir).results.providers.map((r) => r.wer), results.providers.map((r) => r.wer));
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a bot that already spent its one meetstream run is scored from that run's transcript", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");

  api.getBotStatus = async () => "Done";
  api.transcribe = async () => {
    const err = new Error("Request failed");
    err.response = { status: 409, data: { error: "MeetStream transcription has already been used for this bot. This provider can only be used once per bot." } };
    throw err;
  };
  api.listTranscriptions = async () => [
    { transcript_id: "earlier", provider: "meetstream", status: "Success", created_at: "2026-09-28T11:12:33Z", config: { language: "auto" } },
    { transcript_id: null, provider: "meeting_captions", status: "Success" },
  ];
  api.getTranscript = async () => ({ message: [{ participant: { name: "A" }, words: [{ text: OUTPUTS.meetstream }] }] });

  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({ botId: "bot-2", referencePath: "reference.txt", providers: ["meetstream"], rounds: 3, pollSeconds: 0.01, timeoutMinutes: 0.005 });
    } finally {
      console.log = log;
    }
    const { providers: [row] } = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
    assert.equal(row.ran, true);
    assert.equal(row.wer, 0);
    assert.equal(row.rounds, 1);
    assert.equal(row.turnaround_median_s, null);
    assert.match(row.notes[0], /already run on this bot.*turnaround not measured/);
    assert.match(fs.readFileSync(path.join(runDir, "results.md"), "utf8"), /\| Mia Transcribe \| 0\.0% \|.*\| – \|/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("an earlier transcript made with a different model isn't scored under this provider's name", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");
  api.getBotStatus = async () => "Done";
  api.transcribe = async () => ({ transcript_id: "again" });
  api.listTranscriptions = async () => [
    { transcript_id: "again", provider: "deepgram", status: "Failed", error: "Equivalent retranscription work was already claimed" },
    { transcript_id: "old", provider: "deepgram", status: "Success", config: { model: "nova-2", language: "en" } },
  ];
  api.getTranscript = async () => [{ start_time: 0, transcript: OUTPUTS.deepgram }];

  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({ botId: "bot-10", referencePath: "reference.txt", providers: ["deepgram"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005 });
    } finally {
      console.log = log;
    }
    const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    const job = run.jobs.find((j) => j.provider === "deepgram");
    assert.notEqual(job.status, "Success");
    assert.equal(job.reused, undefined);
    assert.match(job.note, /different settings.*nova-2/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a provider the transcribe endpoint refuses is scored from its live run, with the post-call timing marked", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");
  fs.mkdirSync("recordings");
  fs.writeFileSync("recordings/bot-3.json", JSON.stringify({
    bot_id: "bot-3", meeting_platform: "meet.google.com", live_provider: "assemblyai",
    live_transcript: { provider: "assemblyai", transcript_id: "live-aai", status: "Success", turnaround_after_leaving_s: 42.5 },
    clip: { path: "sample/clip.wav", sha256: "0".repeat(64), seconds: 191.4 },
    reference: { path: "reference.txt", sha256: "0".repeat(64) },
  }));

  api.getBotStatus = async () => "Done";
  api.transcribe = async () => {
    const err = new Error("Request failed");
    err.response = { status: 400, data: { error: "No API key configured for provider 'assemblyai'." } };
    throw err;
  };
  api.listTranscriptions = async () => [{ transcript_id: "live-aai", provider: "assemblyai", status: "Success", created_at: "2026-09-28T16:53:02Z" }];
  api.getTranscript = async () => [{ start_time: 0, transcript: OUTPUTS.assemblyai }];

  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({ botId: "bot-3", providers: ["assemblyai"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005 });
    } finally {
      console.log = log;
    }
    const { providers: [row] } = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
    assert.equal(row.ran, true);
    assert.equal(row.turnaround_median_s, null);
    assert.equal(row.post_call_turnaround_s, 42.5);
    assert.match(row.notes[0], /transcribe endpoint refused it.*finished 42\.5s after the bots left/);
    const md = fs.readFileSync(path.join(runDir, "results.md"), "utf8");
    assert.match(md, /\| AssemblyAI \|.*\| 42\.5s after call † \|/);
    assert.match(md, /^† Ran live on the recording bot/m);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("a job that fails inside MeetStream before reaching the provider is resubmitted once", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");
  const jobs = new Map();
  api.getBotStatus = async () => "Done";
  api.transcribe = async () => {
    const id = `t-${jobs.size}`;
    jobs.set(id, jobs.size === 0 ? "Failed" : "Success");
    return { transcript_id: id };
  };
  api.listTranscriptions = async () => [...jobs].map(([id, status]) => ({
    transcript_id: id, provider: "deepgram", status,
    ...(status === "Failed" ? { error: "Retranscription failed before provider submission" } : {}),
  }));
  api.getTranscript = async () => [{ start_time: 0, transcript: OUTPUTS.deepgram }];
  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({ botId: "bot-4", referencePath: "reference.txt", providers: ["deepgram"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005 });
    } finally {
      console.log = log;
    }
    const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    assert.equal(run.jobs.length, 2);
    assert.equal(run.jobs[0].superseded, true);
    assert.equal(run.jobs[1].attempt, 2);
    const { providers: [row] } = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
    assert.equal(row.ran, true);
    assert.equal(row.failed_rounds.length, 0);
    assert.equal(row.wer, 1 / 9);
    assert.match(row.notes.join(" "), /earlier attempt failed \(Retranscription failed before provider submission\) and was replaced/);
    assert.match(row.notes.join(" "), /resubmitted once/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--append adds a provider to an existing run and replaces its failed job there", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");
  api.getBotStatus = async () => "Done";
  let n = 0;
  const status = {};
  api.transcribe = async (_bot, provider) => {
    const name = Object.keys(provider)[0];
    const id = `t-${n++}`;
    status[id] = { name, status: name === "jigsawstack" && n === 1 ? "Failed" : "Success" };
    return { transcript_id: id };
  };
  api.listTranscriptions = async () => Object.entries(status).map(([id, s]) => ({ transcript_id: id, provider: s.name, status: s.status, error: s.status === "Failed" ? "some other MeetStream failure" : undefined }));
  api.getTranscript = async (id) => [{ start_time: 0, transcript: OUTPUTS[status[id].name === "jigsawstack" ? "meetstream" : status[id].name] }];
  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({ botId: "bot-5", referencePath: "reference.txt", providers: ["jigsawstack", "deepgram"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005 });
      let r = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
      assert.equal(r.providers.find((p) => p.provider === "jigsawstack").ran, false);
      const again = await benchmark({ botId: "bot-5", referencePath: "reference.txt", providers: ["jigsawstack"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005, appendTo: runDir });
      assert.equal(again, runDir);
    } finally {
      console.log = log;
    }
    const r = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
    const by = Object.fromEntries(r.providers.map((p) => [p.provider, p]));
    assert.equal(by.jigsawstack.ran, true);
    assert.equal(by.jigsawstack.wer, 0);
    assert.match(by.jigsawstack.notes.join(" "), /submitted on its own after the rest of this run/);
    assert.equal(by.deepgram.ran, true); // untouched by the append
    const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    assert.equal(run.jobs.filter((j) => j.provider === "jigsawstack").length, 2);
    assert.equal(run.jobs.find((j) => j.provider === "jigsawstack" && j.status === "Failed").superseded, true);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("--append refuses a run of a different recording", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  fs.writeFileSync("reference.txt", REFERENCE + "\n");
  fs.mkdirSync("results/r1", { recursive: true });
  fs.writeFileSync("results/r1/run.json", JSON.stringify({ run_id: "r1", bot: { id: "other-bot" }, jobs: [] }));
  try {
    const { benchmark } = require("../src/benchmark");
    await assert.rejects(
      benchmark({ botId: "bot-6", referencePath: "reference.txt", providers: ["deepgram"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005, appendTo: "results/r1" }),
      /is a run of bot other-bot, not bot-6/
    );
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
