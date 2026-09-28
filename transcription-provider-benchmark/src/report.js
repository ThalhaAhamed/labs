/**
 * Step 3: score a run directory. Needs no API key and makes no network
 * calls, so anyone handed a published results/<run>/ folder can re-derive
 * every number in its table from the raw transcripts inside it.
 */
const fs = require("fs");
const path = require("path");
const { normalize, wer } = require("./wer");
const { transcriptText } = require("./transcript");

const NORMALIZER = "src/wer.js normalize() (see METHODOLOGY.md)";

function median(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const secs = (x) => (x == null ? "–" : `${x.toFixed(1)}s`);

function score(runDir) {
  const run = JSON.parse(fs.readFileSync(path.join(runDir, "run.json"), "utf8"));
  const reference = normalize(fs.readFileSync(path.join(runDir, run.reference.file), "utf8"));
  fs.writeFileSync(path.join(runDir, "reference.normalized.txt"), reference + "\n");
  const clipSeconds = run.recording?.clip?.seconds ?? null;

  const byProvider = new Map();
  for (const job of run.jobs) {
    if (!byProvider.has(job.provider)) byProvider.set(job.provider, []);
    byProvider.get(job.provider).push(job);
  }

  const rows = [];
  for (const [provider, jobs] of byProvider) {
    const scored = [];
    for (const job of jobs.filter((j) => j.status === "Success" && j.transcript_file)) {
      const raw = JSON.parse(fs.readFileSync(path.join(runDir, job.transcript_file), "utf8"));
      const hypothesis = normalize(transcriptText(raw));
      fs.writeFileSync(path.join(runDir, job.transcript_file.replace(/\.json$/, ".normalized.txt")), hypothesis + "\n");
      scored.push({ job, result: wer(reference, hypothesis) });
    }

    const failures = jobs.filter((j) => j.status !== "Success" || !j.transcript_file);
    if (!scored.length) {
      rows.push({ provider, ran: false, rounds: jobs.length, reason: failures[0]?.error ?? failures[0]?.status ?? "no result" });
      continue;
    }

    // Pool the edits across rounds: total errors over total reference words.
    const sum = (k) => scored.reduce((n, s) => n + s.result[k], 0);
    const refWords = sum("referenceWords");
    const turnarounds = scored.map((s) => s.job.turnaround_s).filter((x) => typeof x === "number");
    const first = scored[0].result;
    rows.push({
      provider,
      ran: true,
      rounds: jobs.length,
      succeeded: scored.length,
      failed_rounds: failures.map((j) => ({ round: j.round, status: j.status, error: j.error ?? null })),
      notes: jobs.filter((j) => j.note).map((j) => j.note),
      wer: (sum("substitutions") + sum("deletions") + sum("insertions")) / refWords,
      wer_per_round: scored.map((s) => +s.result.wer.toFixed(4)),
      substitutions: sum("substitutions"),
      deletions: sum("deletions"),
      insertions: sum("insertions"),
      reference_words: refWords,
      turnaround_median_s: median(turnarounds),
      turnaround_min_s: turnarounds.length ? Math.min(...turnarounds) : null,
      turnaround_max_s: turnarounds.length ? Math.max(...turnarounds) : null,
      real_time_factor: clipSeconds && turnarounds.length ? median(turnarounds) / clipSeconds : null,
      // Every error from the first successful round, so a reader can judge
      // whether they are real misrecognitions or normalisation artefacts.
      errors: first.alignment.filter((a) => a.op !== "="),
      config: run.providers[provider],
    });
  }

  rows.sort((a, b) => (a.ran === b.ran ? (a.wer ?? 0) - (b.wer ?? 0) : a.ran ? -1 : 1));

  const results = {
    run_id: run.run_id,
    bot_id: run.bot.id,
    reference_words: reference.split(" ").length,
    clip_seconds: clipSeconds,
    poll_seconds: run.environment.poll_seconds,
    normalizer: NORMALIZER,
    providers: rows,
  };
  fs.writeFileSync(path.join(runDir, "results.json"), JSON.stringify(results, null, 2) + "\n");

  const markdown = renderMarkdown(run, results);
  fs.writeFileSync(path.join(runDir, "results.md"), markdown);
  return { results, markdown };
}

function renderMarkdown(run, results) {
  const L = [];
  L.push(`# Transcription provider benchmark: ${run.run_id}`, "");
  L.push(`- Recording: bot \`${run.bot.id}\`${run.recording ? ` on ${run.recording.meeting_platform}, clip \`${run.recording.clip.path}\` (${run.recording.clip.seconds}s, sha256 \`${run.recording.clip.sha256.slice(0, 12)}…\`)` : ""}`);
  L.push(`- Reference: ${results.reference_words} words after normalisation (sha256 \`${run.reference.sha256.slice(0, 12)}…\`)`);
  L.push(`- Rounds: ${run.rounds}, all providers submitted together each round; turnaround polled every ${results.poll_seconds}s`);
  L.push(`- Method: see [METHODOLOGY.md](../../METHODOLOGY.md). Re-score offline with \`npm run score -- ${path.posix.join("results", run.run_id)}\``, "");

  L.push("| Provider | WER | Sub | Del | Ins | Turnaround (median) | Range | × real time |");
  L.push("|---|---:|---:|---:|---:|---:|---:|---:|");
  for (const r of results.providers) {
    if (!r.ran) {
      L.push(`| ${r.provider} | not run | | | | | | |`);
      continue;
    }
    const range = r.turnaround_min_s == null ? "–" : `${secs(r.turnaround_min_s)}–${secs(r.turnaround_max_s)}`;
    const rtf = r.real_time_factor == null ? "–" : `${r.real_time_factor.toFixed(2)}×`;
    L.push(`| ${r.provider} | ${pct(r.wer)} | ${r.substitutions} | ${r.deletions} | ${r.insertions} | ${secs(r.turnaround_median_s)} | ${range} | ${rtf} |`);
  }
  L.push("");
  L.push(`WER is pooled over all successful rounds. Turnaround is time from the transcribe request to the first poll that saw the job finished, so it overstates the true figure by up to ${results.poll_seconds}s, and it includes MeetStream's queueing, not only the provider's own processing.`);

  const notRun = results.providers.filter((r) => !r.ran || r.failed_rounds?.length);
  if (notRun.length) {
    L.push("", "## Not run or partly failed", "");
    for (const r of notRun) {
      if (!r.ran) L.push(`- **${r.provider}**: ${r.reason}`);
      else for (const f of r.failed_rounds) L.push(`- **${r.provider}** round ${f.round}: ${f.status}${f.error ? ` (${f.error})` : ""}`);
    }
  }

  const noted = results.providers.filter((r) => r.notes?.length);
  if (noted.length) {
    L.push("", "## Notes", "");
    for (const r of noted) for (const n of r.notes) L.push(`- **${r.provider}**: ${n}`);
  }

  L.push("", "## Errors by provider (first successful round)", "");
  L.push("`S ref→hyp` substitution, `D ref` deletion (missed word), `I hyp` insertion. Normalised text for each provider is in `transcripts/*.normalized.txt`.", "");
  for (const r of results.providers.filter((x) => x.ran)) {
    const shown = r.errors.slice(0, 40).map((e) =>
      e.op === "S" ? `S ${e.ref}→${e.hyp}` : e.op === "D" ? `D ${e.ref}` : `I ${e.hyp}`
    );
    L.push(`**${r.provider}** (${r.errors.length} errors)${shown.length ? ": " + shown.map((s) => `\`${s}\``).join(", ") : ""}${r.errors.length > 40 ? ", …" : ""}`, "");
  }
  return L.join("\n") + "\n";
}

module.exports = { score };
