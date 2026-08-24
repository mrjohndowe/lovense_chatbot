import test from 'node:test';
import assert from 'node:assert/strict';
import { createFollowUpTracker, latestTextMessage } from '../src/follow-up.js';

const incoming = { index: 4, direction: 'incoming', type: 'text', text: 'Are you still there?' };
const outgoing = { index: 5, direction: 'outgoing', type: 'text', text: 'Yep, still here.' };

test('finds the last actual text message', () => {
  assert.equal(latestTextMessage([incoming, { index: 5, direction: 'incoming', type: 'non-text', text: '' }]), incoming);
});

test('periodic follow-up waits, claims once, and only follows an incoming last message', () => {
  let clock = 1_000;
  const tracker = createFollowUpTracker({ idleMs: 60_000, now: () => clock });

  assert.equal(tracker.inspect('Taylor', [incoming]), null);
  clock += 59_999;
  assert.equal(tracker.inspect('Taylor', [incoming]), null);
  clock += 1;
  assert.equal(tracker.inspect('Taylor', [incoming])?.text, incoming.text);
  assert.equal(tracker.inspect('Taylor', [incoming]), null);

  clock += 120_000;
  assert.equal(tracker.inspect('Taylor', [incoming, outgoing]), null);
});

test('periodic follow-up does nothing while sending is ineligible', () => {
  let clock = 0;
  const tracker = createFollowUpTracker({ idleMs: 1_000, now: () => clock });
  tracker.inspect('Taylor', [incoming]);
  clock = 2_000;
  assert.equal(tracker.inspect('Taylor', [incoming], { eligible: false }), null);
  assert.equal(tracker.inspect('Taylor', [incoming], { eligible: true })?.text, incoming.text);
});
