import test from 'node:test';
import assert from 'node:assert/strict';
import { LovenseClient } from '../src/lovense.js';

test('mock mode never performs a network request', async () => {
  const client = new LovenseClient({ mode: 'mock', toyId: '' }, () => { throw new Error('network called'); });
  const result = await client.send({ command: 'Function', action: 'Vibrate:10', timeSec: 5, apiVer: 1 });
  assert.equal(result.simulated, true);
  assert.equal(client.publicStatus().lastCommand.result, 'simulated');
});

test('server mode adds credentials without exposing them in status', async () => {
  let sent;
  const fetchImpl = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ code: 200, type: 'ok' }) };
  };
  const client = new LovenseClient({ mode: 'server', developerToken: 'secret', userId: 'user-1', toyId: '' }, fetchImpl);
  await client.send({ command: 'Function', action: 'Stop', timeSec: 0, apiVer: 1 });
  assert.equal(sent.token, 'secret');
  assert.equal(sent.uid, 'user-1');
  assert.equal(JSON.stringify(client.publicStatus()).includes('secret'), false);
});
