import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ConversationMediaStore } from '../src/conversation-media.js';

const imageDataUrl = `data:image/png;base64,${Buffer.from('private image bytes').toString('base64')}`;

test('stores a private conversation image once and reads it back by opaque id', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lovense-conversation-media-'));
  const store = new ConversationMediaStore({ directory });
  const first = await store.save({
    conversation: 'Taylor',
    messageKey: 'message-1',
    direction: 'incoming',
    messageIndex: 4,
    dataUrl: imageDataUrl,
    capturedAt: '2026-08-30T12:00:00.000Z'
  });
  const second = await store.save({ conversation: 'Taylor', messageKey: 'message-1', direction: 'incoming', messageIndex: 4, dataUrl: imageDataUrl });
  assert.equal(first.id, second.id);
  const listed = await store.list();
  assert.deepEqual(listed.map(item => ({ id: item.id, conversation: item.conversation, direction: item.direction, mime: item.mime })), [{ id: first.id, conversation: 'Taylor', direction: 'incoming', mime: 'image/png' }]);
  assert.equal(Object.hasOwn(listed[0], 'fileName'), false);
  const stored = await store.read(first.id);
  assert.equal(stored.mime, 'image/png');
  assert.equal(stored.data.toString(), 'private image bytes');
});

test('rejects unsafe or oversized conversation media', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'lovense-conversation-media-'));
  const store = new ConversationMediaStore({ directory, maxBytes: 4 });
  await assert.rejects(() => store.save({ conversation: 'Taylor', messageKey: 'text', dataUrl: 'data:text/html;base64,PGgxPk5vPC9oMT4=' }), /unsupported image format/);
  await assert.rejects(() => store.save({ conversation: 'Taylor', messageKey: 'large', dataUrl: imageDataUrl }), /no larger than/);
});
