### Runs

| # | Test | Run | Reference words | Poll | Harness |
|---|---|---|---:|---:|---:|
| 1 | Sample clip, recording A (Test 1) | `2026-09-28T18-08-58Z` | 420 | 5 s | not recorded |
| 2 | Sample clip, recording B | `2026-10-02T19-10-28Z` | 420 | 1 s | `d1e29bc` |
| 3 | Sample clip, recording C | `2026-10-02T19-14-43Z` | 420 | 1 s | `d1e29bc` |
| 4 | Sample clip, recording D | `2026-10-02T19-18-58Z` | 420 | 1 s | `d1e29bc` |
| 5 | Typed script, read by Windows text-to-speech | `2026-10-02T19-21-07Z` | 169 | 1 s | `d1e29bc` |
| 6 | Own audio file (clip B) | `2026-10-02T19-24-13Z` | 272 | 1 s | `d1e29bc` |
| 7 | A person reading aloud (reference added after) | `2026-10-02T19-25-58Z` | 126 | 1 s | `d1e29bc` |

### Accuracy, the sample clip (4 recordings)

| Provider | Pooled WER | Range over runs | Runs | Words |
|---|---:|---:|---:|---:|
| Mia Transcribe | 2.1% | 1.4%–2.9% | 4 | 1680 |
| JigsawStack | 2.1% | 1.4%–2.9% | 4 | 1680 |
| AssemblyAI | 2.3% | 1.9%–2.6% | 4 | 1680 |
| Deepgram | 3.0% | 2.6%–3.6% | 4 | 1680 |
| Sarvam | 4.0% | 3.6%–5.0% | 4 | 1680 |

Pooled over 4 runs and 1680 reference words: gaps under 1.0 points are within sampling noise (95%, treating words as independent).

### Accuracy, every scored run

| Provider | Pooled WER | Range over runs | Runs | Words |
|---|---:|---:|---:|---:|
| Mia Transcribe | 2.0% | 0.0%–2.9% | 7 | 2247 |
| JigsawStack | 2.1% | 0.0%–3.7% | 7 | 2247 |
| AssemblyAI | 2.2% | 0.0%–3.7% | 7 | 2247 |
| Deepgram | 3.2% | 1.8%–5.9% | 7 | 2247 |
| Sarvam | 4.0% | 0.0%–7.4% | 7 | 2247 |

Pooled over 7 runs and 2247 reference words: gaps under 0.8 points are within sampling noise (95%, treating words as independent).

### Accuracy by run

| Provider | 1. sample | 2. sample | 3. sample | 4. sample | 5. script | 6. clip-b | 7. talk |
|---|---:|---:|---:|---:|---:|---:|---:|
| Mia Transcribe | 1.4% | 2.9% | 2.9% | 1.4% | 0.0% | 2.9% | 0.8% |
| JigsawStack | 1.4% | 2.9% | 2.9% | 1.4% | 0.0% | 3.7% | 0.8% |
| AssemblyAI | 2.6% | 2.4% | 2.1% | 1.9% | 0.0% | 3.7% | 0.8% |
| Deepgram | 3.1% | 2.9% | 3.6% | 2.6% | 1.8% | 5.9% | 2.4% |
| Sarvam | 3.8% | 3.8% | 5.0% | 3.6% | 0.0% | 7.4% | 2.4% |

### Turnaround, 6 runs polled every second

| Provider | Median | Fastest run | Slowest run | Runs |
|---|---:|---:|---:|---:|
| Deepgram | 5.7 s | 3.1 s | 11.8 s | 6 |
| JigsawStack | 5.9 s | 5.0 s | 11.3 s | 6 |
| Mia Transcribe | 7.1 s | 4.2 s | 22.6 s | 6 |
| AssemblyAI | 12.0 s | 9.3 s | 14.7 s | 6 |
| Sarvam | 20.7 s | 14.4 s | 31.1 s | 6 |

Each value is the poll that first saw the job done (the upper end of its window; the job finished up to 1 s earlier), measured from MeetStream's transcribe request.

### Turnaround by run (finished within)

| Provider | 2. sample | 3. sample | 4. sample | 5. script | 6. clip-b | 7. talk |
|---|---:|---:|---:|---:|---:|---:|
| Mia Transcribe | 5.6–7.6 | 20.8–22.6 | 11.0–12.7 | 3.1–5.0 | 2.5–4.2 | 5.0–6.6 |
| JigsawStack | 5.6–7.6 | 3.1–5.0 | 3.3–5.2 | 3.1–5.0 | 9.7–11.3 | 5.0–6.6 |
| AssemblyAI | 13.1–14.7 | 11.8–14.0 | 7.1–9.3 | 11.5–13.7 | 7.7–9.7 | 8.6–10.2 |
| Deepgram | 4.1–5.6 | 10.2–11.8 | 7.1–9.3 | 1.5–3.1 | 4.2–5.7 | 1.5–3.1 |
| Sarvam | 16.3–18.2 | 26.0–27.7 | 12.7–14.4 | 28.8–31.1 | 17.3–19.0 | 20.7–22.4 |

### Cost

| Provider | Published rate, per hour of audio |
|---|---:|
| JigsawStack | $0.03 |
| Mia Transcribe | $0.10 |
| AssemblyAI | $0.17 |
| Deepgram | $0.26 |
| Sarvam | $0.47 |

Transcription spend for all 7 runs together: $0.354 (MeetStream bot fees not included).
