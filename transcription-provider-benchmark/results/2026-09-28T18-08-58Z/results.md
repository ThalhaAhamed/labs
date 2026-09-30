# Transcription provider benchmark: 2026-09-28T18-08-58Z

- Recording: bot `88ba4098-3ab4-4c0c-b56c-3e5416f0f782` on meet.google.com, clip `sample/clip.wav` (191.435s, sha256 `f2d2ec68f98c…`)
- Reference: 420 words after normalisation (sha256 `aed990bbd046…`)
- Rounds: 1, all providers submitted together each round; turnaround polled every 5s
- Harness: commit not recorded (this run predates recording it)
- Models as reported by each provider: Mia Transcribe (not reported); JigsawStack (not reported); AssemblyAI universal-2 (assemblyai_default, assemblyai_default); Deepgram general-nova-3 2025-07-31.0; Sarvam (not reported)
- Method: see [METHODOLOGY.md](../../METHODOLOGY.md). Re-score offline with `npm run score -- results/2026-09-28T18-08-58Z`

| Provider | WER | Sub | Del | Ins | Outside clip | Turnaround (finished within) | Range over rounds | × real time | Cost | Per hour |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Mia Transcribe | 2.1% | 7 | 2 | 0 | 0 words (untrimmed WER 2.1%) | 2.5–8.6s | 8.6s–8.6s | 0.05× | $0.0071 | $0.10 |
| JigsawStack | 2.1% | 7 | 2 | 0 | 0 words (untrimmed WER 2.1%) | 1.0–7.5s ‡ | 7.5s–7.5s | 0.04× | $0.0019 | $0.03 |
| AssemblyAI | 2.9% | 9 | 2 | 1 | 0 words (untrimmed WER 2.9%) | 8.6–14.3s | 14.3s–14.3s | 0.07× | $0.012 | $0.17 |
| Deepgram | 3.8% | 12 | 4 | 0 | 0 words (untrimmed WER 3.8%) | 2.5–8.6s | 8.6s–8.6s | 0.05× | $0.018 | $0.26 |
| Sarvam | 5.0% | 16 | 5 | 0 | 0 words (untrimmed WER 5.0%) | 14.3–20.1s | 20.1s–20.1s | 0.10× | $0.033 | $0.47 |

WER counts only words inside the clip: anything a provider transcribed before the clip started or after it ended (talk in the room while the bots joined) is cut first and shown under Outside clip. See METHODOLOGY.md for the rule.

WER is pooled over all successful rounds.

Turnaround is the window in which each job finished, measured from sending MeetStream's transcribe request: after the last poll that still saw it processing, and by the first poll that saw it done (polled every 5s). It is MeetStream's end-to-end turnaround (the request itself, queueing, fetching the recording, the provider's processing), not the provider's own API latency. Providers whose windows overlap can't be ranked on speed.

‡ Submitted on its own (resubmitted after a failure, or added to the run later), not alongside the others, so its turnaround isn't comparable with theirs.

**Cost** is transcription only, at each provider's published rate on 2026-09-28, for 4.29 min of billed audio. MeetStream's bot fee applies whichever provider is used and is not included. Rates: Mia Transcribe $0.10/hr (MeetStream transcription add-on); JigsawStack $0.99 per 1M tokens (from the response's own usage); AssemblyAI $0.15/hr Universal-2 + $0.02/hr speaker labels; Deepgram $0.0043/min (Nova-3 pre-recorded); Sarvam ₹45/hr batch with diarization, at ₹96.16/$.

## Notes

- **Mia Transcribe**: returned exactly the same transcript as JigsawStack, so almost certainly the same engine: count them as one result, not two that agree
- **JigsawStack**: an earlier attempt failed (Retranscription failed before provider submission) and was replaced
- **JigsawStack**: submitted on its own after the rest of this run (2026-09-28T18:08:58.993Z), not alongside the other providers
- **JigsawStack**: returned exactly the same transcript as Mia Transcribe, so almost certainly the same engine: count them as one result, not two that agree

## Errors by provider (first successful round)

`S ref→hyp` substitution, `D ref` deletion (missed word), `I hyp` insertion. Normalised text for each provider is in `transcripts/*.normalized.txt`.

**Mia Transcribe** (9 errors): `S linnell's→l'anel's`, `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S birket→burkett`, `S the→a`, `S recognising→recognizing`, `S were→are`

**JigsawStack** (9 errors): `S linnell's→l'anel's`, `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S birket→burkett`, `S the→a`, `S recognising→recognizing`, `S were→are`

**AssemblyAI** (12 errors): `I rather`, `D at`, `S em→atom`, `S birket→burkett`, `S the→a`, `D michael`, `S angelo→michelangelo`, `S mantel→mantle`, `S recognising→recognizing`, `S were→are`, `S while→all`, `S wished→wish`

**Deepgram** (16 errors): `D up`, `S guards→upgard's`, `D at`, `S em→adam`, `S idylls→idols`, `S birket→burkitt`, `S on→in`, `S fact→effect`, `S the→a`, `D michael`, `S angelo→michelangelo`, `S mantel→mantle`, `S recognising→recognizing`, `D m`, `S a→ma`, `S a→the`

**Sarvam** (21 errors): `S apostle→gospel`, `S leighton's→layton's`, `S linnell's→linell's`, `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S jingo→gingo`, `S birket→burkett`, `S on→in`, `S in→an`, `D finish`, `S in→finishing`, `S the→a`, `D michael`, `S angelo→michelangelo`, `D mantel`, `S board→mantelboard`, `S recognising→recognizing`, `S felicitous→felicitor's`, `S phases→faces`

