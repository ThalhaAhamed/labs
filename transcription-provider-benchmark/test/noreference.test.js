const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const api = require("../src/api");

test("without a reference transcript the run reports turnaround and word counts, not accuracy", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bench-"));
  const cwd = process.cwd();
  process.chdir(dir);
  const texts = { deepgram: "Hello everyone, thanks for joining.", sarvam: "Hello everyone thanks" };
  const jobs = new Map();
  let polls = 0;
  api.getBotStatus = async () => "Done";
  api.transcribe = async (_bot, provider) => {
    const name = Object.keys(provider)[0];
    jobs.set(`t-${name}`, name);
    return { transcript_id: `t-${name}` };
  };
  api.listTranscriptions = async () => {
    polls++;
    return [...jobs].map(([id, name]) => ({ transcript_id: id, provider: name, status: name === "deepgram" || polls > 1 ? "Success" : "Processing" }));
  };
  api.getTranscript = async (id) => [{ start_time: 0, transcript: texts[jobs.get(id)] }];

  try {
    const { benchmark } = require("../src/benchmark");
    const log = console.log;
    console.log = () => {};
    let runDir;
    try {
      runDir = await benchmark({ botId: "bot-7", providers: ["sarvam", "deepgram"], rounds: 1, pollSeconds: 0.01, timeoutMinutes: 0.005 });
    } finally {
      console.log = log;
    }
    const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
    assert.equal(run.reference, null);
    assert.equal(fs.existsSync(path.join(runDir, "reference.txt")), false);

    const results = JSON.parse(fs.readFileSync(path.join(runDir, "results.json"), "utf8"));
    const by = Object.fromEntries(results.providers.map((r) => [r.provider, r]));
    assert.equal(by.deepgram.wer, null);
    assert.equal(by.deepgram.words, 5);
    assert.equal(by.sarvam.words, 3);
    // Ranked by turnaround when there is no accuracy to rank by.
    assert.deepEqual(results.providers.map((r) => r.provider), ["deepgram", "sarvam"]);

    const md = fs.readFileSync(path.join(runDir, "results.md"), "utf8");
    assert.match(md, /Reference: none, so accuracy is not scored/);
    assert.match(md, /^\| Provider \| Words transcribed \| Turnaround \| Range \|/m);
    assert.match(md, /^\| Deepgram \| 5 \| /m);
    assert.doesNotMatch(md, /Errors by provider/);
  } finally {
    process.chdir(cwd);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
