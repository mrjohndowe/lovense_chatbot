const SERVER_URL = 'https://api.lovense-api.com/api/lan/v2/command';

export class LovenseClient {
  constructor(config, fetchImpl = globalThis.fetch) {
    this.config = config;
    this.fetch = fetchImpl;
    this.lastCommand = null;
  }

  publicStatus() {
    return {
      mode: this.config.mode,
      configured: this.config.mode === 'mock' || this.config.mode === 'server' || Boolean(this.config.lanUrl),
      toyTargeted: Boolean(this.config.toyId),
      lastCommand: this.lastCommand
    };
  }

  async send(payload) {
    const body = { ...payload };
    if (this.config.toyId) body.toy = this.config.toyId;

    if (this.config.mode === 'mock') {
      this.lastCommand = { at: new Date().toISOString(), command: body.command, result: 'simulated' };
      return { code: 200, type: 'mock', simulated: true };
    }

    let url;
    const headers = { 'content-type': 'application/json' };
    if (this.config.mode === 'server') {
      url = SERVER_URL;
      body.token = this.config.developerToken;
      body.uid = this.config.userId;
    } else {
      url = `${this.config.lanUrl}/command`;
      headers['X-platform'] = this.config.platformName;
    }

    const response = await this.fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    const result = await response.json().catch(() => ({ code: response.status, type: 'invalid-response' }));
    if (!response.ok || (result.code && result.code !== 200)) {
      throw new Error(`Lovense rejected the command (code ${result.code || response.status}).`);
    }
    this.lastCommand = { at: new Date().toISOString(), command: body.command, result: 'sent' };
    return result;
  }
}
