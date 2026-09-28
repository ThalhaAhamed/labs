/**
 * Step 2: send one recording to every provider and time each one.
 *
 * All providers are submitted at the same moment against the same bot, so
 * they transcribe byte-identical audio under the same conditions. Each job is
 * then polled until MeetStream reports it finished. Everything needed to
 * re-score the run offline (raw transcripts, the reference, the exact
 * provider configs) is written into the run directory, and then scored.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const api = require("./api");
const { PROVIDERS } = require("./providers");
const { sha256File } = require("./audio");
const { score } = require("./report");

const STILL_RECORDING = new Set(["Scheduled", "Joining", "InWaitingRoom", "InMeeting", "Recording", "Leaving", "Stopped", "MediaProcessing"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Transcribe needs the finished recording, which exists once the bot is Done. */
async function waitForRecording(botId) {
  const deadline = Date.now() + 30 * 60_000;
  let last = "";
  for (;;) {
    const status = await api.getBotStatus(botId);
    if (!STILL_RECORDING.has(status)) {
      if (["Failed", "Denied", "NotAllowed"].includes(status)) {
        throw new Error(`bot ${botId} has status ${status}; there is no recording to transcribe`);
      }
      return status;
    }
    if (status !== last) console.log(`  Bot is ${status}, waiting for the recording to finish processing...`);
    last = status;
    if (Date.now() > deadline) throw new Error(`bot ${botId} still ${status} after 30 minutes`);
    await sleep(10_000);
  }
}

async function submit(botId, provider, round) {
  const job = { provider, round, config: PROVIDERS[provider], submitted_at: new Date().toISOString() };
  const t0 = Date.now();
  try {
    const res = await api.transcribe(botId, PROVIDERS[provider]);
    job.transcript_id = res.transcript_id;
    job.status = "Processing";
    job._t0 = t0;
    if (!job.transcript_id) {
      job.status = "Failed";
      job.error = `transcribe returned no transcript_id: ${JSON.stringify(res)}`;
    }
  } catch (err) {
    job.status = "NotRun";
    job.error = api.describeError(err);
  }
  return job;
}

// The API answers HTTP 409 to a second `meetstream` run on the same bot
// ("This provider can only be used once per bot"). The recorder spends the
// listener's live transcript on meeting captions so this one run is left for
// the benchmark to time; later rounds skip it.
const ONCE_PER_BOT = new Set(["meetstream"]);

/**
 * For a bot whose one `meetstream` run was already spent (e.g. it was
 * recorded outside this harness), score the transcript that run produced
 * rather than leaving the engine out. Accuracy is comparable, since it is the
 * same recording and config; turnaround is not measured.
 */
async function reuseOncePerBotTranscripts(botId, batch) {
  const spent = batch.filter((j) => j.status === "NotRun" && ONCE_PER_BOT.has(j.provider) && /^HTTP 409/.test(j.error));
  if (!spent.length) return;
  const existing = await api.listTranscriptions(botId).catch(() => []);
  for (const job of spent) {
    const prior = existing.find((t) => t.provider === job.provider && t.status === "Success" && t.transcript_id);
    if (!prior) continue;
    job.status = "Success";
    job.transcript_id = prior.transcript_id;
    job.config = prior.config ?? job.config;
    job.reused = true;
    job.note = `already run on this bot (${job.error.replace(/^HTTP 409: /, "")}); scored the existing transcript ${prior.transcript_id} from ${prior.created_at ?? "earlier"}, turnaround not measured`;
    delete job.error;
    console.log(`   ${job.provider.padEnd(12)} reusing the transcript this bot already has (turnaround not measured)`);
  }
}

async function pollUntilDone(botId, jobs, pollMs, timeoutMs) {
  const pending = () => jobs.filter((j) => j.status === "Processing");
  const deadline = Date.now() + timeoutMs;
  let lastPoll = Date.now();
  while (pending().length && Date.now() < deadline) {
    await sleep(pollMs);
    let listed;
    try {
      listed = await api.listTranscriptions(botId);
    } catch (err) {
      console.warn(`  poll failed (${api.describeError(err)}), retrying`);
      continue;
    }
    const now = Date.now();
    for (const job of pending()) {
      const entry = listed.find((t) => t.transcript_id === job.transcript_id);
      if (!entry || entry.status === "Processing") continue;
      job.status = entry.status;
      job.completed_at = new Date(now).toISOString();
      // The job finished somewhere between the previous poll and this one.
      job.turnaround_s = +((now - job._t0) / 1000).toFixed(2);
      job.turnaround_lower_bound_s = +(Math.max(0, lastPoll - job._t0) / 1000).toFixed(2);
      job.server_created_at = entry.created_at ?? null;
      console.log(`   ${job.provider.padEnd(12)} ${entry.status.padEnd(8)} ${job.turnaround_s}s`);
    }
    lastPoll = now;
  }
  for (const job of pending()) {
    job.status = "TimedOut";
    job.error = `no result after ${timeoutMs / 60_000} minutes`;
  }
}

async function benchmark({ botId, referencePath, providers, rounds, pollSeconds, timeoutMinutes }) {
  const recordingPath = path.join("recordings", `${botId}.json`);
  const recording = fs.existsSync(recordingPath) ? JSON.parse(fs.readFileSync(recordingPath, "utf8")) : null;
  referencePath = referencePath ?? recording?.reference?.path;
  if (!referencePath || !fs.existsSync(referencePath)) {
    throw new Error("No reference transcript. Pass --reference <file> (the words actually spoken in the recording).");
  }

  const runId = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const runDir = path.join("results", runId);
  fs.mkdirSync(path.join(runDir, "transcripts"), { recursive: true });
  fs.copyFileSync(referencePath, path.join(runDir, "reference.txt"));

  console.log(`  Bot        ${botId}`);
  console.log(`  Reference  ${referencePath}`);
  console.log(`  Providers  ${providers.join(", ")}`);
  console.log(`  Rounds     ${rounds}   (poll every ${pollSeconds}s)\n`);

  const botStatus = await waitForRecording(botId);

  const jobs = [];
  for (let round = 1; round <= rounds; round++) {
    // Providers that only run once per bot get one round; the rest get all.
    const roundProviders = round === 1 ? providers : providers.filter((p) => !ONCE_PER_BOT.has(p));
    if (!roundProviders.length) break;
    console.log(`  Round ${round}/${rounds}: submitting ${roundProviders.length} providers at once`);
    const batch = await Promise.all(roundProviders.map((p) => submit(botId, p, round)));
    if (round === 1) await reuseOncePerBotTranscripts(botId, batch);
    for (const job of batch.filter((j) => j.status === "NotRun")) {
      console.log(`   ${job.provider.padEnd(12)} not run  ${job.error}`);
    }
    await pollUntilDone(botId, batch, pollSeconds * 1000, timeoutMinutes * 60_000);

    for (const job of batch.filter((j) => j.status === "Success")) {
      try {
        const data = await api.getTranscript(job.transcript_id);
        job.transcript_file = `transcripts/${job.provider}.r${round}.json`;
        fs.writeFileSync(path.join(runDir, job.transcript_file), JSON.stringify(data, null, 2));
      } catch (err) {
        job.status = "FetchFailed";
        job.error = api.describeError(err);
      }
    }
    jobs.push(...batch);
    console.log("");
  }

  const run = {
    run_id: runId,
    harness: "meetstream-ai/labs transcription-provider-benchmark",
    started_at: jobs[0]?.submitted_at,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, poll_seconds: pollSeconds },
    bot: { id: botId, status_when_benchmarked: botStatus },
    recording, // null when benchmarking a bot this harness did not record
    reference: { file: "reference.txt", source: referencePath, sha256: sha256File(referencePath) },
    providers: Object.fromEntries(providers.map((p) => [p, PROVIDERS[p]])),
    rounds,
    jobs: jobs.map(({ _t0, ...j }) => j),
  };
  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(run, null, 2) + "\n");

  const { markdown } = score(runDir);
  console.log(markdown);
  console.log(`  Results -> ${path.join(runDir, "results.md")}\n`);
  return runDir;
}

module.exports = { benchmark };
