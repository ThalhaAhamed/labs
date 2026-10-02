# Transcription provider benchmark: 2026-10-02T19-25-58Z

- Recording: bot `7b801a7a-7225-4cb7-92eb-cc8ae5f122c2` ("Benchmark Recorder") on meet.google.com, live speech (recorder only, no clip)
- Reference: 126 words after normalisation (sha256 `8a772f1cf9a5…`), added after the run on 2026-10-02
- Rounds: 1, all providers submitted together each round; turnaround polled every 1s
- Harness: version 1.0.2, commit `d1e29bc06149`
- Models as reported by each provider: Mia Transcribe (not reported); AssemblyAI universal-2 (assemblyai_default, assemblyai_default); JigsawStack (not reported); Deepgram general-nova-3 2025-07-31.0; Sarvam (not reported)
- Audio as reported by each provider (MeetStream sends each the same stored recording; the harness can't see the bytes): Mia Transcribe (not reported); AssemblyAI 73 s; JigsawStack (not reported); Deepgram 72.3 s, 1 channel; Sarvam audio/wav, hash 32ca25efae40
- Method: see [METHODOLOGY.md](../../METHODOLOGY.md). Re-score offline with `npm run score -- results/2026-10-02T19-25-58Z`

| Provider | WER | Sub | Del | Ins | Outside clip | Turnaround (finished within) | Range over rounds | × real time (of billed audio) | Cost | Per hour |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mia Transcribe | 1.6% | 1 | 1 | 0 | 0 words (untrimmed WER 1.6%) | 5.0–6.6s | 6.6s–6.6s | 0.09× | $0.0020 | $0.10 |
| AssemblyAI | 1.6% | 1 | 1 | 0 | 0 words (untrimmed WER 1.6%) | 8.6–10.2s | 10.2s–10.2s | 0.14× | $0.0034 | $0.17 |
| JigsawStack | 1.6% | 1 | 1 | 0 | 0 words (untrimmed WER 1.6%) | 5.0–6.6s | 6.6s–6.6s | 0.09× | $0.0013 | $0.07 |
| Deepgram | 3.2% | 2 | 2 | 0 | 0 words (untrimmed WER 3.2%) | 1.5–3.1s | 3.1s–3.1s | 0.04× | $0.0052 | $0.26 |
| Sarvam | 3.2% | 3 | 1 | 0 | 0 words (untrimmed WER 3.2%) | 20.7–22.4s | 22.4s–22.4s | 0.31× | $0.0094 | $0.47 |

WER counts only words inside the clip: anything a provider transcribed before the clip started or after it ended (talk in the room while the bots joined) is cut first and shown under Outside clip. See METHODOLOGY.md for the rule.

WER is pooled over all successful rounds. On 126 reference words, WER gaps under 3.1 points are within sampling noise (95%, treating words as independent; real errors cluster, so the true band is wider): treat them as ties.

Turnaround is the window in which each job finished, measured from sending MeetStream's transcribe request: after the last poll that still saw it processing, and by the first poll that saw it done (polled every 1s). It is MeetStream's end-to-end turnaround (the request itself, 0.7–1.5s here, queueing, fetching the recording, the provider's processing), not the provider's own API latency. Providers whose windows overlap can't be ranked on speed.

**Cost** is transcription only, at each provider's published rate on 2026-09-28, for 1.20 min of billed audio. MeetStream's bot fee applies whichever provider is used and is not included. Rates: Mia Transcribe $0.10/hr (MeetStream transcription add-on); AssemblyAI $0.15/hr Universal-2 + $0.02/hr speaker labels; JigsawStack $0.99 per 1M tokens (from the response's own usage); Deepgram $0.0043/min (Nova-3 pre-recorded); Sarvam ₹45/hr batch with diarization, at ₹96.16/$.

## Notes

- **Mia Transcribe**: returned exactly the same transcript as AssemblyAI, JigsawStack, so almost certainly the same engine: count them as one result, not two that agree
- **AssemblyAI**: returned exactly the same transcript as Mia Transcribe, JigsawStack, so almost certainly the same engine: count them as one result, not two that agree
- **JigsawStack**: returned exactly the same transcript as Mia Transcribe, AssemblyAI, so almost certainly the same engine: count them as one result, not two that agree

## Errors by provider (first successful round)

`S ref→hyp` substitution, `D ref` deletion (missed word), `I hyp` insertion. Normalised text for each provider is in `transcripts/*.normalized.txt`.

**Mia Transcribe** (2 errors): `D and`, `S that→this`

**AssemblyAI** (2 errors): `D and`, `S that→this`

**JigsawStack** (2 errors): `D and`, `S that→this`

**Deepgram** (4 errors): `D and`, `S leading→reading`, `D the`, `S that→this`

**Sarvam** (4 errors): `D and`, `S which→it`, `S leading→reading`, `S that→this`

