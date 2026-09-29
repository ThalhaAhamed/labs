// Transcription Benchmark UI. Talks to server.js, which runs the same
// `record` / `benchmark` commands as the CLI and streams their progress.

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) node.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null) node.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return node;
};

async function api(path, opts = {}) {
  const res = await fetch(path, {
    ...opts,
    headers: { "Content-Type": "application/json", ...(opts.headers ?? {}) },
    body: opts.body && typeof opts.body !== "string" ? JSON.stringify(opts.body) : opts.body,
  });
  const text = await res.text();
  const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data;
}

const NAMES = { meetstream: "MeetStream", jigsawstack: "JigsawStack", assemblyai: "AssemblyAI", deepgram: "Deepgram", sarvam: "Sarvam" };
const nameOf = (k) => NAMES[k] ?? k;
const pct = (x) => (x == null ? "–" : `${(x * 100).toFixed(1)}%`);
const secs = (x) => (x == null ? "–" : `${x.toFixed(1)} s`);
const usd = (x) => (x == null ? "–" : `$${x < 0.01 ? x.toFixed(4) : x.toFixed(3)}`);
const perHour = (x) => (x == null ? "–" : `$${x.toFixed(2)}/hr`);

let status = { hasKey: false, hasNgrok: false, sampleReady: false };

// ── Views ───────────────────────────────────────────────────────────────────

function show(view) {
  for (const v of ["setupView", "liveView", "resultView"]) $(`#${v}`).hidden = v !== view;
  if (view !== "resultView") $$("#runList button").forEach((b) => b.removeAttribute("aria-current"));
  window.scrollTo({ top: 0 });
}

// ── Status and keys ─────────────────────────────────────────────────────────

async function refreshStatus() {
  status = await api("/api/status");
  $("#keyDot").className = `dot ${status.hasKey ? "ok" : "missing"}`;
  $("#keyLabel").textContent = status.hasKey ? "MeetStream key set" : "MeetStream key needed";
  updateSetup();
  return status;
}

$("#keysButton").addEventListener("click", () => {
  show("setupView");
  $("#keysCard").hidden = false;
  $("#apiKey").focus();
});

$("#saveKeys").addEventListener("click", async () => {
  const body = { MEETSTREAM_API_KEY: $("#apiKey").value, NGROK_AUTHTOKEN: $("#ngrokToken").value };
  await api("/api/keys", { method: "POST", body });
  $("#apiKey").value = "";
  $("#ngrokToken").value = "";
  await refreshStatus();
});

// ── Setup form ──────────────────────────────────────────────────────────────

const mode = () => $('input[name="mode"]:checked').value;
const audioKind = () => $('input[name="audio"]:checked').value;
const refKind = () => $('input[name="reference"]:checked').value;
let lastMode = null;

function updateSetup() {
  const m = mode();
  for (const box of $$(".mode-fields")) box.hidden = box.dataset.mode !== m;

  // A sensible reference default when the source changes: the sample's
  // transcript goes with the sample clip; otherwise none until one is given.
  if (m !== lastMode) {
    const ref = m === "two-bot" && audioKind() === "sample" ? "sample" : "none";
    $(`input[name="reference"][value="${ref}"]`).checked = true;
    lastMode = m;
  }
  $("#referenceText").hidden = refKind() !== "text";

  const needsSample = (m === "two-bot" && audioKind() === "sample") || refKind() === "sample";
  $("#sampleBox").hidden = !needsSample;
  $("#sampleBox").classList.toggle("ok", status.sampleReady);
  $("#sampleStatus").textContent = status.sampleReady
    ? "Sample clip ready: 191 s, 420 words (LibriSpeech, CC BY 4.0)."
    : "The sample clip hasn't been built yet (downloads about 10 MB once).";
  $("#buildSample").hidden = status.sampleReady;

  $("#keysCard").hidden = status.hasKey && !(m === "two-bot" && !status.hasNgrok);
  $("#ngrokField").hidden = m !== "two-bot";
}

$$('input[name="mode"], input[name="audio"], input[name="reference"]').forEach((i) => i.addEventListener("change", () => {
  if (i.name === "audio") $(`input[name="reference"][value="${audioKind() === "sample" ? "sample" : "none"}"]`).checked = true;
  updateSetup();
}));

$("#buildSample").addEventListener("click", async (e) => {
  e.target.disabled = true;
  $("#sampleStatus").textContent = "Building the sample clip…";
  try {
    await api("/api/sample", { method: "POST" });
  } catch (err) {
    $("#sampleStatus").textContent = `Couldn't build it: ${err.message}`;
  }
  e.target.disabled = false;
  await refreshStatus();
});

$("#loadBots").addEventListener("click", async (e) => {
  e.target.disabled = true;
  const picker = $("#botPicker");
  try {
    const { bots } = await api("/api/bots");
    picker.replaceChildren(
      el("option", { value: "" }, `${bots.length} recent bots, pick one…`),
      ...bots.map((b) => el("option", { value: b.bot_id },
        `${b.created_at ? new Date(b.created_at).toLocaleString() : "?"} · ${b.name ?? "bot"} · ${b.status ?? ""} · ${b.bot_id.slice(0, 8)}…`)),
    );
    picker.hidden = false;
  } catch (err) {
    $("#setupError").textContent = err.message;
  }
  e.target.disabled = false;
});
$("#botPicker").addEventListener("change", (e) => { if (e.target.value) $("#botId").value = e.target.value; });

$("#refFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) $("#refText").value = await file.text();
});

async function loadProviders() {
  const { providers, pricesAsOf } = await api("/api/providers");
  $("#providerList").replaceChildren(...providers.map((p) =>
    el("label", { class: "provider" },
      el("input", { type: "checkbox", name: "provider", value: p.key, checked: true }),
      el("div", {}, el("strong", {}, nameOf(p.key)), el("span", {}, p.rate ?? "")))));
  $("#pricesNote").textContent = `Prices as published on ${pricesAsOf}. Every provider except MeetStream needs its key added in the MeetStream dashboard under Integrations → Transcription.`;
}

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

$("#runButton").addEventListener("click", async () => {
  const err = $("#setupError");
  err.textContent = "";
  const m = mode();
  const fields = $(`.mode-fields[data-mode="${m}"]`);
  const spec = {
    mode: m,
    providers: $$('input[name="provider"]:checked').map((i) => i.value),
    reference: { kind: refKind(), text: refKind() === "text" ? $("#refText").value : undefined },
  };
  if (m === "existing") spec.botId = $("#botId").value.trim();
  else spec.meetingLink = $(".meetingLink", fields).value.trim();
  if (m === "recorder") { spec.botName = $("#botName").value; spec.maxMinutes = Number($("#maxMinutes").value) || 30; }
  if (spec.reference.kind === "text" && !spec.reference.text?.trim()) return (err.textContent = "Paste the transcript, or choose None.");

  const button = $("#runButton");
  button.disabled = true;
  try {
    if (m === "two-bot") {
      if (audioKind() === "upload") {
        const file = $("#audioFile").files[0];
        if (!file) throw new Error("Choose an audio file, or use the sample clip.");
        button.textContent = "Uploading audio…";
        spec.audio = { kind: "upload", name: file.name, base64: await readAsBase64(file) };
      } else spec.audio = { kind: "sample" };
    }
    const { id } = await api("/api/jobs", { method: "POST", body: spec });
    follow(id, m);
  } catch (e) {
    err.textContent = e.message;
  } finally {
    button.disabled = false;
    button.textContent = "Run benchmark";
  }
});

$("#newRun").addEventListener("click", () => { show("setupView"); refreshStatus(); });

// ── Live run ────────────────────────────────────────────────────────────────

const STEPS = {
  existing: [["processing", "Recording ready"], ["transcribing", "Transcribing"], ["done", "Results"]],
  "two-bot": [["joining", "Bots joining"], ["recording", "Playing the clip"], ["processing", "Processing recording"], ["transcribing", "Transcribing"], ["done", "Results"]],
  recorder: [["joining", "Bot joining"], ["recording", "Recording"], ["processing", "Processing recording"], ["transcribing", "Transcribing"], ["done", "Results"]],
};
const PHASE_ALIAS = { starting: "joining", "waiting-room": "joining", recorded: "processing" };

const MESSAGES = {
  starting: "Starting…",
  joining: "Sending the bot to the meeting…",
  "waiting-room": "Waiting in the lobby: admit the bot in your meeting.",
  recording: null, // set per mode below
  recorded: "Recording saved. MeetStream is processing it…",
  processing: "MeetStream is processing the recording (usually about a minute)…",
  transcribing: "Every provider is transcribing the same recording…",
  done: "Done.",
};

let source = null;
let currentJob = null;

function follow(jobId, m) {
  currentJob = { id: jobId, mode: m };
  show("liveView");
  $("#log").textContent = "";
  $("#providerProgress").replaceChildren();
  $("#botChips").replaceChildren();
  renderState({ phase: "starting", bots: {} });
  source?.close();
  source = new EventSource(`/api/jobs/${jobId}/events`);
  source.addEventListener("log", (e) => {
    const pre = $("#log");
    const atBottom = pre.scrollTop + pre.clientHeight >= pre.scrollHeight - 20;
    pre.textContent += JSON.parse(e.data) + "\n";
    if (atBottom) pre.scrollTop = pre.scrollHeight;
  });
  source.addEventListener("state", (e) => renderState(JSON.parse(e.data)));
  source.addEventListener("end", async (e) => {
    source.close();
    const state = JSON.parse(e.data);
    renderState(state);
    await refreshStatus();
    if (state.phase === "done" && state.runId) {
      await loadRuns();
      showRun(state.runId);
    }
  });
}

function renderState(s) {
  const m = currentJob?.mode ?? "existing";
  const steps = STEPS[m];
  const phase = PHASE_ALIAS[s.phase] ?? s.phase;
  const at = steps.findIndex(([p]) => p === phase);
  $("#stepper").replaceChildren(...steps.map(([, label], i) =>
    el("li", { class: s.phase === "failed" ? (i <= Math.max(at, 0) ? "failed" : "") : i < at ? "done" : i === at ? (phase === "done" ? "done" : "active") : "" }, label)));

  let msg = MESSAGES[s.phase] ?? "";
  if (s.phase === "recording") {
    msg = m === "recorder"
      ? "Recording. Talk now, then press Stop recording (or end the meeting)."
      : "Playing the clip into the call. Keep everyone muted.";
  }
  if (s.phase === "failed") msg = `Stopped: ${s.error ?? "see the log"}`;
  $("#liveMessage").textContent = msg;
  $("#liveMessage").className = `live-message ${s.phase === "failed" ? "error" : ""}`;

  const chips = [];
  for (const [role, id] of Object.entries(s.bots ?? {})) {
    const st = s.botStatus?.[role];
    chips.push(el("span", { class: `chip ${st === "InWaitingRoom" ? "wait" : /InMeeting|Recording/.test(st ?? "") ? "ok" : ""}` },
      el("b", {}, role === "recorder" ? "Recorder" : "Speaker"), st ?? "created", el("span", { class: "muted" }, id.slice(0, 8))));
  }
  $("#botChips").replaceChildren(...chips);
  $("#providerProgress").replaceChildren(...Object.entries(s.providers ?? {}).map(([p, st]) =>
    el("span", { class: `chip ${st === "Success" ? "ok" : "bad"}` }, el("b", {}, nameOf(p)), st === "Success" ? "done" : st)));

  $("#stopRecording").hidden = !(m === "recorder" && s.phase === "recording");
  $("#cancelRun").hidden = ["done", "failed"].includes(s.phase);
}

$("#stopRecording").addEventListener("click", async (e) => {
  e.target.disabled = true;
  try { await api(`/api/jobs/${currentJob.id}/stop`, { method: "POST" }); } catch (err) { $("#liveMessage").textContent = err.message; }
  e.target.disabled = false;
});
$("#cancelRun").addEventListener("click", async () => {
  if (!confirm("Cancel this run? Its bots will be removed from the meeting.")) return;
  try { await api(`/api/jobs/${currentJob.id}/stop`, { method: "POST" }); } catch (err) { $("#liveMessage").textContent = err.message; }
});

// ── Past runs ───────────────────────────────────────────────────────────────

async function loadRuns() {
  const { runs } = await api("/api/runs");
  const list = $("#runList");
  if (!runs.length) return list.replaceChildren(el("li", { class: "muted" }, "No runs yet."));
  list.replaceChildren(...runs.map((r) => {
    const when = r.started_at ? new Date(r.started_at) : null;
    return el("li", {}, el("button", { type: "button", "data-run": r.id, onclick: () => showRun(r.id) },
      el("span", { class: "when" }, when ? when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : r.id),
      el("span", { class: "what" }, `${r.bot_name ? `${r.bot_name} · ` : ""}${r.providers} providers · ${r.scored ? "accuracy + speed" : "speed only"}`)));
  }));
}

// ── Results ─────────────────────────────────────────────────────────────────

let sortState = null;

async function showRun(id) {
  const data = await api(`/api/runs/${id}`);
  show("resultView");
  $$("#runList button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.run === id));
  const { results, recording } = data;
  const scored = results.reference_words != null;
  const when = data.started_at ? new Date(data.started_at).toLocaleString() : id;

  $("#resultTitle").textContent = scored ? "Accuracy, speed and cost" : "Speed and cost";
  const where = recording
    ? `${recording.bot_name ? `"${recording.bot_name}" ` : ""}on ${recording.meeting_platform}, ${recording.clip ? `clip ${recording.clip.path} (${recording.clip.seconds}s)` : "live speech"}`
    : `bot ${results.bot_id}`;
  $("#resultMeta").textContent = `${when} · ${where} · ${scored ? `${results.reference_words}-word reference` : "no reference transcript"}${results.billed_audio_seconds ? ` · ${(results.billed_audio_seconds / 60).toFixed(2)} min billed audio` : ""}`;
  $("#downloads").replaceChildren(
    el("a", { class: "secondary", href: `/api/runs/${id}/download/results.md` }, "results.md"),
    el("a", { class: "secondary", href: `/api/runs/${id}/download/results.json` }, "results.json"));

  const ran = results.providers.filter((p) => p.ran);
  const best = (key, pick = Math.min) => {
    const vals = ran.map((p) => p[key]).filter((v) => v != null);
    return vals.length ? pick(...vals) : null;
  };
  const bests = {
    wer: best("wer"),
    turnaround_median_s: best("turnaround_median_s"),
    cost_usd: best("cost_usd"),
    words: best("words", Math.max),
  };
  const who = (key, v) => (v == null ? "not measured" : ran.filter((p) => p[key] === v).map((p) => nameOf(p.provider)).join(", "));
  const cards = [];
  if (scored) cards.push(["Most accurate", pct(bests.wer), who("wer", bests.wer)]);
  else cards.push(["Most words", bests.words ?? "–", who("words", bests.words)]);
  cards.push(["Fastest", secs(bests.turnaround_median_s), who("turnaround_median_s", bests.turnaround_median_s)]);
  cards.push(["Cheapest", usd(bests.cost_usd), who("cost_usd", bests.cost_usd)]);
  $("#summaryCards").replaceChildren(...cards.map(([label, value, name]) =>
    el("div", { class: "stat" }, el("div", { class: "label" }, label), el("div", { class: "value" }, value), el("div", { class: "who" }, name || "–"))));

  const columns = [
    ["provider", "Provider", (p) => nameOf(p.provider)],
    ...(scored
      ? [["wer", "WER", (p) => pct(p.wer)], ["sdi", "Sub / Del / Ins", (p) => `${p.substitutions} / ${p.deletions} / ${p.insertions}`]]
      : [["words", "Words", (p) => p.words]]),
    ["turnaround_median_s", "Turnaround", (p) => secs(p.turnaround_median_s)],
    ["cost_usd", "Cost", (p) => usd(p.cost_usd)],
    ["cost_per_hour_usd", "Per hour", (p) => perHour(p.cost_per_hour_usd)],
  ];
  sortState = { key: scored ? "wer" : "turnaround_median_s", dir: 1 };
  const renderTable = () => {
    const { key, dir } = sortState;
    const rows = [...results.providers].sort((a, b) => {
      if (a.ran !== b.ran) return a.ran ? -1 : 1;
      const va = key === "provider" ? nameOf(a.provider) : a[key];
      const vb = key === "provider" ? nameOf(b.provider) : b[key];
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
    $("#resultTable").replaceChildren(
      el("thead", {}, el("tr", {}, columns.map(([k, label]) =>
        el("th", { scope: "col", "aria-sort": k === key ? (dir > 0 ? "ascending" : "descending") : false,
          onclick: () => { if (k === "sdi") return; sortState = { key: k, dir: sortState.key === k ? -sortState.dir : k === "words" ? -1 : 1 }; renderTable(); } }, label)))),
      el("tbody", {}, rows.map((p) => el("tr", {}, p.ran
        ? columns.map(([k, , fmt]) => el("td", { class: k === "provider" ? "provider-name" : bests[k] != null && p[k] === bests[k] ? "best" : "" }, fmt(p)))
        : [el("td", { class: "provider-name" }, nameOf(p.provider)), el("td", { class: "notrun", colspan: columns.length - 1 }, `not run: ${p.reason ?? ""}`)]))));
  };
  renderTable();

  const costNote = ran.some((p) => p.cost_basis)
    ? `Cost is transcription only, at each provider's published rate on ${results.prices_as_of}${results.billed_audio_seconds ? ` for ${(results.billed_audio_seconds / 60).toFixed(2)} min of billed audio` : ""}; MeetStream's bot fee is the same whichever provider you pick, so it's left out. `
    : "Cost needs each provider's raw response; runs made before cost was added can get it with npm run fetch-raw. ";
  $("#tableNotes").textContent = `${scored ? "WER counts only words inside the clip, so talk before or after it is ignored. " : ""}Turnaround is measured from the request to the first poll that saw the result (poll every ${data.poll_seconds ?? 5} s), through MeetStream. ${costNote}`;

  const noteItems = results.providers.flatMap((p) => [
    ...(p.notes ?? []).map((n) => `${nameOf(p.provider)}: ${n}`),
    ...(p.failed_rounds ?? []).map((f) => `${nameOf(p.provider)}: round ${f.round} ${f.status}${f.error ? ` (${f.error})` : ""}`),
  ]);
  $("#notes").replaceChildren(...(noteItems.length ? [el("div", { class: "callout" }, el("strong", {}, "Notes"), el("ul", {}, noteItems.map((n) => el("li", {}, n))))] : []));

  $("#details").replaceChildren(...ran.map((p) => el("details", { class: "provider-detail" },
    el("summary", {}, nameOf(p.provider),
      el("span", { class: "muted" }, scored ? `${p.errors.length} errors · ${pct(p.wer)}` : `${p.words} words`),
      p.cost_basis ? el("span", { class: "muted" }, `· ${p.cost_basis}`) : null),
    scored && p.errors.length
      ? el("div", { class: "errors" }, p.errors.slice(0, 80).map((e) => el("span", { class: `err ${e.op}`, title: e.op === "S" ? "substituted" : e.op === "D" ? "missed" : "inserted" },
          e.op === "S" ? `${e.ref} → ${e.hyp}` : e.op === "D" ? `− ${e.ref}` : `+ ${e.hyp}`)))
      : null,
    el("pre", { class: "transcript" }, data.transcripts[p.provider] ?? "(transcript not available)"))));
}

// ── Start ───────────────────────────────────────────────────────────────────

(async () => {
  await Promise.all([refreshStatus(), loadProviders(), loadRuns()]);
  if (status.busy && status.currentJob) follow(status.currentJob, status.currentMode ?? "existing");
  else {
    const first = $("#runList button");
    if (first) showRun(first.dataset.run);
    else show("setupView");
  }
})();
