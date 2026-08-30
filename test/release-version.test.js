import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

function compareStableVersions(left, right) {
  const leftParts = left.split('.').map(Number);
  const rightParts = right.split('.').map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}

test('release version remains newer than the original 0.2.0 desktop installer', async () => {
  const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
  assert.match(manifest.build.buildVersion, /^\d+\.\d+\.\d+$/);
  assert.equal(manifest.version, manifest.build.buildVersion);
  assert.ok(compareStableVersions(manifest.version, '0.2.0') > 0);
});
