import test from 'node:test';
import assert from 'node:assert/strict';
import { formatWebhookEvent } from '../src/webhookServer.js';

test('shows useful bot events and hides routine noise', () => {
  assert.equal(formatWebhookEvent({ event: 'bot.inmeeting' }), '✅ Bot joined the meeting');
  assert.match(formatWebhookEvent({ event: 'bot.failed', message: 'Join failed' }), /Join failed/);
  assert.equal(formatWebhookEvent({ event: 'audio.processed' }), null);
});
