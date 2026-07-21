# Quick Start

Follow these steps once to prepare the meeting bot.

## 1. Install Node.js

Install the current [Node.js LTS](https://nodejs.org/) version. Open this project folder in VS Code, choose **Terminal > New Terminal**, and enter:

```console
npm install
```

Wait until the command finishes.

## 2. Add your keys

Make a copy of `.env.example` and name the copy `.env`. Open `.env` and replace each placeholder with your own key or meeting link:

```dotenv
MEETSTREAM_API_KEY=your_meetstream_key_here
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
NGROK_AUTHTOKEN=your_ngrok_token_here
MEETING_LINK=https://meet.google.com/abc-defg-hij
```

Create the keys at [MeetStream](https://app.meetstream.ai/), [OpenAI](https://platform.openai.com/api-keys), [Deepgram](https://console.deepgram.com/), and [ngrok](https://dashboard.ngrok.com/get-started/your-authtoken). OpenAI API billing must be enabled.

Keep `.env` private. Do not share it or commit it to Git.

## 3. Understand the OpenAI model

The bot currently uses `gpt-5.6-terra`. It offers a good balance of answer quality and cost for meeting questions and summaries.

- `gpt-5.6-luna`: cheapest; suitable for simple questions and routine summaries.
- `gpt-5.6-terra`: balanced; recommended for this bot.
- `gpt-5.6-sol`: most capable and most expensive; useful for difficult analysis.

OpenAI charges for tokens, which are small pieces of text. Longer meetings cost more because the bot sends the meeting transcript with each wake-word question. The answer also uses tokens, but each answer is limited to 500 output tokens. See the [README model table](README.md#openai-model-choice-and-cost) for current prices.

## 4. Start the bot

Enter this in the terminal:

```console
npm start
```

Admit the bot when it enters the meeting waiting room. It is ready after the terminal shows:

```text
Bot joined the meeting
Meeting chat ready
Listening for: hey bot / hey assistant
```

## 5. Talk to the bot

Say the wake phrase and your request in the same sentence:

```text
Hey bot, what is two times two?
Hey assistant, list the action items.
Hey bot, summarize the meeting.
```

The response appears in the meeting chat. The summary includes the conversation captured since the bot started listening.

## 6. Stop the bot

Click inside the terminal and press **Ctrl+C**. This removes the bot from the meeting and stops the program.

If something does not work, see [Troubleshooting](README.md#troubleshooting).
