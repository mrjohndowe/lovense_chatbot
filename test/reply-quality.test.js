import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectReplyQuality, requireReadableReply } from '../src/reply-quality.js';

test('allows a normal conversational reply through the readability check', () => {
  const result = inspectReplyQuality('Cool, I am doing well. How are you?');
  assert.deepEqual(result, { ok: true, reply: 'Cool, I am doing well. How are you?' });
});

test('blocks garbled text with non-standard spacing before it can be sent', () => {
  const gibberish = 'o(nI\u00A0fsomuinlde\u00A0fsalmoiwllyy,,\u00A0wah\u00A0ilciht\u00A0tmleea\u00A0nssm\u00A0iyroku\u00A0pklnaoywi';
  assert.deepEqual(inspectReplyQuality(gibberish), {
    ok: false,
    error: 'The reply contains excessive non-standard spacing.'
  });
  assert.throws(() => requireReadableReply(gibberish), /readability check failed/);
});

test('blocks words that contain unexpected punctuation in the middle', () => {
  assert.deepEqual(inspectReplyQuality('I am d(oing fine today.'), {
    ok: false,
    error: 'The reply contains broken words or punctuation inside a word.'
  });
});
