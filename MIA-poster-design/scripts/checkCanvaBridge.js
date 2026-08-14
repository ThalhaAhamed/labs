import dotenv from 'dotenv';
import { createCanvaBridge } from '../src/canvaBridge.js';
import { startWebhookServer } from '../src/webhookServer.js';

dotenv.config({ quiet: true });
const apiKey = process.env.MEETSTREAM_API_KEY?.trim();
if (!apiKey || /^your_.+_here$/i.test(apiKey)) {
  throw new Error('Fill in MEETSTREAM_API_KEY in .env first.');
}

const bridge = createCanvaBridge(apiKey);
let server;

try {
  server = await startWebhookServer(0, () => {}, bridge.handle);
  const { port } = server.address();
  const call = async (body) => {
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bridge.secret}`,
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream'
      },
      body: JSON.stringify(body)
    });
    return response.status === 202 ? null : response.json();
  };
  const initialized = await call({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'mia-check', version: '1' } }
  });
  if (initialized.error) throw new Error(initialized.error.message);
  await call({ jsonrpc: '2.0', method: 'notifications/initialized' });
  const listed = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} });
  if (listed.result?.tools?.map((tool) => tool.name).join(',') !== 'generate-design') {
    throw new Error('generate-design is unavailable.');
  }
  console.log('Canva bridge verified: generate-design');
} finally {
  await bridge.close();
  if (server) await new Promise((resolve) => server.close(resolve));
}
