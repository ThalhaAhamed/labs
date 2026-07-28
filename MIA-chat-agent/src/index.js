import dotenv from 'dotenv';
import { configureWakeWordBypass, deployBot, removeBot, validateAgentConfig } from './deployBot.js';
import { createBotEventTracker, startNgrokTunnel, startWebhookServer } from './webhookServer.js';

let server;
let tunnel;
let activeBot;
let stopping;
let startup;
const botEvents = createBotEventTracker();

dotenv.config({ override: true, quiet: true });

function settings() {
  const required = ['MEETSTREAM_API_KEY', 'MEETSTREAM_AGENT_CONFIG_ID', 'MEETING_LINK'];
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

  if (callbackUrl && !/^https:\/\//i.test(callbackUrl)) throw new Error('CALLBACK_URL must be a public address starting with https://.');
  const bypassValue = process.env.BYPASS_WAKE_WORD?.trim().toLowerCase() || 'false';
  if (!['true', 'false'].includes(bypassValue)) throw new Error('BYPASS_WAKE_WORD must be true or false.');

  return {
    apiKey: process.env.MEETSTREAM_API_KEY.trim(),
    agentConfigId: process.env.MEETSTREAM_AGENT_CONFIG_ID.trim(),
    meetingLink: meetingLink.href,
    port,
    callbackUrl,
    bypassWakeWord: bypassValue === 'true'
  };
}

async function main() {
  const config = settings();
  const agent = await validateAgentConfig(config.apiKey, config.agentConfigId);
  await configureWakeWordBypass(config.apiKey, config.agentConfigId, agent, config.bypassWakeWord);
  if (config.bypassWakeWord) console.warn('⚠️ Wake-word bypass is ACTIVE: MIA will respond to every final transcript.');
  console.log(`✅ Hosted Agent ready (${agent.Mode}, chat)`);
  server = await startWebhookServer(config.port, botEvents.handle);
  console.log(`✅ Local server ready on port ${config.port}`);
  if (!config.callbackUrl) {
    tunnel = await startNgrokTunnel(config.port);
    config.callbackUrl = `${tunnel.url().replace(/\/$/, '')}/webhooks/meetstream`;
    console.log('✅ Secure tunnel ready');
  }

  const deployed = await deployBot(config);
  activeBot = { apiKey: config.apiKey, id: deployed.bot_id };
  if (stopping) return;
  console.log(`⏳ Hosted Agent joining meeting (session: ${deployed.bot_id})`);
  console.log(`Test session ${deployed.bot_id}: keep Google Meet chat visible and do not press Ctrl+C for at least 30 seconds after "Bot is listening".`);
}

startup = main().catch(async (error) => {
  console.error(`❌ ${error.message}`);
  if (!stopping) await closeServices();
  process.exitCode = 1;
});

async function closeServices() {
  if (tunnel) await tunnel.close().catch(() => {});
  if (server) await new Promise((resolve) => server.close(resolve));
}

async function stop() {
  if (stopping) return stopping;
  stopping = (async () => {
    console.log('\nStopping...');
    await startup;
    if (activeBot) {
      try {
        await removeBot(activeBot.apiKey, activeBot.id, botEvents.waitForTerminal);
        activeBot = null;
        console.log('✅ MeetStream confirmed the bot stopped');
      } catch (error) {
        process.exitCode = 1;
        console.error(`❌ Could not confirm bot removal: ${error.message}`);
      }
    }
    await closeServices();
  })();
  await stopping;
  process.exitCode ??= 0;
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
