import test from 'node:test';
import assert from 'node:assert/strict';
import { unrepliedIncomingText } from '../src/reply-catchup.js';
import { readFile } from 'node:fs/promises';

test('returns the unanswered incoming text tail when the latest real text has no reply', () => {
  const messages = [
    { index: 1, direction: 'incoming', type: 'text', text: 'Earlier question' },
    { index: 2, direction: 'outgoing', type: 'text', text: 'Earlier answer' },
    { index: 3, direction: 'incoming', type: 'text', text: 'Are you still there?' },
    { index: 4, direction: 'incoming', type: 'text', text: 'I wanted to ask something else.' },
    { index: 5, direction: 'incoming', type: 'image', text: '' }
  ];
  assert.deepEqual(unrepliedIncomingText(messages), [messages[2], messages[3]]);
});

test('does not catch up when an outgoing text already follows the incoming message', () => {
  const messages = [
    { index: 1, direction: 'incoming', type: 'text', text: 'Hello' },
    { index: 2, direction: 'outgoing', type: 'text', text: 'Hi' }
  ];
  assert.deepEqual(unrepliedIncomingText(messages), []);
});

test('does not treat a non-text entry as an unanswered message', () => {
  assert.deepEqual(unrepliedIncomingText([
    { index: 1, direction: 'incoming', type: 'text', text: 'Hello' },
    { index: 2, direction: 'outgoing', type: 'image', text: '' }
  ]), [{ index: 1, direction: 'incoming', type: 'text', text: 'Hello' }]);
});

test('enabling automatic sending requests a catch-up scan even if another scan is active', async () => {
  const source = await readFile(new URL('../src/remote-server.js', import.meta.url), 'utf8');
  assert.match(source, /let catchUpRequested = false/);
  assert.match(source, /const requestedCatchUp = catchUp \|\| catchUpRequested/);
  assert.match(source, /catchUpRequested = true;\s*await scan\(\{ catchUp: true \}\)/);
});
