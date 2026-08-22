import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { commandHelp, parseCommand } from './commands.js';
import { LovenseClient } from './lovense.js';
import { AccessPolicy, constantTimeEqual } from './policy.js';
import { PairingService } from './pairing.js';
import { chaturbateMessage, discordMessage, parseTipRules, twitchMessage, verifyDiscord, verifyTwitch } from './integrations.js';

const config = loadConfig();
const client = new LovenseClient(config);
const policy = new AccessPolicy(config);
const pairing = new PairingService(config);
const tipRules = parseTipRules(config.chaturbateTipRules, config.maxCommandSeconds);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const buckets = new Map();

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  response.end(JSON.stringify(data));
}

function authorized(request) {
  if (!config.accessToken) return true;
  return constantTimeEqual(request.headers.authorization, `Bearer ${config.accessToken}`);
}

function rateLimited(request) {
  const key = request.socket.remoteAddress || 'local';
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter(time => now - time < 10_000);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > 20;
}

async function readRaw(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseJson(raw) {
  try { return JSON.parse(raw.toString('utf8')); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

async function runCommand(platform, userId, message, requireConsent = true) {
  const parsed = parseCommand(message, config.maxCommandSeconds);
  if (parsed.type === 'chat') return parsed.reply;
  if (parsed.type === 'help') return commandHelp(config.maxCommandSeconds);
  if (parsed.type === 'status') return `Mode: ${config.mode}. ${client.lastCommand ? `Last command: ${client.lastCommand.command} at ${client.lastCommand.at}.` : 'No commands sent yet.'}`;
  if (requireConsent) policy.authorize(platform, userId);
  try {
    const result = await client.send(parsed.payload);
    policy.record({ platform, userId, action: parsed.payload.action || parsed.payload.name, outcome: result.simulated ? 'simulated' : 'sent' });
    return `${parsed.summary}${result.simulated ? ' (Mock mode: no device was activated.)' : ''}`;
  } catch (error) {
    policy.record({ platform, userId, action: parsed.payload.action || parsed.payload.name, outcome: 'error' });
    throw error;
  }
}

function platformStatus() {
  return {
    web: { enabled: config.webEnabled, configured: true },
    pairing: { enabled: config.pairingEnabled, configured: Boolean(config.developerToken && config.pairingUserToken), ...pairing.publicStatus() },
    discord: { enabled: config.discordEnabled, configured: Boolean(config.discordPublicKey) },
    twitch: { enabled: config.twitchEnabled, configured: Boolean(config.twitchSecret) },
    chaturbate: { enabled: config.chaturbateEnabled, configured: Boolean(config.chaturbateSecret), relayRequired: true }
  };
}

async function api(request, response, pathname) {
  if (!authorized(request)) return json(response, 401, { error: 'Access token is missing or incorrect.' });
  if (rateLimited(request)) return json(response, 429, { error: 'Too many requests. Wait a few seconds.' });
  if (request.method === 'GET' && pathname === '/api/status') {
    return json(response, 200, { ...client.publicStatus(), pairing: pairing.publicStatus(), platforms: platformStatus(), consents: policy.consentStatus(), maxCommandSeconds: config.maxCommandSeconds, authRequired: Boolean(config.accessToken) });
  }
  if (request.method === 'GET' && pathname === '/api/audit') return json(response, 200, { events: policy.publicAudit() });
  if (request.method === 'POST' && pathname === '/api/pairing/qr') {
    try { return json(response, 200, await pairing.createQr()); }
    catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && pathname === '/api/consent') {
    try {
      const body = parseJson(await readRaw(request));
      if (!['discord', 'twitch', 'chaturbate'].includes(body.platform)) throw new Error('Invalid platform.');
      policy.setConsent(body.platform, String(body.userId || ''), Boolean(body.enabled));
      return json(response, 200, { ok: true, consents: policy.consentStatus() });
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  if (request.method === 'POST' && pathname === '/api/message') {
    if (!config.webEnabled) return json(response, 403, { error: 'Web chat is disabled.' });
    try {
      const body = parseJson(await readRaw(request));
      return json(response, 200, { reply: await runCommand('web', 'owner', body.message, false) });
    } catch (error) { return json(response, 400, { error: error.message }); }
  }
  return json(response, 404, { error: 'Not found.' });
}

async function webhooks(request, response, pathname) {
  if (request.method !== 'POST') return json(response, 405, { error: 'Method not allowed.' });
  if (rateLimited(request)) return json(response, 429, { error: 'Too many requests.' });
  let raw;
  try { raw = await readRaw(request); }
  catch (error) { return json(response, 413, { error: error.message }); }

  try {
    if (pathname === '/webhooks/lovense') {
      const status = pairing.acceptCallback(parseJson(raw));
      if (config.mode === 'lan') client.config.lanUrl = pairing.connection.lanUrl;
      policy.record({ platform: 'lovense', userId: config.pairingUserId, action: 'paired', outcome: 'ok' });
      return json(response, 200, status);
    }
    if (pathname === '/webhooks/discord') {
      if (!config.discordEnabled) return json(response, 404, { error: 'Discord is disabled.' });
      if (!verifyDiscord(request.headers, raw, config.discordPublicKey)) return json(response, 401, { error: 'Invalid Discord signature.' });
      const body = parseJson(raw);
      if (policy.seen(`discord:${body.id}`)) return json(response, 409, { error: 'Duplicate event.' });
      const event = discordMessage(body);
      if (event.ping) return json(response, 200, { type: 1 });
      if (event.consent !== undefined) {
        policy.setConsent('discord', event.userId, event.consent);
        return json(response, 200, { type: 4, data: { content: `Consent ${event.consent ? 'enabled' : 'revoked'}.`, flags: 64 } });
      }
      const reply = await runCommand('discord', event.userId, event.message);
      return json(response, 200, { type: 4, data: { content: reply, flags: 64 } });
    }
    if (pathname === '/webhooks/twitch') {
      if (!config.twitchEnabled) return json(response, 404, { error: 'Twitch is disabled.' });
      if (!verifyTwitch(request.headers, raw, config.twitchSecret)) return json(response, 401, { error: 'Invalid Twitch signature.' });
      const eventId = request.headers['twitch-eventsub-message-id'];
      if (policy.seen(`twitch:${eventId}`)) return json(response, 204, {});
      const body = parseJson(raw);
      if (request.headers['twitch-eventsub-message-type'] === 'webhook_callback_verification') {
        response.writeHead(200, { 'content-type': 'text/plain' });
        return response.end(body.challenge);
      }
      const event = twitchMessage(body);
      if (!event) return json(response, 204, {});
      if (/^!consent\s+(on|off)$/i.test(event.message)) {
        policy.setConsent('twitch', event.userId, /on$/i.test(event.message));
        return json(response, 200, { accepted: true });
      }
      if (event.message.startsWith('/')) await runCommand('twitch', event.userId, event.message);
      return json(response, 200, { accepted: true });
    }
    if (pathname === '/webhooks/chaturbate') {
      if (!config.chaturbateEnabled) return json(response, 404, { error: 'Chaturbate is disabled.' });
      if (!constantTimeEqual(request.headers.authorization, `Bearer ${config.chaturbateSecret}`)) return json(response, 401, { error: 'Invalid relay secret.' });
      const body = parseJson(raw);
      if (policy.seen(`chaturbate:${body.eventId}`)) return json(response, 409, { error: 'Duplicate event.' });
      const event = chaturbateMessage(body, tipRules);
      if (!event) return json(response, 202, { accepted: true, triggered: false });
      if (/^\/consent\s+(on|off)$/i.test(event.message)) {
        policy.setConsent('chaturbate', event.userId, /on$/i.test(event.message));
        return json(response, 200, { accepted: true, consent: policy.hasConsent('chaturbate', event.userId) });
      }
      const reply = await runCommand('chaturbate', event.userId, event.message);
      return json(response, 200, { accepted: true, triggered: true, reply });
    }
    return json(response, 404, { error: 'Not found.' });
  } catch (error) {
    return json(response, 400, { error: error.message });
  }
}

async function staticFile(response, pathname) {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return json(response, 404, { error: 'Not found.' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  try {
    const content = await readFile(filePath);
    response.writeHead(200, { 'content-type': types[extname(filePath)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    response.end(content);
  } catch { json(response, 404, { error: 'Not found.' }); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return api(request, response, url.pathname);
  if (url.pathname.startsWith('/webhooks/')) return webhooks(request, response, url.pathname);
  return staticFile(response, url.pathname);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Lovense Chatbot running at http://127.0.0.1:${config.port} (${config.mode} mode)`);
});
