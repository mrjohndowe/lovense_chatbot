import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chooseRandomToyControl, randomDelayMs } from '../src/toy-random.js';

const config = {
  toyRandomMinLevel: 0,
  toyRandomMaxLevel: 2,
  toyRandomMinIntervalMs: 3000,
  toyRandomMaxIntervalMs: 8000
};
const toy = {
  functions: [
    { index: 0, name: 'Vibrate', min: 0, max: 5, step: 0.2 },
    { index: 1, name: 'Speed', min: 0, max: 5, step: 0.2 }
  ]
};

test('random delay remains inside the configured interval', () => {
  assert.equal(randomDelayMs(config, () => 0), 3000);
  assert.equal(randomDelayMs(config, () => 0.999999), 8000);
});

test('random selection can choose speed and stays step-aligned inside limits', () => {
  const values = [0.9, 0.75];
  const selection = chooseRandomToyControl(toy, config, null, () => values.shift());
  assert.equal(selection.functionIndex, 1);
  assert.equal(selection.name, 'Speed');
  assert.ok(selection.value >= 0 && selection.value <= 2);
  assert.ok(Math.abs(selection.value / 0.2 - Math.round(selection.value / 0.2)) < 1e-9);
});

test('random selection avoids an identical consecutive value when alternatives exist', () => {
  const previous = { functionIndex: 0, value: 1 };
  const values = [0, 0.5];
  const selection = chooseRandomToyControl(toy, config, previous, () => values.shift());
  assert.equal(selection.functionIndex, 0);
  assert.notEqual(selection.value, 1);
});


test('server exposes Random status and cancels it on every stop path', async () => {
  const source = await readFile(new URL('../src/remote-server.js', import.meta.url), 'utf8');
  assert.match(source, /randomEnabled: randomToyEnabled/);
  assert.match(source, /pathname === '\/api\/toys\/stop'[\s\S]*?stopRandomToy\(\{ stopToy: false \}\)[\s\S]*?stopToy\(toy\.id\)/);
  assert.match(source, /body\.enabled === true[\s\S]*?scheduleRandomToyChange\(\)/);
  assert.match(source, /if \(selectedToyId && selectedToyId !== toy\.id\)[\s\S]*?stopRandomToy\(\)/);
});

test('server stays available when Lovense Remote is not yet exposing its debug port', async () => {
  const source = await readFile(new URL('../src/remote-server.js', import.meta.url), 'utf8');
  assert.match(source, /createMonitorRetry/);
  assert.match(source, /await startWatching\(\);/);
  assert.match(source, /Waiting for Lovense Remote\. The Assistant will retry automatically/);
});
