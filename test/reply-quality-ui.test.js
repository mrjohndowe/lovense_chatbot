import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('does not show skipped unreadable replies as held conversations', async () => {
  const source = await readFile(new URL('../public/remote.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /Held for readability review/);
  assert.match(source, /item\.status === 'waiting' \|\| item\.status === 'drafted'/);
  assert.doesNotMatch(source, /item\.status === 'drafted' \|\| item\.status === 'blocked'/);
  assert.match(source, /if \(item\.error\) badge\.title = item\.error/);
});
