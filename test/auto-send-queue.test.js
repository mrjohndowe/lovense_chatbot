import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('arming automatic sending clears old held review items before switching unread chats', async () => {
  const source = await readFile(new URL('../src/remote-server.js', import.meta.url), 'utf8');
  assert.match(source, /const enabling = body\.enabled === true && !autoSend/);
  assert.match(source, /item\.status === 'waiting' \|\| item\.status === 'drafted' \|\| item\.status === 'blocked'/);
  assert.match(source, /item\.status = 'dismissed'/);
  assert.match(source, /status: quality\.ok \? 'waiting' : 'skipped'/);
  assert.match(source, /Reply was skipped because it failed the readability check/);
});
