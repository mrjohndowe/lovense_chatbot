import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [bridge, server, viewer] = await Promise.all([
  readFile(new URL('../src/remote-chat.js', import.meta.url), 'utf8'),
  readFile(new URL('../src/remote-server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/conversations.js', import.meta.url), 'utf8')
]);

test('captures image sources from Lovense and saves them through the private media store', () => {
  assert.match(bridge, /const imageSrc=String\(image\?\.currentSrc\|\|image\?\.src\|\|''\)/);
  assert.match(bridge, /async imageDataUrl\(imageSrc/);
  assert.match(server, /new ConversationMediaStore\(/);
  assert.match(server, /await saveConversationImages\(snapshot\)/);
  assert.match(server, /message\.imageSrc/);
});

test('shows saved images through authenticated local API requests rather than public file links', () => {
  assert.match(server, /pathname === '\/api\/media'/);
  assert.match(server, /pathname\.startsWith\('\/api\/media\/'\)/);
  assert.match(viewer, /fetch\(`\/api\/media\/\$\{encodeURIComponent\(savedMedia\.id\)\}`/);
  assert.match(viewer, /headers: headers\(\)/);
  assert.match(viewer, /URL\.createObjectURL/);
});
