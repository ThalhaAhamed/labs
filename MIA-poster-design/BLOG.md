# From Meeting Brief to Editable Poster

MIA Poster Design turns a meeting conversation into an editable Canva design without running a speech or language-model stack on the developer's laptop.

MeetStream hosts the agent pipeline. Deepgram `nova-3` transcribes the meeting, MeetStream's native wake-word gate listens for phrases such as "Hey MIA," and OpenAI `gpt-4.1-mini` receives the meeting context. Once MIA knows an event type plus one useful detail, or the participant explicitly asks it to generate, it calls Canva rather than repeatedly asking for optional details. Missing creative choices use sensible defaults; factual event details are never invented.

The agent has one allowed capability: Canva's `generate-design`. This project runs `mcp-remote` as an owner-only bridge to Canva's hosted MCP service and persists the owner's OAuth session in `.mcp-auth`. The bridge exposes only `generate-design`, requires a private Bearer credential, and returns real Canva and thumbnail links.

The local Node.js app validates the live MeetStream configuration, creates the secure public bridge and webhook, deploys the saved agent with `agent_config_id`, and keeps the meeting chat response path concise. There is no local speech pipeline, wake-word parser, or direct OpenAI call.

Shutdown is part of correctness. Ctrl+C requests removal of the exact active bot, keeps the webhook available for confirmation, retries while the bot is still joining, and closes the tunnel and server after MeetStream reaches a terminal state.
