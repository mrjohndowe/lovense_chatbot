import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('desktop hotkey hides or restores the assistant alongside Lovense Remote', async () => {
  const source = await readFile(new URL('../src/desktop-main.js', import.meta.url), 'utf8');
  assert.match(source, /globalShortcut\.register\('Control\+Alt\+Shift\+L', togglePairedWindows\)/);
  assert.match(source, /toggleLovenseAndAssistantWindows\(\)/);
  assert.match(source, /'-Paired', '-AssistantProcessId', String\(process\.pid\)/);
  assert.doesNotMatch(source, /mainWindow\.hide\(\)/);
  assert.doesNotMatch(source, /'-Once'/);
  assert.match(source, /The Assistant was left visible so the two windows stay together\./);
  assert.match(source, /Lovense Remote may be running as Administrator\./);
  assert.match(source, /app\.asar\.unpacked/);
});
