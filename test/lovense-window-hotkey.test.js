import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('personal launcher starts a single hidden Lovense window hotkey helper', async () => {
  const [launcher, helper] = await Promise.all([
    readFile(new URL('../scripts/start-personal.ps1', import.meta.url), 'utf8'),
    readFile(new URL('../scripts/toggle-lovense-window.ps1', import.meta.url), 'utf8')
  ]);
  assert.match(launcher, /toggle-lovense-window\.ps1/);
  assert.match(launcher, /WindowStyle Hidden/);
  assert.match(helper, /LovenseReplyAssistantWindowHotkey/);
  assert.match(helper, /RegisterHotKey/);
  assert.match(helper, /0x0001 -bor 0x0002 -bor 0x0004/);
  assert.match(helper, /ShowWindow\(\$window, \$hide\)/);
  assert.match(helper, /ShowWindow\(\$window, \$restore\)/);
  assert.match(helper, /param\(\[switch\]\$Once, \[switch\]\$Restore\)/);
  assert.match(helper, /if \(\$Once\)/);
  assert.match(helper, /if \(\$Restore\)/);
  assert.match(helper, /function Restore-PairedWindows/);
  assert.match(helper, /function Get-AssistantWindow/);
  assert.match(helper, /function Toggle-PairedWindows/);
  assert.match(helper, /ShowWindow\(\$assistantWindow, \$hide\)/);
  assert.match(helper, /EnumWindows/);
  assert.match(helper, /FindTopLevelWindow/);
  assert.match(helper, /GetWindowThreadProcessId/);
  assert.doesNotMatch(helper, /MainWindowHandle/);
});
