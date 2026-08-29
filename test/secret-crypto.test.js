import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncryptionKey, decryptSecret, encryptSecret } from '../src/secret-crypto.js';

test('encrypts and decrypts a secret with a generated AES-256 key', () => {
  const key = createEncryptionKey();
  const encrypted = encryptSecret('password with spaces', key);
  assert.match(encrypted, /^v1\./);
  assert.doesNotMatch(encrypted, /password with spaces/);
  assert.equal(decryptSecret(encrypted, key), 'password with spaces');
});
