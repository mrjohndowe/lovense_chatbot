import test from 'node:test';
import assert from 'node:assert/strict';
import { createMonitorRetry } from '../src/monitor-retry.js';

test('retries a requested Lovense monitor connection until it starts', async () => {
  const scheduled = [];
  const waitingErrors = [];
  let starts = 0;
  const retry = createMonitorRetry({
    start: async () => {
      starts += 1;
      if (starts === 1) throw new Error('DevTools endpoint is not ready.');
    },
    onWaiting: error => waitingErrors.push(error.message),
    setTimeoutImpl: callback => {
      scheduled.push(callback);
      return { unref() {} };
    },
    clearTimeoutImpl: () => {}
  });

  assert.equal(await retry.activate(), false);
  assert.equal(retry.isRequested(), true);
  assert.equal(retry.isRetryScheduled(), true);
  assert.deepEqual(waitingErrors, ['DevTools endpoint is not ready.']);

  await scheduled.shift()();
  assert.equal(starts, 2);
  assert.equal(retry.isRetryScheduled(), false);
});

test('pausing cancels a pending Lovense monitor retry', async () => {
  let cleared = false;
  const retry = createMonitorRetry({
    start: async () => { throw new Error('Not ready.'); },
    setTimeoutImpl: () => ({ unref() {} }),
    clearTimeoutImpl: () => { cleared = true; }
  });

  await retry.activate();
  retry.pause();
  assert.equal(retry.isRequested(), false);
  assert.equal(retry.isRetryScheduled(), false);
  assert.equal(cleared, true);
});
