import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureLovenseRemote, lovenseStartupPowerShellScript } from '../src/remote-launcher.js';

test('starts Lovense Remote without elevating it above the Assistant', () => {
  const script = lovenseStartupPowerShellScript('C:\\Lovense\\Lovense_Remote.exe', 'C:\\Lovense');
  assert.match(script, /--remote-debugging-address=127\.0\.0\.1/);
  assert.match(script, /--remote-debugging-port=9223/);
  assert.doesNotMatch(script, /-Verb\s+RunAs/i);
});

test('does not start Lovense Remote when its debug endpoint is already ready', async () => {
  let started = false;
  const result = await ensureLovenseRemote({ debugUrl: 'http://127.0.0.1:9223', remoteExecutable: process.execPath }, { fetchImpl: async () => ({ ok: true }), start: async () => { started = true; } });
  assert.deepEqual(result, { started: false });
  assert.equal(started, false);
});

test('starts Lovense Remote and waits for its debug endpoint when it is unavailable', async () => {
  let calls = 0;
  let startArguments;
  const result = await ensureLovenseRemote({ debugUrl: 'http://127.0.0.1:9223', remoteExecutable: process.execPath }, { fetchImpl: async () => ({ ok: ++calls >= 2 }), start: async (...args) => { startArguments = args; }, waitImpl: async () => {} });
  assert.deepEqual(result, { started: true });
  assert.equal(startArguments[0], process.execPath);
});
