import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { lovenseDevtoolsUrl, waitForLovenseDevtoolsUrl } from '../src/lovense-devtools.js';

test('opens the Lovense page DevTools endpoint from the local debugging target list', async () => {
  const url = await lovenseDevtoolsUrl('http://127.0.0.1:9223/', {
    fetchImpl: async () => ({
      ok: true,
      json: async () => [
        { type: 'page', title: 'Other window', devtoolsFrontendUrl: '/devtools/ignored' },
        { type: 'page', title: 'Lovense Remote', devtoolsFrontendUrl: '/devtools/inspector.html?ws=127.0.0.1:9223/devtools/page/1' }
      ]
    })
  });
  assert.equal(url, 'http://127.0.0.1:9223/devtools/inspector.html?ws=127.0.0.1:9223/devtools/page/1');
});

test('waits for the DevTools page after Lovense Remote starts', async () => {
  let calls = 0;
  const url = await waitForLovenseDevtoolsUrl('http://127.0.0.1:9223', {
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? { ok: false, status: 503, json: async () => [] }
        : { ok: true, json: async () => [{ type: 'page', title: 'Lovense Remote', devtoolsFrontendUrl: 'https://devtools.example.test/' }] };
    },
    waitImpl: async () => {},
    timeoutMs: 10_000
  });
  assert.equal(calls, 2);
  assert.equal(url, 'https://devtools.example.test/');
});

test('rejects a missing Lovense DevTools target instead of opening a different page', async () => {
  await assert.rejects(
    lovenseDevtoolsUrl('http://127.0.0.1:9223', { fetchImpl: async () => ({ ok: true, json: async () => [] }) }),
    /debugging target is unavailable/
  );
});

test('the packaged desktop app exposes a manual DevTools action without opening it at startup', async () => {
  const source = await readFile(new URL('../src/desktop-main.js', import.meta.url), 'utf8');
  assert.match(source, /label: 'Open Lovense Developer Tools'/);
  assert.doesNotMatch(source, /void openLovenseDevtools\(\)/);
});
