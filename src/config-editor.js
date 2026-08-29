import { readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseIni } from './ini-config.js';

export const DASHBOARD_SETTINGS = [
  'CHAT_USERNAME', 'CHAT_DISPLAY_NAME', 'CHAT_FIRST_NAME', 'CHAT_LAST_NAME', 'CHAT_DATE_OF_BIRTH',
  'CHAT_PLACE_OF_BIRTH', 'CHAT_CHILDREN', 'CHAT_AGE', 'CHAT_PRONOUNS', 'CHAT_LOCATION',
  'CHAT_OCCUPATION', 'CHAT_RELATIONSHIP_STATUS', 'CHAT_INTERESTS', 'REPLY_PROVIDER', 'REPLY_MODEL',
  'REPLY_SYSTEM_PROMPT', 'MAX_REPLY_CHARS', 'CONVERSATION_MEMORY_MESSAGES', 'SEND_MEMORY_TO_OPENAI'
];

function configPath(cwd) {
  return path.join(cwd, 'config.ini');
}

function normalizedValue(value, key) {
  const result = String(value ?? '').trim();
  if (/\r|\n/.test(result)) throw new Error(`${key} must be a single line.`);
  if (result.includes(';')) throw new Error(`${key} cannot contain a semicolon because config.ini uses it for comments.`);
  if (result.length > 4000) throw new Error(`${key} is too long.`);
  return result;
}

function updatedText(source, updates) {
  const pending = new Set(Object.keys(updates));
  const lines = source.split(/\r?\n/).map(line => {
    const match = /^(\s*)([A-Z][A-Z0-9_]*)(\s*=)(.*)$/.exec(line);
    if (!match || !pending.has(match[2])) return line;
    pending.delete(match[2]);
    const comment = /\s;/.exec(match[4]);
    return `${match[1]}${match[2]}${match[3]}${updates[match[2]]}${comment ? match[4].slice(comment.index) : ''}`;
  });
  if (pending.size) {
    if (lines.length && lines.at(-1) !== '') lines.push('');
    lines.push('[Dashboard settings]');
    for (const key of pending) lines.push(`${key}=${updates[key]}`);
  }
  return lines.join('\r\n');
}

export async function readDashboardSettings({ cwd = process.cwd() } = {}) {
  const filename = configPath(cwd);
  if (!existsSync(filename)) throw new Error('config.ini was not found. Start the personal launcher once to create it.');
  const values = parseIni(await readFile(filename, 'utf8'));
  return Object.fromEntries(DASHBOARD_SETTINGS.map(key => [key, values[key] || '']));
}

export async function saveDashboardSettings(values, { cwd = process.cwd(), validate } = {}) {
  const filename = configPath(cwd);
  if (!existsSync(filename)) throw new Error('config.ini was not found. Start the personal launcher once to create it.');
  const updates = Object.fromEntries(DASHBOARD_SETTINGS.map(key => [key, normalizedValue(values?.[key], key)]));
  const source = await readFile(filename, 'utf8');
  const candidate = { ...parseIni(source), ...updates };
  if (validate) validate(candidate);
  const temporary = `${filename}.dashboard-save`;
  await writeFile(temporary, updatedText(source, updates), 'utf8');
  await rename(temporary, filename);
  return updates;
}
