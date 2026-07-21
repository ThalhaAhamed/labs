import test from 'node:test';
import assert from 'node:assert/strict';
import { deployBot, removeBot } from '../src/deployBot.js';

test('deployBot uses fresh local bridge URLs', async (context) => {
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    const control = new URL(body.socket_connection_url.websocket_url);
    const audio = new URL(body.live_audio_required.websocket_url);
    assert.equal(control.origin, 'wss://example.ngrok-free.dev');
    assert.equal(control.pathname, '/bridge');
    assert.equal(audio.pathname, '/bridge/audio');
    assert.equal(control.searchParams.get('session'), audio.searchParams.get('session'));
    assert.ok(control.searchParams.get('session'));
    return Response.json({ bot_id: 'bot-1' }, { status: 201 });
  });

  await deployBot({ apiKey: 'secret', meetingLink: 'https://meet.google.com/test', callbackUrl: 'https://example.ngrok-free.dev/webhooks/meetstream' });
});

test('removeBot asks MeetStream to remove the active bot', async (context) => {
  let calls = 0;
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    calls++;
    assert.equal(options.headers.Authorization, 'Token secret');
    if (calls === 1) {
      assert.equal(url, 'https://api.meetstream.ai/api/v1/bots/bot%2F123/remove_bot');
      assert.equal(options.method, 'GET');
      assert.equal(options.body, undefined);
      return new Response(null, { status: 200 });
    }
    assert.equal(url, 'https://api.meetstream.ai/api/v1/bots/bot%2F123/detail');
    return Response.json({ bot_details: { Status: 'Stopped' } });
  });

  await removeBot('secret', 'bot/123');
  assert.equal(calls, 2);
});
