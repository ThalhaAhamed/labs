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

/**
 * MeetStream runs each provider at most once per recording, and says so in
 * two ways (neither is in its docs):
 *   - `meetstream` a second time: HTTP 409 "can only be used once per bot";
 *   - any provider again with the same config: the job is accepted, then
 *     fails with "Equivalent retranscription work was already claimed".
 * So repeat rounds on one recording are impossible (repeat by recording
 * again), and the recorder spends the listener's live transcript on meeting
 * captions to leave every provider's one run for the benchmark to time.
 */
function alreadyRun(job) {
  return (
    (job.status === "NotRun" && /^HTTP 409/.test(job.error ?? "") && /once per bot/i.test(job.error)) ||
    (job.status === "Failed" && /already claimed/i.test(job.error ?? ""))
  );
}

const sameConfig = (a, b) => {
  const canon = (o) => JSON.stringify(Object.keys(o ?? {}).sort().map((k) => [k, o[k]]));
  return canon(a) === canon(b);
};

/**
 * For a provider that already ran on this bot (it was benchmarked before, or
 * recorded outside this harness), score the transcript that earlier run
 * produced rather than dropping the provider. Accuracy is comparable, being
 * the same recording and config; turnaround is not measured.
 */
async function reuseEarlierRuns(botId, batch, recording) {
  const spent = batch.filter((j) => alreadyRun(j) || j.status === "NotRun");
  if (!spent.length) return;
  const existing = await api.listTranscriptions(botId).catch(() => []);
  for (const job of spent) {
    const inner = Object.values(PROVIDERS[job.provider])[0];
    const prior =
      existing.find((t) => t.provider === job.provider && t.status === "Success" && t.transcript_id && sameConfig(t.config, inner)) ??
      existing.find((t) => t.provider === job.provider && t.status === "Success" && t.transcript_id);
    if (!prior) continue;
    const why = alreadyRun(job) ? "already run on this bot" : "the transcribe endpoint refused it";
    job.note = `${why} (${job.error.replace(/^HTTP \d+: /, "")}); scored the earlier transcript ${prior.transcript_id} from ${prior.created_at ?? "earlier"}${sameConfig(prior.config, inner) ? "" : ` whose config was ${JSON.stringify(prior.config)}`}, turnaround not measured`;
    job.status = "Success";
    job.transcript_id = prior.transcript_id;
    job.reused = true;
    // The recorder timed this provider's live run from the bots leaving.
    const live = recording?.live_transcript;
    if (live?.transcript_id === prior.transcript_id && typeof live.turnaround_after_leaving_s === "number") {
      job.turnaround_after_leaving_s = live.turnaround_after_leaving_s;
      job.note += `; its live run finished ${live.turnaround_after_leaving_s}s after the bots left the call (post-call processing included, so not comparable with the other turnarounds)`;
    }
    for (const k of ["error", "turnaround_s", "turnaround_lower_bound_s", "completed_at"]) delete job[k];
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
      if (entry.error) job.error = entry.error;
      console.log(`   ${job.provider.padEnd(12)} ${entry.status.padEnd(8)} ${job.turnaround_s}s${entry.error ? `  ${entry.error}` : ""}`);
    }
    lastPoll = now;
  }
  for (const job of pending()) {
    job.status = "TimedOut";
    job.error = `no result after ${timeoutMs / 60_000} minutes`;
  }
}

/**
 * A job that fails inside MeetStream before the provider ever sees it (e.g.
 * "Retranscription failed before provider submission") says nothing about the
 * provider, so it is resubmitted once. Both attempts stay in run.json.
 */
function failedBeforeProvider(job) {
  return job.status === "Failed" && /before provider submission/i.test(job.error ?? "");
}

async function benchmark({ botId, referencePath, noReference = false, providers, rounds, pollSeconds, timeoutMinutes, appendTo }) {
  const recordingPath = path.join("recordings", `${botId}.json`);
  const recording = fs.existsSync(recordingPath) ? JSON.parse(fs.readFileSync(recordingPath, "utf8")) : null;
  // Without --reference, use the one saved with the recording, unless
  // --no-reference asks for turnaround and cost only.
  referencePath = noReference ? null : referencePath ?? recording?.reference?.path;
  if (referencePath && !fs.existsSync(referencePath)) throw new Error(`Reference ${referencePath} not found.`);
  if (!referencePath) console.log("  No reference transcript: reporting turnaround only (pass --reference to score accuracy).");

  // --append adds providers to an existing run of the same recording (e.g. to
  // re-run one that failed) instead of starting a new results folder.
  const existing = appendTo ? JSON.parse(fs.readFileSync(path.join(appendTo, "run.json"), "utf8")) : null;
  if (existing && existing.bot.id !== botId) {
    throw new Error(`${appendTo} is a run of bot ${existing.bot.id}, not ${botId}`);
  }
  const runId = existing?.run_id ?? new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
  const runDir = appendTo ?? path.join("results", runId);
  fs.mkdirSync(path.join(runDir, "transcripts"), { recursive: true });
  if (!existing && referencePath) fs.copyFileSync(referencePath, path.join(runDir, "reference.txt"));

  console.log(`  Bot        ${botId}`);
  console.log(`  Reference  ${referencePath ?? "none (turnaround only)"}`);
  console.log(`  Providers  ${providers.join(", ")}`);
  console.log(`  Rounds     ${rounds}   (poll every ${pollSeconds}s)\n`);

  const botStatus = await waitForRecording(botId);

  const jobs = [];
  const done = new Set(); // providers MeetStream will not run again on this bot
  for (let round = 1; round <= rounds; round++) {
    const roundProviders = providers.filter((p) => !done.has(p));
    if (!roundProviders.length) break;
    console.log(`  Round ${round}/${rounds}: submitting ${roundProviders.length} providers at once`);
    const batch = await Promise.all(roundProviders.map((p) => submit(botId, p, round)));
    for (const job of batch.filter((j) => j.status === "NotRun" && !alreadyRun(j))) {
      console.log(`   ${job.provider.padEnd(12)} not run  ${job.error}`);
    }
    await pollUntilDone(botId, batch, pollSeconds * 1000, timeoutMinutes * 60_000);

    const retry = batch.filter(failedBeforeProvider);
    if (retry.length) {
      console.log(`   resubmitting ${retry.map((j) => j.provider).join(", ")} (failed inside MeetStream before reaching the provider)`);
      const again = await Promise.all(retry.map((j) => submit(botId, j.provider, round)));
      await pollUntilDone(botId, again, pollSeconds * 1000, timeoutMinutes * 60_000);
      for (const j of again) {
        j.attempt = 2;
        j.note = "first attempt failed inside MeetStream before reaching the provider and was resubmitted once; timed from the resubmission";
      }
      for (const j of retry) j.superseded = true;
      batch.push(...again);
    }
    // A provider that ran (or was refused as already run) is finished with
    // this recording; a later round would only be refused.
    for (const job of batch) if (job.status === "Success" || alreadyRun(job)) done.add(job.provider);
    if (round === 1) {
      await reuseEarlierRuns(botId, batch, recording);
    } else {
      // Refusals of a repeat round are expected, not failures worth reporting.
      for (let i = batch.length - 1; i >= 0; i--) if (alreadyRun(batch[i])) batch.splice(i, 1);
    }

    for (const job of batch.filter((j) => j.status === "Success")) {
      if (existing) {
        job.appended = true;
        job.note = [job.note, `submitted on its own after the rest of this run (${existing.started_at}), not alongside the other providers`].filter(Boolean).join("; ");
      }
      try {
        const data = await api.getTranscript(job.transcript_id);
        job.transcript_file = `transcripts/${job.provider}.r${round}${existing ? ".appended" : job.attempt ? `.a${job.attempt}` : ""}.json`;
        fs.writeFileSync(path.join(runDir, job.transcript_file), JSON.stringify(data, null, 2));
      } catch (err) {
        job.status = "FetchFailed";
        job.error = api.describeError(err);
        continue;
      }
      // The provider's own response: it carries what the provider bills on
      // (audio duration, or JigsawStack's token usage), so cost is computed
      // from the real call rather than estimated. Not fatal if unavailable.
      try {
        const raw = await api.getTranscript(job.transcript_id, { raw: true });
        job.raw_file = job.transcript_file.replace(/\.json$/, ".raw.json");
        fs.writeFileSync(path.join(runDir, job.raw_file), JSON.stringify(raw, null, 2));
      } catch (err) {
        job.raw_error = api.describeError(err);
      }
    }
    jobs.push(...batch);
    console.log("");
  }

  const newJobs = jobs.map(({ _t0, ...j }) => j);
  const run = existing ? {
    ...existing,
    providers: { ...existing.providers, ...Object.fromEntries(providers.map((p) => [p, PROVIDERS[p]])) },
    // An appended provider replaces its earlier jobs in the table; they stay on record here.
    jobs: [...existing.jobs.map((j) => (providers.includes(j.provider) ? { ...j, superseded: true } : j)), ...newJobs],
  } : {
    run_id: runId,
    harness: "meetstream-ai/labs transcription-provider-benchmark",
    started_at: jobs[0]?.submitted_at,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, poll_seconds: pollSeconds },
    bot: { id: botId, status_when_benchmarked: botStatus },
    recording, // null when benchmarking a bot this harness did not record
    reference: referencePath ? { file: "reference.txt", source: referencePath, sha256: sha256File(referencePath) } : null,
    providers: Object.fromEntries(providers.map((p) => [p, PROVIDERS[p]])),
    rounds,
    jobs: newJobs,
  };
  fs.writeFileSync(path.join(runDir, "run.json"), JSON.stringify(run, null, 2) + "\n");

  const { markdown } = score(runDir);
  console.log(markdown);
  console.log(`  Results -> ${path.join(runDir, "results.md")}\n`);
  return runDir;
}

module.exports = { benchmark };
