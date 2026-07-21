import dotenv from 'dotenv';
import { validateOpenAIKey } from './bridgeServer.js';
import { deployBot, removeBot } from './deployBot.js';
import { startNgrokTunnel, startWebhookServer } from './webhookServer.js';

let server;
let tunnel;
let activeBot;
let stopping;

dotenv.config({ override: true, quiet: true });

function settings() {
  const required = ['MEETSTREAM_API_KEY', 'OPENAI_API_KEY', 'DEEPGRAM_API_KEY', 'MEETING_LINK'];
  const callbackUrl = process.env.CALLBACK_URL?.trim();
  if (!callbackUrl) required.push('NGROK_AUTHTOKEN');
  const missing = required.filter((name) => !process.env[name]?.trim() || /^your_.+_here$/i.test(process.env[name].trim()));
  if (missing.length) throw new Error(`Fill in ${missing.join(', ')} in your .env file, then run npm start again.`);

  let meetingLink;
  try {
    meetingLink = new URL(process.env.MEETING_LINK);
  } catch {
    throw new Error('MEETING_LINK must be the full meeting address, starting with https://.');
  }
  if (meetingLink.protocol !== 'https:') throw new Error('MEETING_LINK must start with https://.');

  const port = Number(process.env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT in .env must be a whole number from 1 to 65535.');

  const wakeWords = (process.env.WAKE_WORD || 'hey bot,hey assistant').split(',').map((word) => word.trim()).filter(Boolean);
  if (!wakeWords.length) throw new Error('WAKE_WORD must contain at least one phrase, such as hey bot.');

  if (callbackUrl && !/^https:\/\//i.test(callbackUrl)) throw new Error('CALLBACK_URL must be a public address starting with https://.');

  return {
    apiKey: process.env.MEETSTREAM_API_KEY.trim(),
    openaiKey: process.env.OPENAI_API_KEY.trim(),
    deepgramKey: process.env.DEEPGRAM_API_KEY.trim(),
    meetingLink: meetingLink.href,
    port,
    wakeWords,
    callbackUrl
  };
}

async function main() {
  const config = settings();
  await validateOpenAIKey(config.openaiKey);
  console.log('✅ OpenAI ready');
  server = await startWebhookServer(config.port, config);
  console.log(`✅ Local server ready on port ${config.port}`);
  if (!config.callbackUrl) {
    tunnel = await startNgrokTunnel(config.port);
    config.callbackUrl = `${tunnel.url().replace(/\/$/, '')}/webhooks/meetstream`;
    console.log('✅ Secure tunnel ready');
  }

  const deployed = await deployBot(config);
  if (stopping) {
    await removeBot(config.apiKey, deployed.bot_id);
    return;
  }
  activeBot = { apiKey: config.apiKey, id: deployed.bot_id };
  console.log(`⏳ Bot joining meeting (session: ${deployed.bot_id})`);
}

main().catch(async (error) => {
  console.error(`❌ ${error.message}`);
  await closeServices();
  process.exitCode = 1;
});

async function closeServices() {
  if (tunnel) await tunnel.close().catch(() => {});
  server?.closeBridge?.();
  if (server) await new Promise((resolve) => server.close(resolve));
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    console.log('\nStopping...');
    if (activeBot) {
      await removeBot(activeBot.apiKey, activeBot.id)
        .then(() => console.log('✅ Bot left the meeting'))
        .catch((error) => console.error(`❌ Could not remove bot: ${error.message}`));
      activeBot = null;
    }
    await closeServices();
  })();
  await stopping;
  process.exitCode = 0;
}

process.once('SIGINT', stop);
process.once('SIGTERM', stop);
