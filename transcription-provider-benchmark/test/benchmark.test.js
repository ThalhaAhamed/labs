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
    assert.equal(by.assemblyai.wer, 2 / 9); // the->an, +and
    // MeetStream's engine runs once per bot, so it gets one round; the rest get both.
    assert.equal(by.meetstream.rounds, 1);
    assert.equal(by.deepgram.succeeded, 2);
    assert.ok(by.meetstream.turnaround_median_s <= by.deepgram.turnaround_median_s);

    assert.equal(by.sarvam.ran, false);
    assert.match(by.sarvam.reason, /HTTP 400.*not configured/);
    assert.equal(by.jigsawstack.ran, false);
    assert.match(by.jigsawstack.reason, /no result after/);

    // Ranked by WER, providers that did not run last.
    assert.deepEqual(results.providers.map((r) => r.provider).slice(0, 3), ["meetstream", "deepgram", "assemblyai"]);

    const md = fs.readFileSync(path.join(runDir, "results.md"), "utf8");
    assert.match(md, /\| meetstream \| 0\.0% \|/);
    assert.match(md, /\| sarvam \| not run \|/);
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
    assert.match(fs.readFileSync(path.join(runDir, "results.md"), "utf8"), /\| meetstream \| 0\.0% \|.*\| – \|/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
