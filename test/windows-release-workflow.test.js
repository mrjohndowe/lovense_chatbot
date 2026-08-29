import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('GitHub workflow builds and publishes the Windows executables from version tags', async () => {
  const workflow = await readFile(new URL('../.github/workflows/windows-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /runs-on: windows-latest/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run dist -- --publish onTag/);
  assert.match(workflow, /path: release\/\*\.exe/);
  assert.match(workflow, /GH_TOKEN: \$\{\{ github\.token \}\}/);
});
