import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('holds blocked replies in the review queue so they can be edited', async () => {
  const source = await readFile(new URL('../public/remote.js', import.meta.url), 'utf8');
  assert.match(source, /item\.status === 'blocked' \? 'Held for readability review'/);
  assert.match(source, /item\.status === 'waiting' \|\| item\.status === 'drafted' \|\| item\.status === 'blocked'/);
  assert.match(source, /if \(item\.error\) badge\.title = item\.error/);
});
