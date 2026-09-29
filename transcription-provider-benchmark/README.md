# Transcription Provider Benchmark

This harness runs **one meeting recording through every transcription provider MeetStream supports** and outputs a table of word error rate and turnaround time.

Latest run, [results/2026-09-28T18-08-58Z](results/2026-09-28T18-08-58Z/results.md): Google Meet, the 191 s sample clip (420 reference words). One recording was sent to all five providers through the same re-transcribe request, and each was timed from its own request.

| Provider | WER | Sub / Del / Ins | Turnaround | Cost | Per hour |
|---|---:|---:|---:|---:|---:|
| Mia Transcribe | 2.1% | 7 / 2 / 0 | 8.6 s | $0.0071 | $0.10 |
| JigsawStack | 2.1% | 7 / 2 / 0 | 7.5 s | $0.0019 | ~$0.03* |
| AssemblyAI | 2.9% | 9 / 2 / 1 | 14.3 s | $0.012 | $0.17 |
| Deepgram | 3.8% | 12 / 4 / 0 | 8.6 s | $0.018 | $0.26 |
| Sarvam | 5.0% | 16 / 5 / 0 | 20.1 s | $0.033 | $0.47 |

Cost is transcription only, for the 4.29 min of billed audio, at each provider's published rate on 2026-09-28 (see [Cost](METHODOLOGY.md#cost)). \*JigsawStack bills by processing tokens, so its per-hour cost depends on the audio.

How to read this:

- **The sample is small.** One word is 0.24 points of WER, so treat gaps under about 2 points as ties.
- **Turnaround is one sample per provider**, polled every 5 s.
- **JigsawStack was re-run.** Its first attempt failed inside MeetStream before reaching JigsawStack ("Retranscription failed before provider submission"). It was re-run on the same recording a few minutes later, so it wasn't under the same load as the others. `results.md` records both attempts.
- **The independent scorer agrees.** `scripts/score_jiwer.py` gives the same ranking, with every provider within 0.3 points.
- **Every provider's raw transcript is in the results folder.** To re-score it yourself, see [Reproducing a result](METHODOLOGY.md#reproducing-a-result).

**Read [METHODOLOGY.md](METHODOLOGY.md) before trusting any number this produces.** It covers what is measured and what is not, how each provider is configured, and how to check a result with a scorer MeetStream did not write.

## Related: live providers

This harness compares MeetStream's **post-call** providers: the ones you configure on the dashboard's Integrations page, run on a finished recording.

[`../realtime-audio-streaming`](../realtime-audio-streaming) is the example that switches between **live streaming** providers (Deepgram, AssemblyAI, OpenAI) during a call. Its `npm run compare` sends the same audio to all of them at once and tabulates WER and finalisation latency with this harness's scorer. Point it at this harness's `sample/clip.wav` and `sample/reference.txt` to put live and post-call numbers on the same clip.

## How it works

```
 fetch-sample           record                              benchmark                          score
 ────────────           ──────                              ─────────                          ─────
 LibriSpeech  ──►  clip.wav ──► speaker bot ──► meeting ──► listener bot's recording ──┬─► meetstream  ─┐
 (pinned,          reference.txt   (sendaudio)                                          ├─► deepgram    ─┤
  CC BY 4.0)                                                                            ├─► assemblyai  ─┼─► WER + turnaround
                                                                                        ├─► sarvam      ─┤    per provider
                                                                                        └─► jigsawstack ─┘
                                              POST /bots/{id}/transcribe, same audio every time
```

1. **Record once.** A speaker bot plays the reference clip into a real meeting while a listener bot records it. The audio goes through the platform's real codec, like a customer's call would.
2. **Transcribe many times.** `POST /bots/{id}/transcribe` re-runs that one recording through each provider. Every provider gets byte-identical audio, and all are submitted together so they run under the same load.
3. **Score offline.** Each transcript is normalised and aligned against the reference. Everything needed to recompute the table, including the raw API responses, is saved in `results/<run>/`, so someone without an API key can check it.

## What you need

- Node.js 18+
- A MeetStream API key from [app.meetstream.ai](https://app.meetstream.ai)
- A free ngrok authtoken from [dashboard.ngrok.com](https://dashboard.ngrok.com/get-started/your-authtoken). The speaker bot connects back to this machine through it.
- A meeting link (Google Meet, Zoom or Teams) you can admit two bots into
- For every provider except `meetstream`: that provider's key configured in the MeetStream dashboard under **Integrations → Transcription**. Providers you haven't configured are listed as "not run", with the API's reason.

## Desktop app (Windows, macOS, Linux)

The same UI is also packaged as a desktop app, for people who shouldn't need Node, npm or a terminal. Install it and open **Transcriber Benchmark**.

| OS | Installer |
|---|---|
| Windows 10/11 (x64) | `Transcriber-Benchmark-Setup-<version>.exe` |
| macOS (Apple silicon or Intel) | `Transcriber-Benchmark-<version>-<arch>.dmg` |
| Linux (x64) | `.AppImage` (make it executable and run it), or `.deb` (`sudo apt install ./<file>.deb`) |

The installers aren't code-signed yet, so the first launch asks you to confirm:
- **Windows:** SmartScreen shows "More info → Run anyway".
- **macOS:** right-click the app and choose Open.

Inside the app:
- **Everything the browser version does,** with Node bundled (the app runs the same `index.js` through Electron).
- **Data lives in your user folder,** not next to the app: `%APPDATA%\Transcriber Benchmark` on Windows, `~/Library/Application Support/Transcriber Benchmark` on macOS, and `~/.config/Transcriber Benchmark` on Linux. Help → Open data folder takes you there. The published example run is copied in on first launch.
- **Keys typed into the app are remembered,** encrypted by the operating system's key store (DPAPI, Keychain or libsecret). If no key store is available, they're kept in memory only.

**Building the installers.** Each installer has to be built on its own OS, because ffmpeg and ngrok ship a native binary for the machine that runs `npm ci`.

```bash
npm run desktop        # run the desktop app from source
npm run dist:win       # on Windows → dist/*.exe
npm run dist:mac       # on a Mac   → dist/*.dmg (for that Mac's chip)
npm run dist:linux     # on Linux   → dist/*.AppImage and *.deb
```

- **Linux from Windows or macOS:** `build/linux-in-docker.sh` builds and smoke-tests the Linux installers inside a Docker container (instructions at the top of the file).
- **All of them at once:** the GitHub Actions workflow `.github/workflows/transcription-benchmark-desktop.yml` builds Windows, macOS on both chips, and Linux on their own runners. Run it from the Actions tab, or push a `transcriber-benchmark-v*` tag. The Linux job also smoke-tests the packaged app.
- **The icon** is drawn from the MeetStream mark by `build/make-icon.py` (PNG, ICO and ICNS).

## Run it in your browser

```bash
npm install
npm run ui
```

Then open http://localhost:4173. The page walks through the same steps as the command line:

1. **Pick where the audio comes from:** a bot's existing recording, a meeting where a bot plays a clip (the sample, or your own file), or a meeting where people just talk.
2. **Say what was actually said:** the sample's transcript, your own transcript (pasted or loaded from a file), or none, which gives turnaround and cost only.
3. **Tick the providers,** then run.

While the run goes, the page shows each step and the full log. When it finishes you get:
- a table of accuracy, turnaround and cost, with the best value in each column highlighted;
- every word each provider got wrong, and its full transcript;
- every past run in the sidebar, with `results.md` and `results.json` to download.

About the app itself:
- **It uses the command-line tool underneath.** Each run starts `node index.js record` / `benchmark` in the background, so a result from the page is the same as one from the terminal and lands in the same `results/` folder.
- **It stays on your machine.** It only listens on `127.0.0.1`, because it holds your MeetStream key and can send bots into your meetings.
- **Keys:** it reads them from `.env`, or you can paste them into the page, where they're kept in memory only.
- **The port** is set with `UI_PORT` (default 4173).

## Run it from the command line

```bash
npm install
cp .env.example .env
npm run fetch-sample
npm run record
npm run benchmark
```

After copying `.env.example`, fill in `MEETSTREAM_API_KEY`, `MEETING_LINK` and `NGROK_AUTHTOKEN`.

What each step does:

- **`fetch-sample`** builds the ~3 min reference clip and its transcript (about 10 MB download, once).
- **`record`** starts the meeting yourself and admits both bots if asked. Keep everyone else muted: anything else said in the call counts as an insertion error for every provider. Both bots leave on their own when the clip ends.
- **`benchmark`** waits for the recording to finish processing, then runs every provider once on that recording. MeetStream allows each provider only one run per recording, so to get more samples you record again.

The table is printed and saved to `results/<run>/results.md`.

### Options

```bash
npm run benchmark -- --bot-id <id>            # any bot, not just the last one recorded
npm run benchmark -- --providers meetstream,deepgram
npm run benchmark -- --poll 2                 # finer turnaround resolution
npm run benchmark -- --reference my-ref.txt   # verbatim transcript of what was said
npm run record -- --audio call.m4a --reference call.txt   # your own audio (any format ffmpeg reads)
npm run record -- --live-provider assemblyai  # fallback: transcribe live with a provider the re-transcribe endpoint refuses
npm run benchmark -- --bot-id <id> --providers jigsawstack --append results/<run>   # re-run one provider into an existing run
npm run score -- results/<run>                # re-score a finished run, no API key needed
npm run fetch-raw -- results/<run>            # add providers' raw responses to an older run (needed for cost)
npm run record -- --listener-only --bot-name "My Recorder"   # one bot records people talking; no speaker bot
```

Your own audio is the better test for a buying decision: your accents, your jargon, your crosstalk. The reference must be a verbatim transcript of what was said, not a summary or a cleaned-up version.

### Check the scorer independently

```bash
pip install -r scripts/requirements.txt
python scripts/score_jiwer.py results/<run>
```

This re-scores the same raw transcripts with jiwer and OpenAI Whisper's text normaliser. It shares no code with the Node scorer.

## Output

```
results/<run>/
  run.json                    bot, recording, exact provider configs, every job with timings
  reference.txt               the reference used
  transcripts/<p>.r<n>.json   raw get_transcript response per provider per round
  transcripts/<p>.r<n>.normalized.txt
  results.json                per-provider WER, S/D/I, turnaround, every word error
  results.md                  the table, plus each provider's errors listed word by word
```

## Files

| File | What it does |
|---|---|
| `index.js` | CLI: `record`, `benchmark` and `score` |
| `src/providers.js` | The exact config sent to each provider. Edit here, nowhere else. |
| `src/recorder.js` | Two bots, one control WebSocket, and real-time-paced `sendaudio` |
| `src/benchmark.js` | Submits every provider together, polls and saves raw output |
| `src/report.js` | Scores a run directory into `results.md` and `results.json` |
| `src/wer.js` | Normalisation and WER alignment |
| `src/transcript.js` | Flattens either transcript response shape to text |
| `scripts/fetch-sample.js` | Builds the pinned LibriSpeech clip |
| `scripts/score_jiwer.py` | Independent re-score with jiwer and the Whisper normaliser |

`npm test` runs the scorer, the transcript parser, the `sendaudio` streaming path and a full benchmark against a stubbed API. It needs no key and no network.

## Attribution

The sample clip is LibriSpeech (V. Panayotov, G. Chen, D. Povey, S. Khudanpur, "LibriSpeech: an ASR corpus based on public domain audio books", ICASSP 2015), licensed CC BY 4.0.
