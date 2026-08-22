const QR_URL = 'https://api.lovense-api.com/api/lan/getQrCode';

export class PairingService {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.connection = null;
  }

  async createQr() {
    if (!this.config.pairingEnabled) throw new Error('Lovense QR pairing is disabled.');
    const response = await this.fetch(QR_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: this.config.developerToken, uid: this.config.pairingUserId, uname: this.config.pairingUserName, utoken: this.config.pairingUserToken, v: 2 }),
      signal: AbortSignal.timeout(10_000)
    });
    const result = await response.json();
    if (!response.ok || !result.data?.qr) throw new Error(result.message || 'Lovense did not return a QR code.');
    return { qr: result.data.qr, code: result.data.code || null, expiresInHours: 4 };
  }

  acceptCallback(body) {
    if (!this.config.pairingEnabled) throw new Error('Lovense QR pairing is disabled.');
    if (!body || body.uid !== this.config.pairingUserId || body.utoken !== this.config.pairingUserToken) throw new Error('Pairing callback identity did not match.');
    if (!body.domain || !body.httpsPort || typeof body.toys !== 'object') throw new Error('Pairing callback is missing connection details.');
    this.connection = {
      lanUrl: `https://${body.domain}:${body.httpsPort}`,
      toys: Object.values(body.toys).map(toy => ({ id: toy.id, name: toy.name, nickName: toy.nickName || '', connected: Number(toy.status) === 1 })),
      pairedAt: new Date().toISOString()
    };
    return this.publicStatus();
  }

  publicStatus() {
    return this.connection ? { paired: true, pairedAt: this.connection.pairedAt, toys: this.connection.toys } : { paired: false, toys: [] };
  }
}
