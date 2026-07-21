# MeetStream Meeting Chat Bot

A Node.js bot that joins Google Meet, Zoom, or Microsoft Teams meetings. Deepgram turns speech into text, OpenAI answers requests, and MeetStream posts the answers in the meeting chat.

The bot responds only when someone says a configured wake phrase such as `hey bot` or `hey assistant`. It keeps the meeting transcript in memory so it can summarize everything discussed since the bot started listening.

## Requirements

- [Node.js 20 or newer](https://nodejs.org/)
- [MeetStream API key](https://app.meetstream.ai/)
- [OpenAI API key](https://platform.openai.com/api-keys) with API billing enabled
- [Deepgram API key](https://console.deepgram.com/)
- [ngrok authtoken](https://dashboard.ngrok.com/get-started/your-authtoken), unless `CALLBACK_URL` is set

OpenAI and Deepgram are called directly by this app. Their keys do not need to be added to MeetStream Integrations.

## OpenAI model choice and cost

The bot currently uses `gpt-5.6-terra`, which is the balanced choice for meeting questions and summaries.

| Model | Best for | Input cost | Output cost |
| --- | --- | ---: | ---: |
| `gpt-5.6-luna` | Routine questions and summaries at the lowest cost | $1 per 1 million tokens | $6 per 1 million tokens |
| `gpt-5.6-terra` | Better-quality meeting assistance with balanced cost | $2.50 per 1 million tokens | $15 per 1 million tokens |
| `gpt-5.6-sol` | Difficult analysis where answer quality matters more than speed or cost | $5 per 1 million tokens | $30 per 1 million tokens |

Prices are current as of July 22, 2026. Check the [official OpenAI model comparison](https://developers.openai.com/api/docs/models/compare) before budgeting because prices can change.

A token is a small piece of text. OpenAI charges separately for:

- **Input tokens:** the transcript, instructions, and question sent to the model.
- **Output tokens:** the answer returned by the model.

This bot sends the complete transcript again whenever it answers a wake-word request. Therefore, questions asked later in a long meeting use more input tokens than questions asked near the beginning. Only wake-word requests call OpenAI; ordinary speech is transcribed but does not create an OpenAI response. Deepgram transcription is billed separately.

The bot limits each answer to 500 output tokens and uses no extra reasoning effort. It usually consumes less than that limit because replies are requested to be concise. For this use case, keep `gpt-5.6-terra` for balanced quality or choose `gpt-5.6-luna` when minimizing cost is more important.

## Setup

```console
npm install
```

Copy `.env.example` to `.env` and set:

```dotenv
MEETSTREAM_API_KEY=your_meetstream_key_here
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
NGROK_AUTHTOKEN=your_ngrok_token_here
MEETING_LINK=https://meet.google.com/abc-defg-hij
```

Optional settings:

```dotenv
PORT=3000
WAKE_WORD=hey bot,hey assistant
# CALLBACK_URL=https://your-domain.example/webhooks/meetstream
```

`CALLBACK_URL` replaces the automatic ngrok tunnel and must be a public HTTPS URL.

## Run

```console
npm start
```

After admitting the bot to the meeting, wait for these messages:

```text
Bot joined the meeting
Meeting chat ready
Listening for: hey bot / hey assistant
```

Say the wake phrase and request in the same sentence, for example: `hey bot, summarize the meeting`.

Press Ctrl+C to remove the bot from the meeting and close the local server and tunnel.

## Test

```console
npm test
```

## Troubleshooting

- `OPENAI_API_KEY failed`: replace the key and confirm API billing or credits are available.
- No `Meeting chat ready`: MeetStream did not connect to the local chat connection.
- No `Listening for`: check the MeetStream audio connection, Deepgram key, and Deepgram quota.
- No spoken text in the terminal: confirm the bot was admitted and both readiness messages appeared.
- No reply: say the wake phrase and request together, for example `hey bot, what are the action items?`.
- Bot stays after Ctrl+C: note the displayed bot session ID and press Ctrl+C once more.

The transcript is stored only in memory and is discarded when the program stops.
