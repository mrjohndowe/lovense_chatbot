import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('packaged desktop startup failures are visible and saved for diagnosis', async () => {
  const source = await readFile(new URL('../src/desktop-main.js', import.meta.url), 'utf8');
  assert.match(source, /async function reportStartupFailure\(error\)/);
  assert.match(source, /startup-error\.log/);
  assert.match(source, /dialog\.showErrorBox\(/);
  assert.match(source, /Please take a screenshot of this message when asking for help\./);
  assert.match(source, /await reportStartupFailure\(error\);\s*app\.quit\(\);/);
});
