import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configureWakeWordBypass,
  deployBot,
  removeBot,
  validateAgentConfig,
  verifyMiaConfig
} from '../src/deployBot.js';

test('verifyMiaConfig fetches the requested live config', async (context) => {
  context.mock.method(console, 'log', () => {});
  context.mock.method(globalThis, 'fetch', async (url) => {
    assert.equal(url.searchParams.get('agent_config_id'), 'agent-1');
    return Response.json({ agent_config: { AgentConfigID: 'agent-1' } });
  });
  assert.equal((await verifyMiaConfig('secret', 'agent-1')).AgentConfigID, 'agent-1');
});

test('pipeline wake words use the native gate', async (context) => {
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.agent_config_id, 'agent-1');
    assert.equal(body.model.model, 'gpt-4.1-mini');
    assert.match(body.model.system_prompt, /already activated/);
    assert.equal(body.wake_word.enabled, true);
    assert.equal(body.wake_word.timeout, 8);
    assert.ok(body.wake_word.words.includes('okay assistant'));
    assert.ok(body.wake_word.words.includes('here assistant'));
    assert.equal(body.transcriber.provider, 'deepgram');
    assert.equal(body.transcriber.model, 'nova-3');
    assert.ok(body.transcriber.boostwords.includes('hey assistant'));
    assert.equal(body.agent.response_type, 'chat');
    assert.equal(body.agent.response_modality, 'chat');
    return Response.json({ agent_config: { Model: body.model } });
  });
  await configureWakeWordBypass(
    'secret',
    'agent-1',
    {
      Mode: 'pipeline',
      Model: { provider: 'openai', model: 'gpt-4.1-mini', system_prompt: 'normal' },
      Agent: { first_message: 'connected' }
    },
    false
  );
});

test('validateAgentConfig requires the current chat response field', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    agent_configs: [{
      AgentConfigID: 'agent-1',
      Mode: 'pipeline',
      Agent: { response_type: 'chat', vad_create_response: true },
      Transcriber: { provider: 'openai', boostwords: ['hey assistant'] },
      Voice: { provider: 'openai' },
      WakeWord: { enabled: false, words: ['hey assistant'] }
    }]
  }));

  assert.equal((await validateAgentConfig('secret', 'agent-1')).Mode, 'pipeline');
});

test('validateAgentConfig accepts the legacy dashboard chat response field', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    agent_configs: [{
      AgentConfigID: 'agent-1',
      Mode: 'pipeline',
      Agent: { response_modality: 'chat', vad_create_response: true },
      Transcriber: { provider: 'openai', boostwords: ['hey assistant'] },
      Voice: { provider: 'openai' },
      WakeWord: { enabled: false, words: ['hey assistant'] }
    }]
  }));

  assert.equal((await validateAgentConfig('secret', 'agent-1')).Mode, 'pipeline');
});

test('validateAgentConfig accepts a disabled native wake gate without boost words', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    agent_configs: [{
      AgentConfigID: 'agent-1',
      Mode: 'pipeline',
      Agent: { response_type: 'chat', vad_create_response: true },
      Transcriber: { provider: 'openai', model: 'whisper-1' },
      Voice: { provider: 'none' },
      WakeWord: { enabled: false }
    }]
  }));

  assert.equal((await validateAgentConfig('secret', 'agent-1')).Mode, 'pipeline');
});

test('validateAgentConfig requires words when the native wake gate is enabled', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    agent_configs: [{
      AgentConfigID: 'agent-1',
      Mode: 'pipeline',
      Agent: { response_type: 'chat', vad_create_response: true },
      Transcriber: { provider: 'openai', model: 'whisper-1' },
      Voice: { provider: 'none' },
      WakeWord: { enabled: true }
    }]
  }));

  await assert.rejects(
    () => validateAgentConfig('secret', 'agent-1'),
    /native wake-word/
  );
});

test('validateAgentConfig accepts realtime chat mode', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    agent_configs: [{
      AgentConfigID: 'agent-1',
      Mode: 'realtime',
      Agent: { response_type: 'chat' },
      Model: { provider: 'openai', model: 'gpt-realtime-mini', voice: 'alloy' }
    }]
  }));

  assert.equal((await validateAgentConfig('secret', 'agent-1')).Mode, 'realtime');
});

test('validateAgentConfig rejects an unsupported OpenAI Realtime voice', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({
    agent_configs: [{
      AgentConfigID: 'agent-1',
      Mode: 'realtime',
      Agent: { response_type: 'chat' },
      Model: { provider: 'openai', model: 'gpt-realtime-mini', voice: 'elliot' }
    }]
  }));

  await assert.rejects(() => validateAgentConfig('secret', 'agent-1'), /not supported/);
});

test('deployBot attaches the MeetStream Hosted Agent', async (context) => {
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.agent_config_id, 'agent-1');
    assert.equal(body.bot_message, "Hi, I'm MIA Chat Bot. Ask me a question or ask me to summarize the meeting.");
    assert.equal(body.socket_connection_url, undefined);
    assert.equal(body.live_audio_required, undefined);
    assert.equal(body.callback_url, 'https://example.ngrok-free.dev/webhooks/meetstream');
    assert.equal(body.live_transcription_required, undefined);
    assert.equal(body.recording_config, undefined);
    return Response.json({ bot_id: 'bot-1' }, { status: 201 });
  });

  await deployBot({
    apiKey: 'secret',
    agentConfigId: 'agent-1',
    meetingLink: 'https://meet.google.com/test',
    callbackUrl: 'https://example.ngrok-free.dev/webhooks/meetstream'
  });
});

test('removeBot asks MeetStream to remove the active bot', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.headers.Authorization, 'Token secret');
    assert.equal(url, 'https://api.meetstream.ai/api/v1/bots/bot%2F123/remove_bot');
    assert.equal(options.method, 'GET');
    assert.equal(options.body, undefined);
    return new Response(null, { status: 200 });
  });

  let confirmedId;
  await removeBot('secret', 'bot/123', async (botId) => { confirmedId = botId; });
  assert.equal(confirmedId, 'bot/123');
});

test('removeBot does not claim success when the bot cannot be found', async (context) => {
  context.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/remove_bot')) return new Response(null, { status: 404 });
    return new Response(null, { status: 404 });
  });
  await assert.rejects(
    () => removeBot('secret', 'bot-1', async () => { throw new Error('timeout'); }),
    /90 seconds/
  );
});

test('removeBot retries when a joining bot ignores the first stop signal', async (context) => {
  let removals = 0;
  context.mock.method(globalThis, 'fetch', async (url) => {
    if (url.endsWith('/remove_bot')) {
      removals++;
      return new Response(null, { status: 200 });
    }
    return Response.json({ bot_details: { Status: 'Joining' } });
  });
  let waits = 0;
  await removeBot('secret', 'bot-1', async () => {
    if (++waits === 1) throw new Error('timeout');
  });
  assert.equal(removals, 2);
});
