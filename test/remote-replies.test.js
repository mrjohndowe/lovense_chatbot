import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRemoteConfig } from '../src/remote-config.js';
import { fingerprint } from '../src/remote-chat.js';
import { generateReply } from '../src/replies.js';

test('loads safe localhost review defaults', () => {
  const config = loadRemoteConfig({});
  assert.equal(config.debugUrl, 'http://127.0.0.1:9223');
  assert.equal(config.monitorEnabled, true);
  assert.equal(config.autoSend, false);
  assert.equal(config.autoSendMinDelayMs, 8000);
  assert.equal(config.autoSendMaxDelayMs, 25000);
  assert.equal(config.autoSendTypingMsPerChar, 45);
  assert.equal(config.replyProvider, 'template');
  assert.equal(config.pollMs, 2500);
  assert.match(config.replySystemPrompt, /dominant, teasing, and flirty/);
  assert.match(config.replySystemPrompt, /consenting adult/);
});

test('automatic sending requires an explicit opt-in and bounded delay', () => {
  const config = loadRemoteConfig({ ENABLE_AUTO_SEND: 'true', AUTO_SEND_MIN_DELAY_SECONDS: '1', AUTO_SEND_MAX_DELAY_SECONDS: '3' });
  assert.equal(config.autoSend, true);
  assert.equal(config.autoSendMinDelayMs, 2000);
  assert.equal(config.autoSendMaxDelayMs, 3000);
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
  assert.match(reply, /^Hey, you\./);
  assert.ok(reply.length <= 80);
});
test('local template mode answers configured identity questions', async () => {
  const config = loadRemoteConfig({
    CHAT_FIRST_NAME: 'Taylor',
    CHAT_LAST_NAME: 'Morgan',
    CHAT_DATE_OF_BIRTH: '04/12/1990',
    CHAT_PLACE_OF_BIRTH: 'Denver, Colorado',
    CHAT_CHILDREN: 'I do not have children'
  });
  assert.match(await generateReply(config, 'What is your first name?'), /Taylor/);
  assert.match(await generateReply(config, 'What is your last name?'), /Morgan/);
  assert.match(await generateReply(config, 'When is your birthday?'), /April 12, 1990/);
  assert.match(await generateReply(config, 'Where were you born?'), /Denver, Colorado/);
  assert.match(await generateReply(config, 'Do you have any children?'), /I do not have children/);
});

test('rejects an invalid birth date format', () => {
  assert.throws(() => loadRemoteConfig({ CHAT_DATE_OF_BIRTH: 'April 12' }), /MM\/DD\/YYYY/);
});

test('rejects an impossible birth date', () => {
  assert.throws(() => loadRemoteConfig({ CHAT_DATE_OF_BIRTH: '02/30/1990' }), /valid date/);
});


