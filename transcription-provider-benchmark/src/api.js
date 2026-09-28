const axios = require("axios");

const API_BASE = "https://api.meetstream.ai/api/v1";

function client() {
  if (!process.env.MEETSTREAM_API_KEY) {
    console.error("  MEETSTREAM_API_KEY is not set in your .env file.");
    process.exit(1);
  }
  return axios.create({
    baseURL: API_BASE,
    // remove_bot only answers once the bot has actually left the call,
    // which takes several seconds on a real meeting.
    timeout: 60_000,
    headers: {
      Authorization: `Token ${process.env.MEETSTREAM_API_KEY}`,
      "Content-Type": "application/json",
    },
  });
}

/** POST /bots/create_bot. Returns the raw response body. */
async function createBot(payload) {
  const { data } = await client().post("/bots/create_bot", payload);
  return data;
}

/**
 * GET /bots/{id}/status. One of Scheduled, Joining, InWaitingRoom,
 * InMeeting, Recording, Leaving, Stopped, MediaProcessing, Done,
 * Failed, Denied, NotAllowed.
 */
async function getBotStatus(botId) {
  const { data } = await client().get(`/bots/${botId}/status`);
  return String((data && typeof data === "object" ? data.status : data) ?? "");
}

async function removeBot(botId) {
  const { data } = await client().get(`/bots/${botId}/remove_bot`);
  return data;
}

/**
 * POST /bots/{id}/transcribe. Runs the bot's existing recording through
 * `provider` again, so every provider sees byte-identical audio.
 * Returns { bot_id, transcript_id, provider, message }.
 */
async function transcribe(botId, provider) {
  const { data } = await client().post(`/bots/${botId}/transcribe`, { provider });
  return data;
}

/** GET /bots/{id}/transcriptions. Every transcription job for the bot. */
async function listTranscriptions(botId) {
  const { data } = await client().get(`/bots/${botId}/transcriptions`);
  return data?.transcriptions ?? [];
}

/** GET /transcript/{id}/get_transcript. The formatted, speaker-labelled transcript. */
async function getTranscript(transcriptId) {
  const { data } = await client().get(`/transcript/${transcriptId}/get_transcript`);
  return data;
}

/** Turns an axios error into one line that is safe to print and to save in results. */
function describeError(err) {
  const status = err.response?.status;
  const body = err.response?.data;
  const detail =
    typeof body === "string" ? body : body ? JSON.stringify(body) : err.message;
  return status ? `HTTP ${status}: ${detail}` : detail;
}

module.exports = {
  createBot,
  getBotStatus,
  removeBot,
  transcribe,
  listTranscriptions,
  getTranscript,
  describeError,
};
