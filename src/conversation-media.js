import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const MIME_TYPES = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/gif', 'gif'],
  ['image/webp', 'webp'],
  ['image/avif', 'avif']
]);

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseImageDataUrl(value, maxBytes) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=_-]+)$/i.exec(String(value || ''));
  const mime = String(match?.[1] || '').toLowerCase();
  if (!match || !MIME_TYPES.has(mime)) throw new Error('Lovense returned an unsupported image format.');
  const data = Buffer.from(match[2].replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  if (!data.length || data.length > maxBytes) throw new Error(`Lovense image must be no larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  return { mime, data, extension: MIME_TYPES.get(mime) };
}

function recordFrom(value) {
  if (!value || typeof value !== 'object') return null;
  const id = String(value.id || '');
  const fileName = String(value.fileName || '');
  const mime = String(value.mime || '').toLowerCase();
  if (!/^[a-f0-9]{64}$/i.test(id) || !/^[a-f0-9]{64}\.(jpg|png|gif|webp|avif)$/i.test(fileName) || !MIME_TYPES.has(mime)) return null;
  return {
    id,
    conversation: cleanText(value.conversation) || 'Unknown conversation',
    direction: value.direction === 'outgoing' ? 'outgoing' : 'incoming',
    messageIndex: Number.isInteger(value.messageIndex) ? value.messageIndex : -1,
    capturedAt: new Date(value.capturedAt || 0).toISOString(),
    mime,
    fileName
  };
}

export class ConversationMediaStore {
  constructor({ directory, maxBytes = 8 * 1024 * 1024 } = {}) {
    if (!directory) throw new Error('A private conversation-media directory is required.');
    this.directory = directory;
    this.maxBytes = maxBytes;
    this.indexPath = path.join(directory, 'index.json');
  }

  async #records() {
    if (!existsSync(this.indexPath)) return [];
    try {
      const parsed = JSON.parse(await readFile(this.indexPath, 'utf8'));
      return Array.isArray(parsed.records) ? parsed.records.map(recordFrom).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  async #writeRecords(records) {
    await mkdir(this.directory, { recursive: true });
    const temporary = `${this.indexPath}.next`;
    await writeFile(temporary, JSON.stringify({ records }, null, 2), 'utf8');
    await rename(temporary, this.indexPath);
  }

  async save({ conversation, messageKey, direction, messageIndex, dataUrl, capturedAt = new Date().toISOString() } = {}) {
    const media = parseImageDataUrl(dataUrl, this.maxBytes);
    const normalizedConversation = cleanText(conversation) || 'Unknown conversation';
    const id = createHash('sha256').update(`${normalizedConversation}\0${String(messageKey || '')}`).digest('hex');
    const records = await this.#records();
    const existing = records.find(record => record.id === id);
    if (existing) return existing;

    const fileHash = createHash('sha256').update(media.data).digest('hex');
    const fileName = `${fileHash}.${media.extension}`;
    await mkdir(this.directory, { recursive: true });
    const filePath = path.join(this.directory, fileName);
    if (!existsSync(filePath)) await writeFile(filePath, media.data, { flag: 'wx' }).catch(error => {
      if (error.code !== 'EEXIST') throw error;
    });
    const record = {
      id,
      conversation: normalizedConversation,
      direction: direction === 'outgoing' ? 'outgoing' : 'incoming',
      messageIndex: Number.isInteger(messageIndex) ? messageIndex : -1,
      capturedAt: new Date(capturedAt).toISOString(),
      mime: media.mime,
      fileName
    };
    records.push(record);
    await this.#writeRecords(records);
    return record;
  }

  async list() {
    const records = await this.#records();
    return records
      .sort((left, right) => String(right.capturedAt).localeCompare(String(left.capturedAt)))
      .map(({ fileName, ...record }) => record);
  }

  async read(id) {
    const record = (await this.#records()).find(item => item.id === String(id || ''));
    if (!record) throw new Error('Saved image was not found.');
    const filePath = path.join(this.directory, record.fileName);
    if (!filePath.startsWith(`${this.directory}${path.sep}`) || !existsSync(filePath)) throw new Error('Saved image file is unavailable.');
    return { ...record, data: await readFile(filePath) };
  }
}
