import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ensureDesktopConfig } from '../src/desktop-config.js';

test('creates the desktop config from the bundled example only when missing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lovense-desktop-config-'));
  const userDataPath = path.join(root, 'user-data');
  const exampleConfigPath = path.join(root, 'config.example.ini');
  await writeFile(exampleConfigPath, 'ENABLE_AUTO_SEND=false\n', 'utf8');

  const first = await ensureDesktopConfig({ userDataPath, exampleConfigPath });
  assert.deepEqual(first, { configPath: path.join(userDataPath, 'config.ini'), created: true, migrated: false });
  assert.equal(await readFile(first.configPath, 'utf8'), 'ENABLE_AUTO_SEND=false\n');

  await writeFile(first.configPath, 'ENABLE_AUTO_SEND=true\n', 'utf8');
  const second = await ensureDesktopConfig({ userDataPath, exampleConfigPath });
  assert.deepEqual(second, { configPath: first.configPath, created: false, migrated: false });
  assert.equal(await readFile(first.configPath, 'utf8'), 'ENABLE_AUTO_SEND=true\n');
});

test('migrates an existing development config without changing its encrypted values', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'lovense-desktop-migration-'));
  const userDataPath = path.join(root, 'user-data');
  const exampleConfigPath = path.join(root, 'config.example.ini');
  const legacyConfigPath = path.join(root, 'config.ini');
  await writeFile(exampleConfigPath, 'ENABLE_AUTO_SEND=false\n', 'utf8');
  await writeFile(legacyConfigPath, 'LOVENSE_REMOTE_PASSWORD_ENCRYPTED=v1.private-value\n', 'utf8');

  const result = await ensureDesktopConfig({ userDataPath, exampleConfigPath, legacyConfigPath });
  assert.equal(result.migrated, true);
  assert.equal(await readFile(result.configPath, 'utf8'), 'LOVENSE_REMOTE_PASSWORD_ENCRYPTED=v1.private-value\n');
});
