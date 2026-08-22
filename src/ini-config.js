import fs from 'node:fs';
import path from 'node:path';

export function parseIni(text) {
  const values = {};
  for (const [index, sourceLine] of String(text || '').split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#') || /^\[[^\]]+\]$/.test(line)) continue;
    const separator = line.indexOf('=');
    if (separator < 1) throw new Error(`Invalid INI setting on line ${index + 1}. Expected KEY=VALUE.`);
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw new Error(`Invalid INI key "${key}" on line ${index + 1}.`);
    let quote = '';
    for (let position = 0; position < value.length; position += 1) {
      const character = value[position];
      if ((character === '"' || character === "'") && (!quote || quote === character)) quote = quote ? '' : character;
      if (character === ';' && !quote && (position === 0 || /\s/.test(value[position - 1]))) {
        value = value.slice(0, position).trimEnd();
        break;
      }
    }
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/^<[^>]+>$/.test(value)) value = '';
    values[key] = value;
  }
  return values;
}

export function loadPersonalConfig({ cwd = process.cwd(), env = process.env } = {}) {
  const iniFilename = path.join(cwd, 'config.ini');
  const legacyFilename = path.join(cwd, '.env');
  const filename = fs.existsSync(iniFilename) ? iniFilename : (fs.existsSync(legacyFilename) ? legacyFilename : '');
  const fileValues = filename ? parseIni(fs.readFileSync(filename, 'utf8')) : {};
  return { ...fileValues, ...env };
}



