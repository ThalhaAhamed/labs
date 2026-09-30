// Transcriber Benchmark UI. Talks to server.js, which runs the same
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

const NAMES = { meetstream: "Mia Transcribe", jigsawstack: "JigsawStack", assemblyai: "AssemblyAI", deepgram: "Deepgram", sarvam: "Sarvam" };
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
let botRec = null;          // what the app knows about the bot ID typed in (existing recording)
let lastSource = null;

// Which references fit the audio (the same rules the server enforces). The
// sample's transcript only fits the sample clip; a typed script is its own
// reference; your own audio or live speech needs your own transcript.
function referenceKinds(m, audio, rec) {
  if (m === "two-bot") return { sample: ["sample", "none"], script: ["script", "none"], upload: ["text", "none"] }[audio];
  if (m === "recorder") return ["text", "none"];
  const kinds = [];
  if (rec?.reference) kinds.push("saved");
  if (!rec?.known || rec.source === "sample") kinds.push("sample");
  return [...kinds, "text", "none"];
}
function defaultReference(m, audio, rec) {
  if (m === "two-bot") return { sample: "sample", script: "script" }[audio] ?? "none";
  if (m === "existing" && rec?.reference) return "saved";
  return "none";
}

function updateSetup() {
  const m = mode();
  for (const box of $$(".mode-fields")) box.hidden = box.dataset.mode !== m;

  // Show only the references that fit this audio, and pick the natural one
  // whenever the audio changes (or the current pick stops fitting).
  const rec = m === "existing" ? botRec : null;
  const kinds = referenceKinds(m, audioKind(), rec);
  for (const c of $$(".choice[data-ref]")) c.hidden = !kinds.includes(c.dataset.ref);
  const source = `${m}|${audioKind()}|${rec?.botId ?? ""}`;
  if (source !== lastSource || !kinds.includes(refKind())) {
    $(`input[name="reference"][value="${defaultReference(m, audioKind(), rec)}"]`).checked = true;
    lastSource = source;
  }
  $("#savedNote").textContent = rec?.reference
    ? `${SOURCE_NAMES[rec.source]}, ${rec.reference.words} words.`
    : "";
  $("#sampleNote").textContent = m === "existing" && !rec?.known
    ? "Only if this bot heard the sample clip being played."
    : "The exact words of the sample clip.";

  // Typed script: the bot speaks it with this machine's text-to-speech.
  const scripted = m === "two-bot" && audioKind() === "script";
  $("#scriptBox").hidden = !scripted;
  $('input[name="audio"][value="script"]').disabled = !status.tts;
  $("#scriptHint").textContent = status.tts
    ? `The speaker bot reads this out with this computer's text-to-speech (${status.tts}). Synthetic speech is cleaner than people talking, so accuracy reads higher than on real speech.`
    : "No text-to-speech on this computer. On Linux, install espeak-ng.";
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

$$('input[name="mode"], input[name="audio"], input[name="reference"]').forEach((i) => i.addEventListener("change", updateSetup));

// An existing bot: say what it recorded, if this app recorded it, so the
// reference can follow (its saved one, or none of the sample's for live talk).
const SOURCE_NAMES = {
  sample: "The sample clip, played by a speaker bot",
  script: "A typed script, read out by a speaker bot",
  upload: "Your own audio, played by a speaker bot",
  live: "People talking in the meeting",
};
let botLookup = 0;
async function lookUpBot() {
  const id = $("#botId").value.trim();
  const info = $("#botInfo");
  const mine = ++botLookup;
  botRec = null;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    info.hidden = true;
    return updateSetup();
  }
  let rec;
  try {
    rec = { botId: id, ...(await api(`/api/recordings/${id}`)) };
  } catch {
    rec = { botId: id, known: false };
  }
  if (mine !== botLookup) return; // a newer ID was typed meanwhile
  botRec = rec;
  info.classList.toggle("ok", rec.known);
  info.hidden = false;
  if (rec.speaker) {
    info.classList.remove("ok");
    info.textContent = "That's a speaker bot: it only played the audio. Use the recorder bot from the same run.";
  } else if (rec.known) {
    const when = rec.recordedAt ? ` on ${new Date(rec.recordedAt).toLocaleString()}` : "";
    info.textContent = `Recorded with this app${when}. ${SOURCE_NAMES[rec.source]}. ` +
      (rec.reference ? `Its reference (${rec.reference.words} words) is used for accuracy.` : "No reference was saved with it.");
  } else {
    info.textContent = "Not recorded with this app, so it can't tell what was said. For accuracy, pick the sample's transcript if this bot heard the sample clip, or paste your own; otherwise pick None.";
  }
  updateSetup();
}
$("#botId").addEventListener("input", lookUpBot);

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
        `${b.created_at ? new Date(b.created_at).toLocaleString() : "?"} · ${b.name ?? "bot"} · ${b.status ?? ""}` +
        `${b.recorded_here ? ` · recorded here (${b.recorded_here === "live" ? "live speech" : b.recorded_here})` : ""} · ${b.bot_id.slice(0, 8)}…`)),
    );
    picker.hidden = false;
  } catch (err) {
    $("#setupError").textContent = err.message;
  }
  e.target.disabled = false;
});
$("#botPicker").addEventListener("change", (e) => {
  if (!e.target.value) return;
  $("#botId").value = e.target.value;
  lookUpBot();
});

$("#refFile").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (file) $("#refText").value = await file.text();
});

// The setup card stays open until it's closed once, then stays closed.
try {
  if (localStorage.getItem("setupCardClosed") === "1") $("#setupCard").open = false;
  $("#setupCard").addEventListener("toggle", (e) => {
    try { localStorage.setItem("setupCardClosed", e.target.open ? "0" : "1"); } catch {}
  });
} catch {}

async function loadProviders() {
  const { providers, pricesAsOf } = await api("/api/providers");
  $("#providerList").replaceChildren(...providers.map((p) =>
    el("label", { class: "provider" },
      el("input", { type: "checkbox", name: "provider", value: p.key, checked: true }),
      el("div", {}, el("strong", {}, nameOf(p.key)), el("span", {}, p.rate ?? "")))));
  $("#pricesNote").textContent = `Prices as published on ${pricesAsOf}. Every provider except Mia Transcribe needs its key connected in the MeetStream dashboard under Integrations → Transcription (see Setup above).`;
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
      if (audioKind() === "script") {
        const text = $("#scriptText").value;
        if (!text.trim()) throw new Error("Type what the bot should say.");
        spec.audio = { kind: "script", text };
      } else if (audioKind() === "upload") {
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
  $("#board").replaceChildren();
  $("#boardCard").hidden = true;
  boardStoppedAt = null;
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
  lastState = s;
  renderBoard();

  $("#stopRecording").hidden = !(m === "recorder" && s.phase === "recording");
  $("#cancelRun").hidden = ["done", "failed"].includes(s.phase);
}

// Timing board: one lane per provider, a running clock from the moment they
// were all submitted, each lane stopping at that provider's turnaround.
let lastState = null;
let boardTimer = null;
let boardStoppedAt = null;
function renderBoard() {
  const s = lastState;
  const lanes = s?.lanes ?? [];
  const card = $("#boardCard");
  if (!lanes.length || !s.submittedAt) { card.hidden = true; return; }
  card.hidden = false;
  const results = s.providers ?? {};
  // The clock stops once every lane has an outcome (or the run is over).
  const settled = ["done", "failed"].includes(s.phase) || lanes.every((p) => results[p]);
  if (settled && !boardStoppedAt) boardStoppedAt = Date.now();
  if (!settled) boardStoppedAt = null;
  const elapsed = ((boardStoppedAt ?? Date.now()) - s.submittedAt) / 1000;
  const finished = settled;
  const times = Object.values(results).map((r) => r.seconds).filter((t) => t != null);
  const scale = Math.max(finished ? 0 : elapsed, ...times, 10);
  const fastest = times.length ? Math.min(...times) : null;
  $("#boardClock").textContent = `${(finished && times.length ? Math.max(...times) : elapsed).toFixed(1)} s`;
  $("#boardClock").title = finished ? "Slowest provider's turnaround" : "Time since every provider was submitted";
  $("#board").replaceChildren(...lanes.map((p) => {
    const r = results[p];
    const state = !r ? "running" : r.status === "Success" ? "done" : r.status === "Reused" ? "reused" : "failed";
    const t = r?.seconds ?? (state === "running" && !finished ? elapsed : null);
    const label = state === "running" ? (finished ? "–" : `${elapsed.toFixed(1)} s`)
      : state === "done" ? `${r.seconds.toFixed(1)} s`
      : state === "reused" ? "earlier run"
      : r.status === "NotRun" ? "not run" : r.status.toLowerCase();
    return el("li", { class: `lane ${state} ${state === "done" && r.seconds === fastest ? "first" : ""}` },
      el("span", { class: "who" }, nameOf(p)),
      el("span", { class: "bar", "aria-hidden": "true" }, el("i", { style: `width:${t == null ? 0 : Math.min(100, (t / scale) * 100)}%` })),
      el("span", { class: "t" }, label, r?.detail && state === "failed" ? el("small", { title: r.detail }, r.detail) : null));
  }));
  clearInterval(boardTimer);
  if (!finished && lanes.some((p) => !results[p])) boardTimer = setInterval(renderBoard, 200);
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
//
// A leaderboard (rank + every metric with an in-cell bar, best in orange with
// a BEST badge, the rest gray) and trade-off scatter plots where lower-left
// wins. The table is also the accessible view of every number the charts show.

const SVG = "http://www.w3.org/2000/svg";
const svg = (tag, attrs = {}, text) => {
  const n = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
};

const tooltip = () => $("#tooltip");
function showTip(evt, name, rows) {
  const tip = tooltip();
  tip.replaceChildren(el("div", { class: "tt-name" }, name), ...rows.map(([k, v]) => el("div", { class: "tt-row" }, el("span", {}, k), el("b", {}, v))));
  tip.hidden = false;
  const r = evt.target.getBoundingClientRect?.() ?? { left: evt.clientX, top: evt.clientY, width: 0 };
  const x = Math.min(window.innerWidth - tip.offsetWidth - 12, Math.max(12, r.left + r.width / 2 - tip.offsetWidth / 2));
  const y = r.top - tip.offsetHeight - 10 < 8 ? r.bottom + 10 : r.top - tip.offsetHeight - 10;
  tip.style.left = `${x}px`;
  tip.style.top = `${y}px`;
}
const hideTip = () => { tooltip().hidden = true; };

/** Clean axis ticks: 0 .. max rounded up to a 1/2/5 step. */
function ticks(max, count = 4) {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(+v.toFixed(10));
  if (out[out.length - 1] < max) out.push(+(out[out.length - 1] + step).toFixed(10));
  return out;
}

/**
 * Scatter of two lower-is-better metrics. Points are one de-emphasis gray,
 * the provider best on both in orange; every point is direct-labelled, so
 * identity never rests on color.
 */
function tradeoff({ title, sub, rows, x, y }) {
  const pts = rows.filter((r) => x.get(r) != null && y.get(r) != null);
  const card = el("div", { class: "card chart" },
    el("div", { class: "card-head" }, el("div", {}, el("span", { class: "label" }, "Trade-off"), el("h3", {}, title)), el("span", { class: "hint" }, sub)));
  const missing = rows.filter((r) => !pts.includes(r)).map((r) => nameOf(r.provider));
  if (pts.length < 2) {
    card.append(el("p", { class: "missing" }, "Not enough measured values to plot."));
    return card;
  }

  const W = 520, H = 310, m = { l: 52, r: 24, t: 30, b: 44 };
  const xs = ticks(Math.max(...pts.map(x.get)) * 1.1), ys = ticks(Math.max(...pts.map(y.get)) * 1.15);
  const X = (v) => m.l + (v / xs[xs.length - 1]) * (W - m.l - m.r);
  const Y = (v) => H - m.b - (v / ys[ys.length - 1]) * (H - m.t - m.b);
  const root = svg("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": `${title}: ${pts.map((p) => `${nameOf(p.provider)} ${x.fmt(x.get(p))}, ${y.fmt(y.get(p))}`).join("; ")}` });

  for (const v of ys) {
    root.append(svg("line", { class: v === 0 ? "axis" : "gridline", x1: m.l, x2: W - m.r, y1: Y(v), y2: Y(v) }));
    root.append(svg("text", { class: "tick", x: m.l - 8, y: Y(v) + 4, "text-anchor": "end" }, y.tick(v)));
  }
  for (const v of xs) {
    root.append(svg("line", { class: v === 0 ? "axis" : "gridline", y1: m.t, y2: H - m.b, x1: X(v), x2: X(v) }));
    root.append(svg("text", { class: "tick", x: X(v), y: H - m.b + 18, "text-anchor": "middle" }, x.tick(v)));
  }
  root.append(svg("text", { class: "axis-title", x: W - m.r, y: H - 6, "text-anchor": "end" }, `${x.label} →`));
  root.append(svg("text", { class: "axis-title", x: m.l - 8, y: m.t - 14, "text-anchor": "start" }, `↑ ${y.label}`));
  root.append(svg("text", { class: "better", x: m.l + 8, y: H - m.b - 8 }, "↙ better"));

  // The provider that is best on both axes, if one is.
  const bx = Math.min(...pts.map(x.get)), by = Math.min(...pts.map(y.get));
  const placed = [];
  const fits = (b) => b.x >= 0 && b.x + b.w <= W && b.y >= 0 && b.y + b.h <= H - m.b &&
    placed.every((o) => b.x + b.w < o.x || o.x + o.w < b.x || b.y + b.h < o.y || o.y + o.h < b.y);
  for (const p of [...pts].sort((a, b) => y.get(a) - y.get(b))) {
    const cx = X(x.get(p)), cy = Y(y.get(p));
    const best = x.get(p) === bx && y.get(p) === by;
    const g = svg("g");
    const hit = svg("circle", { class: "hit", cx, cy, r: 14, tabindex: 0, role: "button", "aria-label": `${nameOf(p.provider)}: ${x.label} ${x.fmt(x.get(p))}, ${y.label} ${y.fmt(y.get(p))}` });
    const rows2 = [[y.label, y.fmt(y.get(p))], [x.label, x.fmt(x.get(p))]];
    hit.addEventListener("pointerenter", (e) => showTip(e, nameOf(p.provider), rows2));
    hit.addEventListener("focus", (e) => showTip(e, nameOf(p.provider), rows2));
    hit.addEventListener("pointerleave", hideTip);
    hit.addEventListener("blur", hideTip);
    g.append(hit, svg("circle", { class: `pt ${best ? "best" : ""}`, cx, cy, r: 6 }));

    // Direct label: right, left, above, below, whichever is free.
    const text = nameOf(p.provider), w = text.length * 7 + 4, h = 14;
    const spots = [[cx + 10, cy - 7, "start"], [cx - 10 - w, cy - 7, "start"], [cx - w / 2, cy - 24, "start"], [cx - w / 2, cy + 10, "start"]];
    const spot = spots.find(([sx, sy]) => fits({ x: sx, y: sy, w, h })) ?? spots[0];
    placed.push({ x: spot[0], y: spot[1], w, h });
    g.append(svg("text", { class: "pt-label", x: spot[0], y: spot[1] + 11 }, text));
    root.append(g);
  }
  card.append(root);
  if (missing.length) card.append(el("p", { class: "missing" }, `Not plotted (not measured in this run): ${missing.join(", ")}.`));
  return card;
}

let sortState = null;

async function showRun(id) {
  const data = await api(`/api/runs/${id}`);
  show("resultView");
  $$("#runList button").forEach((b) => b.toggleAttribute("aria-current", b.dataset.run === id));
  const { results, recording } = data;
  const scored = results.reference_words != null;
  const ran = results.providers.filter((p) => p.ran);

  $("#resultTitle").textContent = scored ? "Accuracy, speed and cost" : "Speed and cost";
  const when = data.started_at ? new Date(data.started_at) : null;
  const specs = [
    ["Run", when ? when.toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : id],
    ["Audio", recording?.clip?.synthetic_speech ? `Typed script · ${recording.clip.synthetic_speech} · ${recording.clip.seconds.toFixed(0)} s` : recording?.clip ? `${recording.clip.path.split("/").pop()} · ${recording.clip.seconds.toFixed(0)} s clip` : recording ? `Live speech${recording.bot_name ? ` · ${recording.bot_name}` : ""}` : "Existing recording"],
    ["Billed audio", results.billed_audio_seconds ? `${(results.billed_audio_seconds / 60).toFixed(2)} min` : "–"],
    ["Reference", scored ? `${results.reference_words} words` : "None (speed and cost only)"],
    ["Platform", recording?.meeting_platform ?? "–"],
    ["Providers", `${ran.length} of ${results.providers.length} ran`],
  ];
  $("#specs").replaceChildren(...specs.map(([k, v]) => el("div", {}, el("dt", {}, k), el("dd", { title: v }, v))));
  $("#downloads").replaceChildren(
    el("a", { class: "secondary", href: `/api/runs/${id}/download/results.md` }, "↓ results.md"),
    el("a", { class: "secondary", href: `/api/runs/${id}/download/results.json` }, "↓ results.json"));

  // Metrics: lower is better except words transcribed.
  const metrics = [
    ...(scored ? [{ key: "wer", label: "WER", sub: "lower is better", fmt: pct }] : [{ key: "words", label: "Words", sub: "more captured", fmt: (v) => String(v), higher: true }]),
    { key: "turnaround_median_s", label: "Turnaround", sub: "lower is better", fmt: secs },
    { key: "cost_usd", label: "Cost", sub: "this recording", fmt: usd },
  ];
  const bestOf = (m) => {
    const vals = ran.map((p) => p[m.key]).filter((v) => v != null);
    return vals.length ? (m.higher ? Math.max : Math.min)(...vals) : null;
  };
  const maxOf = (m) => Math.max(0, ...ran.map((p) => p[m.key] ?? 0));
  for (const m of metrics) { m.best = bestOf(m); m.max = maxOf(m); }

  const who = (m) => (m.best == null ? "not measured" : ran.filter((p) => p[m.key] === m.best).map((p) => nameOf(p.provider)).join(", "));
  $("#summaryCards").replaceChildren(...metrics.map((m) =>
    el("div", { class: "stat" },
      el("div", { class: "label" }, m.key === "wer" ? "Most accurate" : m.key === "words" ? "Most words captured" : m.key === "cost_usd" ? "Cheapest" : "Fastest"),
      el("div", { class: "value" }, m.best == null ? "–" : m.fmt(m.best)),
      el("div", { class: "who" }, who(m)))));

  // Rank by the headline metric (accuracy, or speed when there's no reference).
  const primary = metrics[0].higher ? metrics[1] : metrics[0];
  const rankOrder = [...ran].sort((a, b) => (a[primary.key] ?? Infinity) - (b[primary.key] ?? Infinity));
  // Standard competition ranking: equal scores share a rank (01, 01, 03).
  const score = (p) => p[primary.key] ?? Infinity;
  const rankOf = new Map(rankOrder.map((p) => [p.provider, 1 + ran.filter((o) => score(o) < score(p)).length]));
  $("#boardTitle").textContent = `Ranked by ${primary.key === "wer" ? "accuracy" : "turnaround"}`;
  $("#rankHint").textContent = "Click a column to re-sort. Equal scores share a rank.";

  const columns = [
    { key: "rank", label: "#", cell: (p) => el("td", { class: "rank" }, p.ran ? String(rankOf.get(p.provider)).padStart(2, "0") : "–") },
    { key: "provider", label: "Provider", cell: (p) => el("td", { class: "provider-name" }, nameOf(p.provider)) },
    ...metrics.map((m) => ({
      key: m.key, label: m.label, sub: m.sub,
      cell: (p) => {
        const v = p[m.key];
        const isBest = v != null && v === m.best;
        const width = v == null || !m.max ? 0 : Math.max(2, (v / m.max) * 100);
        const td = el("td", { class: isBest ? "best" : "" },
          el("div", { class: "metric" },
            el("span", { class: "num" }, isBest ? el("span", { class: "badge" }, "BEST") : null, isBest ? " " : null, m.fmt(v)),
            el("div", { class: "track", "aria-hidden": "true" }, el("span", { class: `fill ${isBest ? "best" : ""}`, style: `width:${width}%` }))));
        td.addEventListener("pointerenter", (e) => showTip(e, nameOf(p.provider), [[m.label, m.fmt(v)], ...(m.best != null && v != null && !isBest ? [["vs best", m.higher ? `${v - m.best}` : `${(v / m.best).toFixed(1)}×`]] : [])]));
        td.addEventListener("pointerleave", hideTip);
        return td;
      },
    })),
    { key: "cost_per_hour_usd", label: "Per hour", sub: "published rate", cell: (p) => el("td", {}, perHour(p.cost_per_hour_usd)) },
  ];
  if (scored) columns.splice(3, 0, { key: "sdi", label: "Sub / Del / Ins", sub: "word errors", cell: (p) => el("td", {}, `${p.substitutions} / ${p.deletions} / ${p.insertions}`) });

  sortState = { key: "rank", dir: 1 };
  const valueFor = (p, key) => (key === "rank" ? rankOf.get(p.provider) : key === "provider" ? nameOf(p.provider) : p[key]);
  const renderTable = () => {
    const { key, dir } = sortState;
    const rows = [...results.providers].sort((a, b) => {
      if (a.ran !== b.ran) return a.ran ? -1 : 1;
      const va = valueFor(a, key), vb = valueFor(b, key);
      if (va == null) return 1;
      if (vb == null) return -1;
      return (va > vb ? 1 : va < vb ? -1 : 0) * dir;
    });
    $("#resultTable").replaceChildren(
      el("thead", {}, el("tr", {}, columns.map((c) =>
        el("th", {
          scope: "col", "aria-sort": c.key === key ? (dir > 0 ? "ascending" : "descending") : false,
          onclick: () => { if (c.key === "sdi") return; sortState = { key: c.key, dir: sortState.key === c.key ? -sortState.dir : c.key === "words" ? -1 : 1 }; renderTable(); },
        }, c.label, c.sub ? el("small", {}, c.sub) : null)))),
      el("tbody", {}, rows.map((p) => el("tr", { class: p.ran && rankOf.get(p.provider) === 1 ? "first" : "" }, p.ran
        ? columns.map((c) => c.cell(p))
        : [el("td", { class: "rank" }, "–"), el("td", { class: "provider-name" }, nameOf(p.provider)), el("td", { class: "notrun", colspan: columns.length - 2 }, `not run: ${p.reason ?? ""}`)]))));
  };
  renderTable();

  const costNote = ran.some((p) => p.cost_basis)
    ? `Cost is transcription only, at each provider's published rate on ${results.prices_as_of}; MeetStream's bot fee is the same whichever provider you pick, so it's left out. `
    : "Cost needs each provider's raw response; older runs can get it with npm run fetch-raw. ";
  $("#tableNotes").textContent = `${scored ? "WER counts only words inside the clip. " : ""}Turnaround runs from the request to the first poll that saw the result (every ${data.poll_seconds ?? 5} s), through MeetStream. ${costNote}`;

  // Trade-offs: both axes lower-is-better, so lower-left wins.
  const xCost = { label: "Cost per hour", get: (p) => p.cost_per_hour_usd, fmt: perHour, tick: (v) => `$${v.toFixed(2)}` };
  const xTime = { label: "Turnaround", get: (p) => p.turnaround_median_s, fmt: secs, tick: (v) => `${+v.toFixed(1)}s` };
  const yWer = { label: "WER", get: (p) => (p.wer == null ? null : p.wer * 100), fmt: (v) => `${v.toFixed(1)}%`, tick: (v) => `${+v.toFixed(1)}%` };
  $("#charts").replaceChildren(...(scored
    ? [tradeoff({ title: "Accuracy vs cost", sub: "WER against price per hour", rows: ran, x: xCost, y: yWer }),
       tradeoff({ title: "Accuracy vs speed", sub: "WER against turnaround", rows: ran, x: xTime, y: yWer })]
    : [tradeoff({ title: "Speed vs cost", sub: "Turnaround against price per hour", rows: ran, x: xCost, y: { ...xTime, fmt: secs, tick: (v) => `${+v.toFixed(0)}s` } })]));

  const noteItems = results.providers.flatMap((p) => [
    ...(p.notes ?? []).map((n) => `${nameOf(p.provider)}: ${n}`),
    ...(p.failed_rounds ?? []).map((f) => `${nameOf(p.provider)}: round ${f.round} ${f.status}${f.error ? ` (${f.error})` : ""}`),
  ]);
  $("#notes").replaceChildren(...(noteItems.length ? [el("div", { class: "callout" }, el("strong", {}, "Notes on this run"), el("ul", {}, noteItems.map((n) => el("li", {}, n))))] : []));

  $("#details").replaceChildren(...rankOrder.map((p) => el("details", { class: "provider-detail" },
    el("summary", {}, el("span", { class: "rank" }, String(rankOf.get(p.provider)).padStart(2, "0")), nameOf(p.provider),
      el("span", { class: "muted" }, scored ? `${p.errors.length} word errors · ${pct(p.wer)}` : `${p.words} words`),
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
