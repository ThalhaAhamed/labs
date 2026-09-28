# Transcription provider benchmark: 2026-09-28T16-57-03Z

- Recording: bot `644b1e47-5f57-4f34-a1af-70ab153e9552` on meet.google.com, clip `sample/clip.wav` (191.435s, sha256 `f2d2ec68f98c…`)
- Reference: 420 words after normalisation (sha256 `aed990bbd046…`)
- Rounds: 1, all providers submitted together each round; turnaround polled every 5s
- Method: see [METHODOLOGY.md](../../METHODOLOGY.md). Re-score offline with `npm run score -- results/2026-09-28T16-57-03Z`

| Provider | WER | Sub | Del | Ins | Outside clip | Turnaround (median) | Range | × real time |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| meetstream | 2.1% | 7 | 2 | 0 | 0 words (untrimmed WER 2.1%) | 13.7s | 13.7s–13.7s | 0.07× |
| jigsawstack | 2.1% | 7 | 2 | 0 | 0 words (untrimmed WER 2.1%) | 7.9s | 7.9s–7.9s | 0.04× |
| assemblyai | 2.9% | 8 | 2 | 2 | 0 words (untrimmed WER 2.9%) | – | – | – |
| deepgram | 3.6% | 11 | 4 | 0 | 0 words (untrimmed WER 3.6%) | 7.9s | 7.9s–7.9s | 0.04× |
| sarvam | 5.0% | 16 | 5 | 0 | 0 words (untrimmed WER 5.0%) | 19.8s | 19.8s–19.8s | 0.10× |

WER counts only words inside the clip: anything a provider transcribed before the clip started or after it ended (talk in the room while the bots joined) is cut first and shown under Outside clip. See METHODOLOGY.md for the rule.

WER is pooled over all successful rounds. Turnaround is time from the transcribe request to the first poll that saw the job finished, so it overstates the true figure by up to 5s, and it includes MeetStream's queueing, not only the provider's own processing.

## Notes

- **assemblyai**: the transcribe endpoint refused it ({"error":"No API key configured for provider 'assemblyai'. Please add your assemblyai API key in the integrations settings."}); scored the earlier transcript 7e1df053-3d67-495e-8d7f-47da0284b036 from 2026-09-28T16:53:02Z, turnaround not measured

## Errors by provider (first successful round)

`S ref→hyp` substitution, `D ref` deletion (missed word), `I hyp` insertion. Normalised text for each provider is in `transcripts/*.normalized.txt`.

**meetstream** (9 errors): `S linnell's→l'enel's`, `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S birket→burkett`, `S the→a`, `S recognising→recognizing`, `S were→are`

**jigsawstack** (9 errors): `S linnell's→l'enel's`, `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S birket→burkett`, `S the→a`, `S recognising→recognizing`, `S were→are`

**assemblyai** (12 errors): `D at`, `S em→atom`, `S birket→burke`, `I dare`, `S the→a`, `D michael`, `S angelo→michelangelo`, `S mantel→mental`, `I he`, `S recognising→recognizing`, `S were→are`, `S while→all`

**deepgram** (15 errors): `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S idylls→idols`, `S birket→burkitt`, `S carker→parker`, `S fact→effect`, `S the→a`, `D michael`, `S angelo→michelangelo`, `S mantel→mantle`, `S recognising→recognizing`, `D m`, `S a→ma`

**sarvam** (21 errors): `S leighton's→layton's`, `S linnell's→linell's`, `D up`, `S guards→upguards`, `D at`, `S em→adam`, `S jingo→jingle`, `S birket→burkett`, `S carker→karkar`, `S on→in`, `S in→an`, `D finish`, `S in→finishing`, `S the→a`, `D michael`, `S angelo→michelangelo`, `D mantel`, `S board→mantelboard`, `S recognising→recognizing`, `S felicitous→felicitor's`, `S phases→faces`

