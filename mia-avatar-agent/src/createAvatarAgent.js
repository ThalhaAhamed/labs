import "dotenv/config";
import { pathToFileURL } from "node:url";
import { request, requireEnv } from "./http.js";

// Creates a realtime MIA agent with the Anam avatar enabled. Returns an
// agent_config_id you pass to create_bot to deploy the avatar into a meeting.
//
// The model/voice/prompt are configurable via .env (see .env.example) so you
// can pick your own stack instead of the hardcoded defaults below -- those
// defaults just match MeetStream's own "Realtime - Avatar (Anam)" reference
// example, they aren't the only thing this can create.
export async function createAvatarAgent() {
  const meetstreamApiKey = requireEnv("MEETSTREAM_API_KEY");
  const avatarId = requireEnv("ANAM_AVATAR_ID");

  const agentName = process.env.MIA_AGENT_NAME || "MIA Avatar Agent";
  const modelProvider = process.env.MIA_MODEL_PROVIDER || "openai";
  const modelName = process.env.MIA_MODEL_NAME || "gpt-realtime-mini";
  const modelVoice = process.env.MIA_MODEL_VOICE || "coral";
  const temperature = Number(process.env.MIA_MODEL_TEMPERATURE ?? 0.8);
  const systemPrompt =
    process.env.MIA_SYSTEM_PROMPT ||
    "You are a helpful AI meeting assistant. Keep responses concise and natural. Listen actively and provide value to the conversation.";
  const firstMessage =
    process.env.MIA_FIRST_MESSAGE ||
    "Hey there! I am your AI assistant, ready to help with your meeting.";
  const avatarProvider = process.env.ANAM_AVATAR_PROVIDER || "anam";

  const agent = await request("https://api.meetstream.ai/api/v1/mia", {
    method: "POST",
    headers: {
      Authorization: `Token ${meetstreamApiKey}`,
      "Content-Type": "application/json",
    },
    // Structure matches the "Realtime - Avatar (Anam)" example on
    // https://docs.meetstream.ai/api-reference/api-endpoints/mia/create-agent-config
    // Note the top-level avatar block is `Avatar` (capitalized) in
    // MeetStream's own reference and response payloads.
    body: {
      agent_name: agentName,
      mode: "realtime",
      model: {
        provider: modelProvider,
        model: modelName,
        system_prompt: systemPrompt,
        first_message: firstMessage,
        temperature,
        voice: modelVoice,
        modalities: ["text", "audio"],
        max_response_output_tokens: 200,
      },
      voice: null,
      transcriber: null,
      agent: {
        tools: [],
        preemptive_generation: false,
        user_away_timeout: 15,
        interruptions: {
          min_duration_seconds: 0.5,
          word_threshold: 0,
        },
        false_interruption_timeout: 2,
        vad_type: "server_vad",
        enable_interruptions: true,
        resume_false_interruption: true,
        tools_enabled: false,
        vad_threshold: 0.5,
        vad_prefix_padding_ms: 0,
        vad_silence_duration_ms: 200,
      },
      audio: {
        sample_rate: 24000,
        num_channels: 1,
      },
      wake_word: null,
      Avatar: {
        provider: avatarProvider,
        enabled: true,
        avatar_id: avatarId,
        ...(process.env.ANAM_AVATAR_MODEL && {
          avatar_model: process.env.ANAM_AVATAR_MODEL,
        }),
        ...(process.env.ANAM_AVATAR_NAME && {
          name: process.env.ANAM_AVATAR_NAME,
        }),
      },
    },
  });

  console.log("Created a new MIA avatar agent on your MeetStream account:");
  console.log(JSON.stringify(agent, null, 2));
  console.log(
    `\nThis agent_config_id is yours, not a shared/global one. Paste it into your own .env as:\n` +
      `  MIA_AGENT_CONFIG_ID=${agent.agent_config_id}\n` +
      `so future runs reuse this same agent instead of creating a new one every time.`
  );

  return agent;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  createAvatarAgent().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
