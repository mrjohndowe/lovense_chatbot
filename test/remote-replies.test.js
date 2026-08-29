import test from 'node:test';
import assert from 'node:assert/strict';
import { WORD_LIBRARY } from '../src/word-library.js';
import { composeLocalSentence, LOCAL_SENTENCE_COMBINATIONS } from '../src/sentence-composer.js';

test('offline word library supports a large grammar-aware response space', () => {
  const topLevelWords = Object.entries(WORD_LIBRARY)
    .filter(([key]) => key !== 'topics')
    .flatMap(([, value]) => Array.isArray(value) ? value : Object.values(value).flat());
  const topicWords = Object.values(WORD_LIBRARY.topics).flatMap(topic => [...topic.subjects, ...topic.questions]);
  assert.ok(topLevelWords.length + topicWords.length >= 250);
  assert.ok(LOCAL_SENTENCE_COMBINATIONS >= 1_000_000);

  const samples = new Set();
  for (const intent of Object.keys(WORD_LIBRARY.topics)) {
    for (let turn = 0; turn < 8; turn += 1) {
      samples.add(composeLocalSentence({
        intent,
        tone: intent === 'dating' ? 'flirty' : 'neutral',
        message: 'Tell me about this',
        history: Array.from({ length: turn }, (_, index) => ({ role: 'user', content: 'turn ' + index }))
      }));
    }
  }
  assert.ok(samples.size >= 80);
  assert.ok([...samples].every(reply => /^[A-Z]/.test(reply) && /[.!?]$/.test(reply)));
});
import { loadRemoteConfig } from '../src/remote-config.js';
import { fingerprint } from '../src/remote-chat.js';
import { createReplyDeduper, generateReply } from '../src/replies.js';

test('loads safe localhost review defaults', () => {
  const config = loadRemoteConfig({});
  assert.equal(config.debugUrl, 'http://127.0.0.1:9223');
  assert.equal(config.monitorEnabled, true);
  assert.equal(config.autoOpenMessages, true);
  assert.equal(config.autoSend, false);
  assert.equal(config.autoSwitchUnreadChats, true);
  assert.equal(config.periodicFollowUpEnabled, false);
  assert.equal(config.followUpIdleMs, 15 * 60_000);
  assert.equal(config.followUpSweepMs, 5 * 60_000);
  assert.equal(config.autoSendMinDelayMs, 8000);
  assert.equal(config.autoSendMaxDelayMs, 25000);
  assert.equal(config.autoSendTypingMsPerChar, 45);
  assert.equal(config.replyProvider, 'template');
  assert.equal(config.pollMs, 2500);
  assert.match(config.replySystemPrompt, /genuine conversation/);
  assert.match(config.replySystemPrompt, /only when the conversation invites it/);
  assert.equal(config.conversationMemoryMessages, 24);
  assert.equal(config.sendMemoryToOpenAI, false);
  assert.equal(config.ollamaApiKey, '');
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
  assert.match(reply, /day|mood|doing|going|mind|brought/i);
  assert.ok(reply.length <= 80);
});
test('one-word greetings can receive simple human-style replies', async () => {
  const config = loadRemoteConfig({});
  const allowed = /^(Hi|Hey|Hello|Hey 😊|Hi, HRU\?|HRU\?|Hey, you|Hi there)$/;
  const replies = [];
  for (let turn = 0; turn < 8; turn += 1) {
    replies.push(await generateReply(config, 'Hey', globalThis.fetch, {
      history: Array.from({ length: turn }, (_, index) => ({ role: 'user', content: 'turn ' + index }))
    }));
  }
  assert.ok(replies.every(reply => allowed.test(reply)));
  assert.ok(new Set(replies).size >= 4);
  assert.ok(replies.every(reply => reply.length <= 10));
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
  assert.match(first, /recent|thinking about|just happened/i);
  assert.match(later, /recent|thinking about|just happened/i);
  assert.notEqual(first, later);
});

test('continues a story about someone leaving with a direct natural reply', async () => {
  const config = loadRemoteConfig({});
  const first = await generateReply(config, "yea that I think she isn't coming back", globalThis.fetch, { history: [] });
  assert.match(first, /made up her mind|before she left|not coming back/i);
  assert.doesNotMatch(first, /perspective interests|real moment|walk me through/i);

  const followup = await generateReply(config, 'nothing its just her demeanor', globalThis.fetch, { history: [
    { role: 'user', content: "yea that I think she isn't coming back" },
    { role: 'assistant', content: first }
  ] });
  assert.match(followup, /acting distant|carries herself|checked out/i);
  assert.doesNotMatch(followup, /perspective interests|real moment|say more/i);
});

test('neutral composed replies stay concise and conversational', async () => {
  const config = loadRemoteConfig({});
  const reply = await generateReply(config, 'There is something I have been thinking about');
  assert.ok(reply.split(/[.!?]+/).filter(Boolean).length <= 2);
  assert.doesNotMatch(reply, /perspective interests|real moment|I want to learn more/i);

  const samples = [];
  for (let turn = 0; turn < 10; turn += 1) {
    samples.push(await generateReply(config, 'She has been acting strange lately', globalThis.fetch, {
      history: Array.from({ length: turn }, (_, index) => ({ role: 'user', content: 'turn ' + index }))
    }));
  }
  assert.ok(samples.some(sample => !sample.includes('?')));
  assert.ok(samples.every(sample => !/processing|weighing on you|your perspective|real moment|tell me more/i.test(sample)));
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


test('sends an Ollama API key as a bearer token when configured', async () => {
  let requestUrl;
  let requestOptions;
  const fetchImpl = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return { ok: true, json: async () => ({ message: { content: 'Cloud reply' } }) };
  };
  const config = loadRemoteConfig({ REPLY_PROVIDER: 'ollama', REPLY_MODEL: 'gpt-oss:120b', OLLAMA_URL: 'https://ollama.com/', OLLAMA_API_KEY: 'ollama-test-key' });
  assert.equal(await generateReply(config, 'Hello', fetchImpl), 'Cloud reply');
  assert.equal(requestUrl, 'https://ollama.com/api/chat');
  assert.equal(requestOptions.headers.authorization, 'Bearer ollama-test-key');
  assert.equal(JSON.parse(requestOptions.body).model, 'gpt-oss:120b');
});

test('does not send an authorization header to local Ollama without a key', async () => {
  let requestOptions;
  const fetchImpl = async (_url, options) => {
    requestOptions = options;
    return { ok: true, json: async () => ({ message: { content: 'Local reply' } }) };
  };
  await generateReply(loadRemoteConfig({ REPLY_PROVIDER: 'ollama' }), 'Hello', fetchImpl);
  assert.equal(requestOptions.headers.authorization, undefined);
});

test('uses per-request studio instructions and length caps for a model reply', async () => {
  let requestBody;
  const fetchImpl = async (_url, options) => {
    requestBody = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: 'A tailored reply' } }] }) };
  };
  const config = loadRemoteConfig({ REPLY_PROVIDER: 'openai', OPENAI_API_KEY: 'test' });
  const reply = await generateReply(config, 'Manual message', fetchImpl, { systemPrompt: 'Studio rule: write 12 to 20 words.', maxReplyChars: 200 });
  assert.equal(reply, 'A tailored reply');
  assert.equal(requestBody.messages[0].content, 'Studio rule: write 12 to 20 words.');
});

test('answers casual reciprocal questions instead of using a generic question reply', async () => {
  const config = loadRemoteConfig({});
  const reply = await generateReply(config, 'Just chilling, hbu?', globalThis.fetch, { history: [
    { role: 'user', content: 'hey' },
    { role: 'assistant', content: 'Hi there. What are you up to today?' }
  ] });
  assert.match(reply, /I’m (doing pretty good|good)/);
  assert.doesNotMatch(reply, /Tell me a little more|Ask me nicely/);
});

test('uses the preceding assistant turn to clarify what it meant', async () => {
  const config = loadRemoteConfig({});
  const reply = await generateReply(config, 'what do you mean?', globalThis.fetch, { history: [
    { role: 'assistant', content: 'Tell me a little more about what you mean.' }
  ] });
  assert.match(reply, /interested|wanted more|hear more/);
  assert.doesNotMatch(reply, /Ask me nicely/);
});

test('expanded template covers everyday topics with relevant follow-ups', async () => {
  const config = loadRemoteConfig({});
  const cases = [
    ['I had a rough day at work', /work|productive|people/i],
    ['I am cooking dinner', /having|cooking|comfort food|flavor|hungry/i],
    ['I found a new song', /listening|song|music|concert|repeat/i],
    ['I am watching a movie', /watching|watch|shows|movie|character|good/i],
    ['I am going to the gym', /workout|motivated|go/i],
    ['I feel stressed', /rough|work stuff|hate days/i],
    ['I am exhausted', /tired|long day|rest|sleepyhead/i]
  ];
  for (const [message, expected] of cases) {
    const reply = await generateReply(config, message);
    assert.match(reply, expected, message);
  }
});

test('expanded template prioritizes boundaries over playful language', async () => {
  const config = loadRemoteConfig({});
  const reply = await generateReply(config, 'Stop, this is too much and I am not comfortable');
  assert.match(reply, /stop|boundary|slow down/i);
  assert.doesNotMatch(reply, /teas|dominant|attention/i);
});

test('expanded template asks for consent and limits around remote toy control', async () => {
  const config = loadRemoteConfig({});
  assert.match(await generateReply(config, 'Take control of my toy'), /boundar|comfortable|stop|avoid/i);
  assert.match(await generateReply(config, 'Be dominant and tell me what to do'), /consent|boundar|comfortable|off-limits|avoid/i);
});

test('expanded template responds naturally to compliments and affection', async () => {
  const config = loadRemoteConfig({});
  assert.match(await generateReply(config, 'You are really cute'), /compliment|charming|attention/i);
  assert.match(await generateReply(config, 'I miss you'), /mind|missed|catch me up/i);
});

test('expanded template uses configured facts and does not invent missing ones', async () => {
  const configured = loadRemoteConfig({ CHAT_LOCATION: 'Denver, Colorado', CHAT_OCCUPATION: 'I am a developer' });
  assert.match(await generateReply(configured, 'Where do you live?'), /Denver, Colorado/);
  assert.match(await generateReply(configured, 'What do you do for work?'), /developer/);
  const empty = loadRemoteConfig({});
  assert.match(await generateReply(empty, 'Where do you live?'), /haven’t filled/i);
});


