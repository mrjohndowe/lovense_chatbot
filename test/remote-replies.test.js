import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRemoteConfig } from '../src/remote-config.js';
import { fingerprint } from '../src/remote-chat.js';
import { createReplyDeduper, generateReply } from '../src/replies.js';

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
  assert.match(config.replySystemPrompt, /genuine conversation/);
  assert.match(config.replySystemPrompt, /only when the conversation invites it/);
  assert.equal(config.conversationMemoryMessages, 24);
  assert.equal(config.sendMemoryToOpenAI, false);
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
  assert.match(reply, /^Hey!/);
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

test('prevents duplicate replies within each conversation', () => {
  const dedupe = createReplyDeduper();
  const reply = 'My birthday is April 12, 1990. You can remember that for me 😉';
  assert.equal(dedupe('Taylor', reply), reply);
  assert.match(dedupe('Taylor', reply), /^I already told you—my birthday is April 12, 1990/);
  assert.match(dedupe('Taylor', reply), /^Pay attention—my birthday is April 12, 1990/);
  assert.equal(dedupe('Sophie', reply), reply);
});

test('uses conversation history to vary natural follow-up questions', async () => {
  const config = loadRemoteConfig({});
  const first = await generateReply(config, 'That happened yesterday', globalThis.fetch, { history: [] });
  const later = await generateReply(config, 'That happened yesterday', globalThis.fetch, { history: [{ role: 'user', content: 'Earlier message' }] });
  assert.match(first, /Tell me more/);
  assert.match(later, /How do you feel/);
  assert.notEqual(first, later);
});

test('does not send prior memory to OpenAI unless explicitly enabled', async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'A fresh answer' } }] }) };
  };
  const history = [{ role: 'user', content: 'private earlier message' }];
  await generateReply(loadRemoteConfig({ REPLY_PROVIDER: 'openai', OPENAI_API_KEY: 'test' }), 'new message', fetchImpl, { history });
  assert.equal(requestBody.messages.some(item => item.content === 'private earlier message'), false);
  await generateReply(loadRemoteConfig({ REPLY_PROVIDER: 'openai', OPENAI_API_KEY: 'test', SEND_MEMORY_TO_OPENAI: 'true' }), 'new message', fetchImpl, { history });
  assert.equal(requestBody.messages.some(item => item.content === 'private earlier message'), true);
});

