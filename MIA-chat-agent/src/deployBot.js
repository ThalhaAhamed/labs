import { randomUUID } from 'node:crypto';

const BOT_URL = 'https://api.meetstream.ai/api/v1/bots/create_bot';
const GREETING = "Hi! Say 'hey bot' followed by 'summarize' or your question, and I'll reply here in chat.";

function formatApiError(status, message = '') {
  const explanations = {
    400: 'MeetStream rejected the bot settings.',
    403: 'MeetStream denied access. Check MEETSTREAM_API_KEY.',
    404: 'MeetStream could not find the requested bot.',
    405: 'MeetStream rejected the request method.',
    500: 'MeetStream had a server error. Try again shortly.'
  };
  return `${explanations[status] || `MeetStream returned error ${status}.`}${message ? ` ${message}` : ''}`;
}

export async function deployBot({ apiKey, meetingLink, callbackUrl }) {
  const callback = new URL(callbackUrl);
  const bridgeUrl = `wss://${callback.host}`;
  const session = randomUUID();
  const payload = {
    meeting_link: meetingLink,
    bot_name: 'Meeting Summary Bot',
    video_required: false,
    bot_message: GREETING,
    socket_connection_url: {
      websocket_url: `${bridgeUrl}/bridge?session=${session}`
    },
    live_audio_required: {
      websocket_url: `${bridgeUrl}/bridge/audio?session=${session}`
    }
  };
  if (callbackUrl) payload.callback_url = callbackUrl;

  const response = await fetch(BOT_URL, {
    method: 'POST',
    headers: {
      Authorization: `Token ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  }).catch(() => {
    throw new Error('Could not connect to MeetStream. Check your internet connection and try again.');
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(formatApiError(response.status, data.message || data.error));
  if (!data.bot_id) throw new Error('MeetStream deployed the bot but did not return its ID, so it cannot be stopped safely.');
  return data;
}

export async function removeBot(apiKey, botId) {
  const headers = {
    Authorization: `Token ${apiKey}`,
    'Content-Type': 'application/json'
  };
  const response = await fetch(`https://api.meetstream.ai/api/v1/bots/${encodeURIComponent(botId)}/remove_bot`, {
    method: 'GET',
    headers
  }).catch(() => {
    throw new Error('Could not ask MeetStream to remove the bot.');
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(formatApiError(response.status, data.message || data.error));
  }

  for (let attempt = 0; attempt < 10; attempt++) {
    const statusResponse = await fetch(`https://api.meetstream.ai/api/v1/bots/${encodeURIComponent(botId)}/detail`, { headers })
      .catch(() => null);
    if (statusResponse?.status === 404) return;
    const status = statusResponse?.ok
      ? (await statusResponse.json().catch(() => ({}))).bot_details?.Status
      : null;
    if (['Done', 'Stopped', 'Failed', 'MediaExpired'].includes(status)) return;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  throw new Error('MeetStream accepted the removal request but the bot still appears active after 10 seconds.');
}
