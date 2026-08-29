import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const VERSION = 'v1';

export function createEncryptionKey() {
  return randomBytes(32).toString('base64url');
}

function keyBytes(key) {
  const bytes = Buffer.from(String(key || ''), 'base64url');
  if (bytes.length !== 32) throw new Error('The saved Lovense encryption key is invalid. Re-enter the password in Settings to create a new one.');
  return bytes;
}

export function encryptSecret(secret, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
  const encrypted = Buffer.concat([cipher.update(String(secret), 'utf8'), cipher.final()]);
  return [VERSION, iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

export function decryptSecret(payload, key) {
  const [version, iv, tag, encrypted, extra] = String(payload || '').split('.');
  if (version !== VERSION || !iv || !tag || !encrypted || extra) throw new Error('The saved Lovense password is invalid. Re-enter it in Settings.');
  try {
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(iv, 'base64url'));
    decipher.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('The saved Lovense password could not be decrypted. Re-enter it in Settings.');
  }
}
