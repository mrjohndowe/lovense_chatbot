import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { chaturbateMessage, parseTipRules, twitchMessage, verifyTwitch } from '../src/integrations.js';

test('verifies a current Twitch EventSub signature', () => {
  const raw = Buffer.from('{"ok":true}');
  const timestamp = new Date().toISOString();
  const id = 'event-1';
  const secret = 'testing-secret';
  const signature = `sha256=${createHmac('sha256', secret).update(id).update(timestamp).update(raw).digest('hex')}`;
  assert.equal(verifyTwitch({ 'twitch-eventsub-message-id': id, 'twitch-eventsub-message-timestamp': timestamp, 'twitch-eventsub-message-signature': signature }, raw, secret), true);
  assert.equal(verifyTwitch({ 'twitch-eventsub-message-id': id, 'twitch-eventsub-message-timestamp': timestamp, 'twitch-eventsub-message-signature': 'sha256=bad' }, raw, secret), false);
});

test('normalizes Twitch chat messages', () => {
  assert.deepEqual(twitchMessage({ subscription: { type: 'channel.chat.message' }, event: { chatter_user_id: '42', message: { text: '/stop' } } }), { userId: '42', message: '/stop' });
});

test('maps the highest matching Chaturbate tip rule', () => {
  const rules = parseTipRules('25:5:5,50:10:8,100:15:10', 30);
  assert.deepEqual(chaturbateMessage({ type: 'tip', username: 'viewer', tokens: 75 }, rules), { userId: 'viewer', message: '/vibe 10 8', tip: 75 });
});

test('ignores tips below the configured minimum', () => {
  assert.equal(chaturbateMessage({ type: 'tip', username: 'viewer', tokens: 1 }, parseTipRules('25:5:5')), null);
});
