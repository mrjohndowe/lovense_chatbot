import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { readDashboardSettings, saveDashboardSettings } from '../src/config-editor.js';

test('dashboard settings update only named config values while retaining comments and other settings', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'lovense-config-'));
  await writeFile(path.join(cwd, 'config.ini'), '; personal settings\r\nCHAT_FIRST_NAME=Old ; keep this comment\r\nREPLY_PROVIDER=template\r\nUNRELATED=value\r\n', 'utf8');
  const values = await readDashboardSettings({ cwd });
  assert.equal(values.CHAT_FIRST_NAME, 'Old');
  await saveDashboardSettings({ ...values, CHAT_FIRST_NAME: 'Taylor', REPLY_PROVIDER: 'ollama' }, { cwd });
  const result = await readFile(path.join(cwd, 'config.ini'), 'utf8');
  assert.match(result, /CHAT_FIRST_NAME=Taylor ; keep this comment/);
  assert.match(result, /REPLY_PROVIDER=ollama/);
  assert.match(result, /UNRELATED=value/);
});

test('dashboard settings reject multiline values before writing', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'lovense-config-'));
  await writeFile(path.join(cwd, 'config.ini'), 'CHAT_FIRST_NAME=Old\r\n', 'utf8');
  await assert.rejects(() => saveDashboardSettings({ CHAT_FIRST_NAME: 'Taylor\nMorgan' }, { cwd }), /single line/);
});

test('dashboard settings do not expose or erase a saved Lovense password when left blank', async () => {
  const cwd = await mkdtemp(path.join(tmpdir(), 'lovense-config-'));
  const filename = path.join(cwd, 'config.ini');
  await writeFile(filename, 'LOVENSE_REMOTE_PASSWORD=private-password\r\nCHAT_FIRST_NAME=Old\r\n', 'utf8');
  const values = await readDashboardSettings({ cwd });
  assert.equal(values.LOVENSE_REMOTE_PASSWORD, '');
  await saveDashboardSettings({ ...values, CHAT_FIRST_NAME: 'Taylor', LOVENSE_REMOTE_PASSWORD: '' }, { cwd });
  assert.match(await readFile(filename, 'utf8'), /LOVENSE_REMOTE_PASSWORD=private-password/);
});
