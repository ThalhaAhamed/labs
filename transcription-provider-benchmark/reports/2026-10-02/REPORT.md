# Transcription provider benchmark: report, 2026-10-02

Seven recordings on Google Meet, each transcribed by all five providers MeetStream offers: Mia Transcribe, JigsawStack, AssemblyAI, Deepgram and Sarvam. Four play the same sample clip, and three cover other kinds of speech: a typed script read by text-to-speech, a second clip from the same dataset, and a person reading aloud. Every provider succeeded on every run.

Everything below comes from the run folders listed in [runs.json](runs.json). `node scripts/summarize.js reports/2026-10-02` regenerates every table ([summary.md](summary.md), [summary.json](summary.json)), and `npm run score -- results/<run>` re-scores any single run. Method: [METHODOLOGY.md](../../METHODOLOGY.md).

## Findings

1. **Accuracy: Mia Transcribe, JigsawStack and AssemblyAI are tied at the top. Deepgram and Sarvam are measurably behind.** Pooled over all seven runs (2,247 reference words): Mia Transcribe 2.0%, JigsawStack 2.1%, AssemblyAI 2.2%, Deepgram 3.2%, Sarvam 4.0%. Gaps under 0.8 points are sampling noise at this size, so the top three can't be separated, while Deepgram (+1.2 points) and Sarvam (+2.0) are clearly behind. The same order holds on the four sample-clip recordings alone (2.1 / 2.1 / 2.3 / 3.0 / 4.0%).
2. **Mia Transcribe and JigsawStack are one engine.** They returned the same transcript, word for word, in 6 of 7 runs. In the seventh they differed on 2 of 272 words, both rare names ("Ann"/"Anne", "Ruggedo"). That's what one engine run twice looks like, not two engines. Read them as one result.
3. **Speed: Deepgram, JigsawStack and Mia Transcribe are fastest, AssemblyAI is in the middle, and Sarvam is slowest.** Median time from request to result: Deepgram 5.7 s, JigsawStack 5.9 s, Mia Transcribe 7.1 s, AssemblyAI 12.0 s, Sarvam 20.7 s. Sarvam was the slowest in every run.
4. **Turnaround varies a lot from run to run, mostly because of MeetStream, not the providers.** Deepgram ranged from 3.1 to 11.8 s, and Mia Transcribe from 4.2 to 22.6 s. In one run, Mia Transcribe took 22.6 s and JigsawStack 5.0 s on the same recording, although they're the same engine. So a single run can't rank providers on speed; only the medians and the consistent gaps above mean anything.
5. **Cost** per hour of audio, at each provider's published rate: JigsawStack $0.03, Mia Transcribe $0.10, AssemblyAI $0.17, Deepgram $0.26, Sarvam $0.47. All seven runs together cost $0.35 in transcription (MeetStream bot fees are extra).
6. **Harder audio spreads the field.** On clip B (new sentences with rare names) every provider did worse: 2.9% for Mia Transcribe, up to 7.4% for Sarvam. On clean synthetic speech, everyone scored 0–1.8%, and Deepgram's 1.8% is entirely the number formatting described below.

## Results

### Accuracy, every scored run (pooled)

| Provider | Pooled WER | Range over runs | Runs | Words |
|---|---:|---:|---:|---:|
| Mia Transcribe ◆ | 2.0% | 0.0%–2.9% | 7 | 2247 |
| JigsawStack ◆ | 2.1% | 0.0%–3.7% | 7 | 2247 |
| AssemblyAI | 2.2% | 0.0%–3.7% | 7 | 2247 |
| Deepgram | 3.2% | 1.8%–5.9% | 7 | 2247 |
| Sarvam | 4.0% | 0.0%–7.4% | 7 | 2247 |

◆ One engine (see finding 2). Gaps under 0.8 points are within sampling noise (95%, treating words as independent; real errors cluster, so the true band is wider).

### Accuracy by run

| Provider | 1. sample (A) | 2. sample (B) | 3. sample (C) | 4. sample (D) | 5. typed script | 6. clip B | 7. person reading |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mia Transcribe | 1.4% | 2.9% | 2.9% | 1.4% | 0.0% | 2.9% | 0.8% |
| JigsawStack | 1.4% | 2.9% | 2.9% | 1.4% | 0.0% | 3.7% | 0.8% |
| AssemblyAI | 2.6% | 2.4% | 2.1% | 1.9% | 0.0% | 3.7% | 0.8% |
| Deepgram | 3.1% | 2.9% | 3.6% | 2.6% | 1.8% | 5.9% | 2.4% |
| Sarvam | 3.8% | 3.8% | 5.0% | 3.6% | 0.0% | 7.4% | 2.4% |

The same clip recorded four times gives a provider up to 1.5 points of spread (Mia Transcribe 1.4–2.9%, Sarvam 3.6–5.0%). That's how much a single recording can move a score, and why one run isn't enough to rank.

### Turnaround, the six runs polled every second

| Provider | Median | Fastest run | Slowest run |
|---|---:|---:|---:|
| Deepgram | 5.7 s | 3.1 s | 11.8 s |
| JigsawStack | 5.9 s | 5.0 s | 11.3 s |
| Mia Transcribe | 7.1 s | 4.2 s | 22.6 s |
| AssemblyAI | 12.0 s | 9.3 s | 14.7 s |
| Sarvam | 20.7 s | 14.4 s | 31.1 s |

This is MeetStream's end-to-end time: from sending the re-transcribe request to the first poll that saw the result. It includes MeetStream's queueing, not just the provider's processing. Each value is known to within 1 s. Per-run windows are in [summary.md](summary.md). Run 1 (Test 1) used a 5 s poll and isn't included.

### The independent scorer

`scripts/score_jiwer.py` ([its output](jiwer-crosscheck.txt); jiwer with OpenAI Whisper's normaliser, written by neither MeetStream nor this harness) re-scored all seven runs. Its figures differ from ours by up to 1.2 points, in both directions. Whisper's normaliser counts compound spacing ("upguards"/"up guards") as errors and ours doesn't. It reads Deepgram's "$4,200,000" as the same amount as "four point two million dollars" and ours doesn't, which is the largest single difference (Deepgram on the typed script: ours 1.8%, jiwer 0.6%). It puts the providers in the same order in every run, except where two of them are within noise of each other.

## What each test was

| # | Test | Audio | Reference |
|---|---|---|---|
| 1–4 | Sample clip | 191 s of LibriSpeech dev-clean read speech (pinned file, `sample/manifest.json`), played into the call by a speaker bot | Its exact transcript, 420 words |
| 5 | Typed script | A 169-word meeting-style script ([inputs/tts-script.txt](inputs/tts-script.txt)) spoken by Windows' built-in voice (System.Speech), 67.5 s ([inputs/tts-speech.wav](inputs/tts-speech.wav)) | The script itself |
| 6 | Own audio file | Clip B: the next 23 utterances of the same pinned file, 122.5 s ([inputs/build-clip-b.js](inputs/build-clip-b.js) rebuilds it byte-identical) | Its exact transcript, 272 words |
| 7 | A person reading aloud | A person reading a 126-word script ([inputs/read-aloud-script.txt](inputs/read-aloud-script.txt)) into the call. Recorder bot only, no speaker bot | The script, added after the run (the "add what was said" path), with one word corrected to what the reader said |

Runs 2–7 were benchmarked with harness commit `d1e29bc` and polled every second. Run 1 is the earlier Test 1 (28 Sep, 5 s poll, harness commit not recorded). All seven were then scored with normaliser v3 (commit `7c37345`). Every run folder holds the raw response from each provider, the reference, and the normalised texts.

## Things found during these runs

- **Two scoring rules were added and applied to every run.** On the typed script, every provider wrote "$4.2 million" for "four point two million dollars", and three wrote "November 14" for "November fourteenth". Both were charged as errors. Normaliser v3 now reads money with a scale word and month-day dates the way they're said. Re-scoring changed only the typed-script run (Mia Transcribe, JigsawStack, AssemblyAI and Sarvam went from 1.2–1.8% to 0.0%; Deepgram from 2.4% to 1.8%). The other six runs scored exactly the same.
- **Deepgram writes large amounts as digits** ("$4,200,000" for "four point two million dollars"). That's the same amount, but it's still charged here. It's Deepgram's entire 1.8% on the typed script.
- **The person-reading run's reference was corrected for one word the reader confirmed.** All five providers heard "**This** is the end" where the script says "**That** is the end". The reader confirmed they said "This", so the reference now says so. `run.json` records the change, why, and the previous hash, and every provider's score on that run dropped 0.8 points. All five also wrote "one hundred twelve" where the script says "one hundred **and** twelve". That's probably how it was read too, but it wasn't confirmed, so it's left as written and costs every provider the same 0.8 points.

## Limitations

- **Speakers.** The sample clip and clip B are all one LibriSpeech speaker (1272): the pinned file contains no one else. The typed script is one synthetic voice, and the read-aloud run one person. Accents, crosstalk and spontaneous speech aren't tested.
- **Read speech, not meetings.** Nothing here is a real conversation. LibriSpeech is also public and may be in some providers' training data, which can flatter them on runs 1–4 and 6.
- **One platform.** Google Meet only. Zoom and Teams weren't tested.
- **Sample size.** 2,247 reference words in total; gaps under 0.8 points are noise. Four recordings of one clip show up to 1.5 points of spread per provider.
- **Turnaround** is through MeetStream, from one machine and one network, over about 15 minutes on one evening. Load at other times may differ.
- **Settings.** Each provider uses its documented English setting through MeetStream, with defaults otherwise: `auto` for Mia Transcribe, `en` for Deepgram and JigsawStack, `en_us` for AssemblyAI, `en-IN` for Sarvam.
- **Same audio for every provider** follows from MeetStream's design (one stored recording, re-transcribed per provider). The harness can't see the bytes MeetStream sends each one. The lengths providers report agree.
- **Not tested:** live (streaming) transcription, diarization, timestamps, and the provider's own API latency.
- **Conflict of interest.** MeetStream wrote this harness and sells one of the engines measured (Mia Transcribe). Every number here can be re-derived from the published folders without trusting it.
