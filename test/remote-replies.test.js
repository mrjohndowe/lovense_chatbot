import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRemoteConfig } from '../src/remote-config.js';
import { fingerprint } from '../src/remote-chat.js';
import { generateReply } from '../src/replies.js';

test('loads safe localhost review defaults', () => {
  const config = loadRemoteConfig({});
  assert.equal(config.debugUrl, 'http://127.0.0.1:9223');
  assert.equal(config.monitorEnabled, true);
  assert.equal(config.replyProvider, 'template');
  assert.equal(config.pollMs, 2500);
});

test('requires a key only when OpenAI replies are selected', () => {
  assert.throws(() => loadRemoteConfig({ REPLY_PROVIDER: 'openai' }), /OPENAI_API_KEY/);
  assert.equal(loadRemoteConfig({ REPLY_PROVIDER: 'openai', OPENAI_API_KEY: 'test-key' }).replyModel, 'gpt-4.1-mini');
});

test('message fingerprints separate conversations and repeated positions', () => {
  assert.notEqual(fingerprint('A', '1\0hello'), fingerprint('B', '1\0hello'));
  assert.notEqual(fingerprint('A', '1\0hello'), fingerprint('A', '2\0hello'));
});

test('template mode generates bounded replies without a network call', async () => {
  const config = loadRemoteConfig({ MAX_REPLY_CHARS: '80' });
  const reply = await generateReply(config, 'Hello there', () => { throw new Error('network must not be used'); });
  assert.match(reply, /^Hey!/);
  assert.ok(reply.length <= 80);
});
