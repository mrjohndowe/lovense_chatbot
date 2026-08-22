import { timingSafeEqual } from 'node:crypto';

function list(value) {
  return String(value || '').split(',').map(item => item.trim().toLowerCase()).filter(Boolean);
}

export function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left || ''));
  const b = Buffer.from(String(right || ''));
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AccessPolicy {
  constructor(config) {
    this.config = config;
    this.consents = new Map();
    this.audit = [];
    this.events = new Map();
  }

  isAllowed(platform, userId) {
    const allowed = list(this.config[`${platform}AllowedUsers`]);
    return allowed.length > 0 && allowed.includes(String(userId || '').toLowerCase());
  }

  hasConsent(platform, userId) {
    return this.consents.get(`${platform}:${String(userId || '').toLowerCase()}`) === true;
  }

  setConsent(platform, userId, enabled) {
    if (!this.isAllowed(platform, userId)) throw new Error('This account is not on the platform allowlist.');
    this.consents.set(`${platform}:${String(userId).toLowerCase()}`, Boolean(enabled));
    this.record({ platform, userId, action: enabled ? 'consent-granted' : 'consent-revoked', outcome: 'ok' });
  }

  authorize(platform, userId) {
    if (!this.isAllowed(platform, userId)) throw new Error('This account is not on the platform allowlist.');
    if (!this.hasConsent(platform, userId)) throw new Error('Consent is not active. Use the consent command first.');
  }

  seen(eventId) {
    const now = Date.now();
    const ttl = this.config.dedupeMinutes * 60_000;
    for (const [id, time] of this.events) if (now - time > ttl) this.events.delete(id);
    if (!eventId || this.events.has(eventId)) return true;
    this.events.set(eventId, now);
    return false;
  }

  record(entry) {
    this.audit.unshift({ at: new Date().toISOString(), ...entry });
    this.audit.length = Math.min(this.audit.length, this.config.auditLimit);
  }

  publicAudit() {
    return this.audit.map(({ at, platform, userId, action, outcome }) => ({ at, platform, userId, action, outcome }));
  }

  consentStatus() {
    return [...this.consents].map(([key, enabled]) => {
      const separator = key.indexOf(':');
      return { platform: key.slice(0, separator), userId: key.slice(separator + 1), enabled };
    });
  }
}
