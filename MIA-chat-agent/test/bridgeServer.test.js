import test from 'node:test';
import assert from 'node:assert/strict';
import { generateOpenAI, matchesWakeWord, validateOpenAIKey } from '../src/bridgeServer.js';

test('matches spoken wake words despite punctuation', () => {
  assert.equal(matchesWakeWord('Hey, bot. What is two times two?', ['hey bot']), true);
  assert.equal(matchesWakeWord('What is two times two?', ['hey bot']), false);
});

test('rejects an unusable OpenAI key before deploying', async (context) => {
  context.mock.method(globalThis, 'fetch', async () => Response.json({ error: { message: 'invalid key' } }, { status: 400 }));
  await assert.rejects(() => validateOpenAIKey('bad'), /invalid key/);
});

test('uses low-reasoning OpenAI Responses for meeting chat', async (context) => {
  context.mock.method(globalThis, 'fetch', async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.equal(body.model, 'gpt-5.6-terra');
    assert.deepEqual(body.reasoning, { effort: 'none' });
    return Response.json({ output: [{ content: [{ type: 'output_text', text: 'four' }] }] });
  });

  assert.equal(await generateOpenAI('key', 'two times two'), 'four');
});
