import express from 'express';
import ngrok from '@ngrok/ngrok';
import { attachBridge } from './bridgeServer.js';

export function startWebhookServer(port, bridgeOptions) {
  const app = express();
  app.use(express.json({ type: '*/*' }));

  app.get('/health', (_request, response) => response.json({ ok: true }));
  app.post('/webhooks/meetstream', (request, response) => {
    const output = formatWebhookEvent(request.body || {});
    if (output) console.log(output);
    response.status(200).send('ok');
  });
  app.use((error, _request, response, _next) => {
    console.error(`❌ Invalid webhook: ${error.message}`);
    response.status(400).send('invalid request');
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port);
    attachBridge(server, bridgeOptions);
    server.once('listening', () => resolve(server));
    server.once('error', (error) => reject(new Error(
      error.code === 'EADDRINUSE'
        ? `Port ${port} is already in use. Stop the other program or choose a different PORT in .env.`
        : `The webhook listener could not start: ${error.message}`
    )));
  });
}

export function formatWebhookEvent({ event = '', bot_status = '', message = '' }) {
  if (event === 'bot.in_waiting_room') return '⏳ Waiting to be admitted';
  if (event === 'bot.inmeeting') return '✅ Bot joined the meeting';
  if (event === 'bot.kicked') return '⚠️ Bot was removed from the meeting';
  if (/denied|failed|rejected|notallowed/i.test(event)) return `❌ ${message || bot_status || event}`;
  return null;
}

export async function startNgrokTunnel(port) {
  try {
    return await ngrok.forward({ addr: port, authtoken_from_env: true });
  } catch {
    throw new Error('Could not start ngrok. Check NGROK_AUTHTOKEN in .env and your internet connection.');
  }
}
