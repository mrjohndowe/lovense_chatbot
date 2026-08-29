import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('desktop hotkey hides or restores the assistant alongside Lovense Remote', async () => {
  const source = await readFile(new URL('../src/desktop-main.js', import.meta.url), 'utf8');
  assert.match(source, /globalShortcut\.register\('Control\+Alt\+Shift\+L', togglePairedWindows\)/);
  assert.match(source, /mainWindow\.hide\(\)/);
  assert.match(source, /toggleLovenseWindow\(\)/);
  assert.match(source, /'-Once'/);
  assert.match(source, /app\.asar\.unpacked/);
});
