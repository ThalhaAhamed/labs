# Methodology

This harness compares the post-call transcription providers MeetStream offers. MeetStream wrote it and sells one of the engines it measures (`meetstream`, shown as Mia Transcribe in the dashboard). You should read any number it produces with that in mind. This document says exactly what is measured and what is not, and how to check a published result without trusting us.

## What is compared

| Provider key | Engine and config sent | Needs dashboard setup |
|---|---|---|
| `meetstream` | MeetStream engine, `language: "auto"` | No |
| `deepgram` | Deepgram `nova-3`, `language: "en"` | Deepgram key under Integrations |
| `assemblyai` | AssemblyAI `universal-2`, `language_code: "en_us"` | AssemblyAI key under Integrations |
| `sarvam` | Sarvam `saaras:v3`, `mode: "transcribe"`, `language_code: "en-IN"` | Sarvam key under Integrations |
| `jigsawstack` | JigsawStack, `language: "en"` | JigsawStack key under Integrations |

The exact request bodies live in [src/providers.js](src/providers.js), and every run copies them into `run.json`. The rule behind them: use each provider's documented model, set English wherever the provider documents an English code, and leave every other option at the provider's default. No custom vocabulary, keyterm prompts or other tuning is applied for the sample clip.

Two choices deserve comment:

- **`meetstream` runs on `auto`, not English.** MeetStream's docs don't confirm an English code for it. Auto-detection can only cost it accuracy, so the choice cuts against our own engine, not for it.
- **`sarvam` runs with `en-IN`.** It is the only English code in Sarvam's MeetStream docs. The sample is American and British read speech, so this may disadvantage Sarvam.

`meeting_captions` is excluded. It reads the meeting platform's live captions during the call, so it can't be re-run on a finished recording and would not hear the same audio as the others.

## Same audio for every provider

This is the property the rest of the design depends on.

1. **Record once.** Two MeetStream bots join one meeting. The *speaker* plays the reference clip into the call through the bot `sendaudio` command. The *listener* records the call, the way a customer's notetaker would. The clip therefore passes through the platform's real audio path (codec, mixing, network), not a clean file upload.
2. **Transcribe many times.** `POST /bots/{listener}/transcribe` is called once per provider. Each call re-transcribes the listener's single stored recording, so every provider gets byte-identical input. Accuracy differences can't come from one provider getting cleaner audio.

MeetStream allows its own engine (`meetstream`) **once per bot**. A second run answers HTTP 409. To leave that run for the benchmark, where it is timed like the others, the listener's live transcript uses `meeting_captions`. Consequences:

- `meetstream` gets one round, while the other providers get every round, so its turnaround range is a single sample.
- If you benchmark a bot whose `meetstream` run was already spent, the harness scores the transcript that run produced. Accuracy is still comparable (same recording, same config), but turnaround is shown as "–" and the run's `results.md` says so.

You can also benchmark any existing bot (`--bot-id`) that recorded speech you have a verbatim reference for. Step 2 is the same.

## The sample clip

`npm run fetch-sample` builds `sample/clip.wav` and `sample/reference.txt` from **LibriSpeech dev-clean** (Panayotov et al., 2015, CC BY 4.0), using a 73-utterance slice that Hugging Face hosts as one parquet file:

- The file is pinned by commit (`5be9148…`) and checked by SHA-256 before use.
- Utterances are taken **in file order** until the clip reaches 180 s. That gives 18 utterances, 191.4 s and 420 reference words. Nobody chose which sentences to include.
- Utterances are joined with 0.75 s of silence and written as 16 kHz mono WAV. With the pinned `ffmpeg-static`, the clip is byte-identical on every build; `sample/manifest.json` records its SHA-256 (`f2d2ec68…`).

LibriSpeech is read audiobook speech: one speaker at a time, careful diction, no crosstalk, no disfluencies. It is the standard reference set because its transcripts are exact. It is **not** representative of meetings (see Limitations).

## Accuracy: word error rate

WER = (substitutions + deletions + insertions) ÷ reference words, from a minimum-edit alignment of normalised reference and hypothesis words. It can exceed 100%. Across rounds, errors and reference words are summed before dividing (pooled), not averaged per round.

Before alignment, the same normalisation is applied to both the reference and each provider's output ([src/wer.js](src/wer.js)), so formatting isn't counted as misrecognition:

1. Unicode NFKC, lower-case, curly apostrophes made straight.
2. `&` becomes "and", `$5` becomes "5 dollars", `12%` becomes "12 percent", and thousands separators are removed.
3. Hyphens and dashes become spaces. All other punctuation is removed, except apostrophes inside words (`quilter's`) and decimal points.
4. Spoken abbreviations are expanded: `mr` mister, `mrs` missus, `ms` miss, `dr` doctor, `st` saint, `vs` versus.
5. Digits become words the way they are usually spoken:
   - `25` → twenty five, `2nd` → second, `3.5` → three point five
   - 4-digit numbers from 1100 to 2099 read as years (`1905` → nineteen oh five, `2005` → two thousand five), `1990s` → nineteen nineties
   - numbers over 12 digits are read digit by digit
6. The fillers um, uh, hmm, mm, mhm, mmm and erm are dropped, since a reader never says them.

Speaker labels are ignored: this measures which words were heard, not who said them. Segments are put in start-time order before joining.

**Checking the scorer.** [scripts/score_jiwer.py](scripts/score_jiwer.py) shares no code with the Node scorer. It re-scores the same raw transcripts with [jiwer](https://github.com/jitsi/jiwer) and OpenAI Whisper's `EnglishTextNormalizer`, the combination most ASR papers use. During development:

- On identical normalised text, `src/wer.js` and jiwer gave the same WER to the last decimal place for every provider.
- The S/D/I *split* can differ when two alignments are equally short, for example one substitution vs. one deletion plus one insertion. Totals never differ.
- With Whisper's normaliser instead of ours, WERs moved by up to 0.2 points and the ranking did not change. Expect small differences like this, and publish both tables.

## Turnaround time

Turnaround is the time from the `transcribe` request to the first poll of `GET /bots/{id}/transcriptions` that reports the job finished.

- It **overstates** the true figure by up to one poll interval (default 5 s). `run.json` keeps a lower bound, taken from the previous poll, for each job.
- It measures **turnaround through MeetStream**: queueing, fetching the recording, the provider's own processing and storing the result. It is what a MeetStream customer waits, not the provider's raw API latency.
- In each round, all providers are submitted at the same moment so they run under the same load. The default is 3 rounds. The table reports the median and the range.
- "× real time" is the median turnaround divided by the clip length. For example, 0.25× means a 3-minute clip took 45 s.

## Limitations

- **Not meeting speech.** The default clip is read English. Conversational speech, accents, crosstalk, jargon and code-switching all change WER and can change rankings. To measure those, use `--audio` and `--reference` with your own recording and a verbatim transcript.
- **Small sample.** One word is 0.24 points of WER on 420 reference words. Treat gaps under about 2 points as a tie unless they hold across several clips.
- **One platform per recording.** Google Meet, Zoom and Teams process audio differently. Record once per platform if that matters to you.
- **Default configs.** Providers can often do better with vocabulary hints or tuned settings. The table shows out-of-the-box behaviour through MeetStream.
- **Not measured:** price, diarization accuracy, timestamp accuracy, and live (streaming) latency.

## Publishing a result

Any result MeetStream publishes should include:

1. The whole `results/<run>/` directory: `run.json`, the raw transcript JSON from every provider, the normalised texts, `results.md` and `results.json`.
2. The commit of this harness used to produce it.
3. The `score_jiwer.py` table beside ours.
4. This document, or a link to it, and the limitations above.

## Reproducing a result

With nothing but a published `results/<run>/` directory and no API key:

```bash
npm install
npm run score -- results/<run>
pip install -r scripts/requirements.txt
python scripts/score_jiwer.py results/<run>
```

To re-run the measurement end to end on your own account, follow the README. Your WER should land close to the published figure. It will not match exactly, because providers update their models and every live recording differs slightly. Turnaround depends on load and time of day.
