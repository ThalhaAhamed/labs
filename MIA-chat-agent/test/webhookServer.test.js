import test from 'node:test';
import assert from 'node:assert/strict';
import { createBotEventTracker, formatWebhookEvent } from '../src/webhookServer.js';

test('shows useful bot events and hides routine noise', () => {
  assert.equal(formatWebhookEvent({ bot_event: 'bot.inmeeting' }), '✅ Bot joined the meeting');
  assert.equal(formatWebhookEvent({ bot_event: 'bot.stopped' }), '✅ MeetStream reports the bot stopped');
  assert.match(formatWebhookEvent({ bot_event: 'bot.failed', message: 'Join failed' }), /Join failed/);
  assert.match(formatWebhookEvent({ bot_event: 'agent.error', message: 'Provider quota exceeded' }), /quota/);
  assert.equal(formatWebhookEvent({ bot_event: 'audio.processed' }), null);
});

test('shows live transcription in the terminal', () => {
  assert.equal(formatWebhookEvent({ new_text: 'Okay assistant' }), 'Heard: Okay assistant');
  assert.equal(
    formatWebhookEvent({ channel: { alternatives: [{ transcript: 'What is two times two?' }] } }),
    'Heard: What is two times two?'
  );
});

test('confirms only the matching bot terminal event', async () => {
  const tracker = createBotEventTracker();
  const waiting = tracker.waitForTerminal('bot-1', 100);
  tracker.handle({ bot_event: 'bot.stopped', bot_id: 'bot-2' });
  tracker.handle({ bot_event: 'bot.stopped', bot_id: 'bot-1' });
  await waiting;
});

test('rejects when MeetStream sends no terminal event', async () => {
  const tracker = createBotEventTracker();
  await assert.rejects(() => tracker.waitForTerminal('bot-1', 5), /did not confirm/);
});
