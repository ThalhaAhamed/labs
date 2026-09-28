# Transcription Provider Benchmark

This harness runs **one meeting recording through every transcription provider MeetStream supports** and outputs a table of word error rate and turnaround time.

Latest run, [results/2026-09-28T18-08-58Z](results/2026-09-28T18-08-58Z/results.md): Google Meet, the 191 s sample clip (420 reference words). One recording was sent to all five providers through the same re-transcribe request, and each was timed from its own request.

| Provider | WER | Sub / Del / Ins | Turnaround | × real time |
|---|---:|---:|---:|---:|
| meetstream | 2.1% | 7 / 2 / 0 | 8.6 s | 0.05× |
| jigsawstack | 2.1% | 7 / 2 / 0 | 7.5 s | 0.04× |
| assemblyai | 2.9% | 9 / 2 / 1 | 14.3 s | 0.07× |
| deepgram | 3.8% | 12 / 4 / 0 | 8.6 s | 0.04× |
| sarvam | 5.0% | 16 / 5 / 0 | 20.1 s | 0.10× |

How to read this:

- **The sample is small.** One word is 0.24 points of WER, so treat gaps under about 2 points as ties.
- **Turnaround is one sample per provider**, polled every 5 s.
- **JigsawStack was re-run.** Its first attempt failed inside MeetStream before reaching JigsawStack ("Retranscription failed before provider submission"). It was re-run on the same recording a few minutes later, so it wasn't under the same load as the others. `results.md` records both attempts.
- **The independent scorer agrees.** `scripts/score_jiwer.py` gives the same ranking, with every provider within 0.3 points.
- **Every provider's raw transcript is in the results folder.** To re-score it yourself, see [Reproducing a result](METHODOLOGY.md#reproducing-a-result).

**Read [METHODOLOGY.md](METHODOLOGY.md) before trusting any number this produces.** It covers what is measured and what is not, how each provider is configured, and how to check a result with a scorer MeetStream did not write.

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

## Run it

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
