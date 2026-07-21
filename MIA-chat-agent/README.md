# MeetStream Meeting Chat Bot

A Node.js bot that joins Google Meet, Zoom, or Microsoft Teams meetings. Deepgram transcribes the meeting, OpenAI answers requests, and MeetStream posts the answers in meeting chat.

The bot responds only when an utterance contains a configured trigger such as `hey bot` or `hey assistant`. It keeps the complete in-memory transcript for full-meeting summaries.

## Requirements

- [Node.js 20 or newer](https://nodejs.org/)
- [MeetStream API key](https://app.meetstream.ai/)
- [OpenAI API key](https://platform.openai.com/api-keys) with API billing enabled
- [Deepgram API key](https://console.deepgram.com/)
- [ngrok authtoken](https://dashboard.ngrok.com/get-started/your-authtoken), unless `CALLBACK_URL` is set

OpenAI and Deepgram are called directly by this app. Their keys do not need to be added to MeetStream Integrations.

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

After the bot is admitted, the terminal should show:

```text
✅ Bot joined the meeting
✅ Meeting chat ready
✅ Listening for: hey bot / hey assistant
```

Spoken text is marked with `🎤`. Answers are marked with `💬` and sent to meeting chat. Routine webhook and post-processing events are hidden.

Press Ctrl+C to remove the bot from the meeting and close the local server and tunnel.

## Test

```console
npm test
```

## Troubleshooting

- `OPENAI_API_KEY failed`: replace the key and confirm API billing or credits are available.
- No `Meeting chat ready`: MeetStream did not connect to the local control WebSocket.
- No `Listening for`: check the MeetStream audio connection, `DEEPGRAM_API_KEY`, and its quota.
- No `🎤` output: confirm the bot is admitted and both readiness messages appeared.
- No reply: say the trigger and request in one utterance, for example `hey bot, summarize the meeting`.
- Bot stays in the meeting after Ctrl+C: note the printed bot session ID and retry Ctrl+C once.

The transcript is kept only in memory and is discarded when the process stops.
