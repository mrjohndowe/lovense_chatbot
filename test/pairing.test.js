import test from 'node:test';
import assert from 'node:assert/strict';
import { PairingService } from '../src/pairing.js';

const config = { pairingEnabled: true, developerToken: 'developer', pairingUserId: 'owner', pairingUserName: 'Owner', pairingUserToken: 'private-user-token' };

test('creates a QR request without returning credentials', async () => {
  let sent;
  const service = new PairingService(config, async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, json: async () => ({ data: { qr: 'https://example.test/qr.png', code: '123456' } }) };
  });
  const result = await service.createQr();
  assert.equal(sent.utoken, 'private-user-token');
  assert.equal(result.qr, 'https://example.test/qr.png');
  assert.equal(JSON.stringify(result).includes('private-user-token'), false);
});

test('validates callback identity and exposes sanitized toy status', () => {
  const service = new PairingService(config);
  assert.throws(() => service.acceptCallback({ uid: 'wrong' }), /identity/);
  const status = service.acceptCallback({ uid: 'owner', utoken: 'private-user-token', domain: 'local.lovense.club', httpsPort: '30010', toys: { abc: { id: 'abc', name: 'Domi', status: 1 } } });
  assert.equal(status.paired, true);
  assert.equal(status.toys[0].connected, true);
  assert.equal(JSON.stringify(status).includes('private-user-token'), false);
});
