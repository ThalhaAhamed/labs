# Quick Start

## 1. Install

Install [Node.js LTS](https://nodejs.org/), open this project folder in a terminal, and run:

```console
npm install
```

## 2. Configure

Copy `.env.example` to `.env`. Add your keys and meeting link:

```dotenv
MEETSTREAM_API_KEY=your_meetstream_key_here
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
NGROK_AUTHTOKEN=your_ngrok_token_here
MEETING_LINK=https://meet.google.com/abc-defg-hij
```

Create keys at [MeetStream](https://app.meetstream.ai/), [OpenAI](https://platform.openai.com/api-keys), [Deepgram](https://console.deepgram.com/), and [ngrok](https://dashboard.ngrok.com/get-started/your-authtoken).

OpenAI API billing must be enabled. The OpenAI and Deepgram keys are used locally and do not need to be added to MeetStream Integrations.

## 3. Start

```console
npm start
```

Admit the bot when it enters the waiting room. When these lines appear, it is ready:

```text
✅ Bot joined the meeting
✅ Meeting chat ready
✅ Listening for: hey bot / hey assistant
```

Say `hey bot` or `hey assistant` followed by a question. Say `hey bot, summarize the meeting` for a summary of the complete conversation captured since startup.

Press Ctrl+C to remove the bot and stop the program.
