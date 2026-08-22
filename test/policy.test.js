import test from 'node:test';
import assert from 'node:assert/strict';
import { AccessPolicy } from '../src/policy.js';

function policy() {
  return new AccessPolicy({ discordAllowedUsers: '123,456', twitchAllowedUsers: '', chaturbateAllowedUsers: '', dedupeMinutes: 10, auditLimit: 20 });
}

test('requires both allowlisting and explicit consent', () => {
  const access = policy();
  assert.throws(() => access.authorize('discord', '123'), /Consent/);
  access.setConsent('discord', '123', true);
  assert.doesNotThrow(() => access.authorize('discord', '123'));
  access.setConsent('discord', '123', false);
  assert.throws(() => access.authorize('discord', '123'), /Consent/);
});

test('rejects consent for unknown users', () => {
  assert.throws(() => policy().setConsent('discord', '999', true), /allowlist/);
});

test('deduplicates platform events', () => {
  const access = policy();
  assert.equal(access.seen('discord:event-1'), false);
  assert.equal(access.seen('discord:event-1'), true);
});
