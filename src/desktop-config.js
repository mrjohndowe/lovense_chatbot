import { copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

async function exists(filename) {
  try {
    await stat(filename);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

/**
 * Gives the packaged application a private, writable configuration location.
 * A development launch may migrate the existing repository config once; a
 * packaged build always starts from the bundled commented example.
 */
export async function ensureDesktopConfig({ userDataPath, exampleConfigPath, legacyConfigPath = '' }) {
  const configPath = path.join(userDataPath, 'config.ini');
  await mkdir(userDataPath, { recursive: true });
  if (await exists(configPath)) return { configPath, created: false, migrated: false };

  if (legacyConfigPath && await exists(legacyConfigPath)) {
    await copyFile(legacyConfigPath, configPath);
    return { configPath, created: true, migrated: true };
  }

  await copyFile(exampleConfigPath, configPath);
  return { configPath, created: true, migrated: false };
}
