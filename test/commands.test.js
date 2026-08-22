import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/commands.js';

test('parses bounded vibration command', () => {
  assert.deepEqual(parseCommand('/vibe 12 8'), {
    type: 'device',
    payload: { command: 'Function', action: 'Vibrate:12', timeSec: 8, apiVer: 1 },
    summary: 'Vibration 12/20 for 8 seconds.'
  });
});

test('parses stop and an official preset', () => {
  assert.equal(parseCommand('/stop').payload.action, 'Stop');
  assert.equal(parseCommand('/pattern wave 5').payload.name, 'wave');
});

test('rejects out-of-range values', () => {
  assert.throws(() => parseCommand('/vibe 21 3'), /Strength/);
  assert.throws(() => parseCommand('/vibe 10 31', 30), /Seconds/);
});

test('ordinary chat cannot activate a device', () => {
  assert.equal(parseCommand('please vibrate').type, 'chat');
});
