# Quick Start

This project launches an Agent already configured in the MeetStream dashboard. You do not need to configure OpenAI in the code.

## 1. Prepare the Hosted Agent

Open **MeetStream Dashboard > Agents** and confirm:

- Mode is **Pipeline**.
- Response type is **Chat**.
- The OpenAI integration is connected.
- Native wake words are enabled with an 8-second active window.
- Deepgram uses `nova-3` and boosts the configured wake phrases and their common transcription variants.
- Your changes are saved.

Copy the complete Agent ID shown in its details.

## 2. Install the Project

Install [Node.js LTS](https://nodejs.org/). Open this folder in VS Code, choose **Terminal > New Terminal**, and enter:

```console
npm install
```

## 3. Add the Bot Settings

Make a copy of `.env.example` and name it `.env`. Replace the placeholders:

```dotenv
MEETSTREAM_API_KEY=your_meetstream_key_here
MEETSTREAM_AGENT_CONFIG_ID=your_agent_config_id_here
NGROK_AUTHTOKEN=your_ngrok_token_here
MEETING_LINK=https://meet.google.com/abc-defg-hij
```

Keep `.env` private. Provider keys belong in **MeetStream Dashboard > Integrations**, not in this project.

## 4. Start the Bot

```console
npm start
```

Admit the bot when it enters the meeting waiting room.

## 5. Use the Agent

Address the Agent and give the request in one sentence:

```text
Hey bot, list the action items.
Okay assistant, summarize the meeting.
```

The reply appears in the meeting chat. Its behavior comes from the Hosted Agent saved in the MeetStream dashboard.
Wait for one response before asking another question so separate requests are not merged into one transcription turn.

## 6. Stop the Bot

Click inside the terminal and press **Ctrl+C**. The program keeps its webhook open until MeetStream confirms the bot stopped, then closes.

If something fails, see [Troubleshooting](README.md#troubleshooting).
