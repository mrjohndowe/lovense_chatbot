import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './config.js';
import { commandHelp, parseCommand } from './commands.js';
import { LovenseClient } from './lovense.js';

const config = loadConfig();
const client = new LovenseClient(config);
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const buckets = new Map();

function json(response, status, data) {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  response.end(JSON.stringify(data));
}

function authorized(request) {
  if (!config.accessToken) return true;
  return request.headers.authorization === `Bearer ${config.accessToken}`;
}

function rateLimited(request) {
  const key = request.socket.remoteAddress || 'local';
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter(time => now - time < 10_000);
  recent.push(now);
  buckets.set(key, recent);
  return recent.length > 12;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 16_384) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

async function api(request, response, pathname) {
  if (!authorized(request)) return json(response, 401, { error: 'Access token is missing or incorrect.' });
  if (rateLimited(request)) return json(response, 429, { error: 'Too many commands. Wait a few seconds.' });

  if (request.method === 'GET' && pathname === '/api/status') {
    return json(response, 200, { ...client.publicStatus(), maxCommandSeconds: config.maxCommandSeconds, authRequired: Boolean(config.accessToken) });
  }
  if (request.method === 'POST' && pathname === '/api/message') {
    try {
      const body = await readJson(request);
      const parsed = parseCommand(body.message, config.maxCommandSeconds);
      if (parsed.type === 'chat') return json(response, 200, { reply: parsed.reply });
      if (parsed.type === 'help') return json(response, 200, { reply: commandHelp(config.maxCommandSeconds) });
      if (parsed.type === 'status') return json(response, 200, { reply: `Mode: ${config.mode}. ${client.lastCommand ? `Last command: ${client.lastCommand.command} at ${client.lastCommand.at}.` : 'No commands sent yet.'}` });
      const result = await client.send(parsed.payload);
      return json(response, 200, { reply: `${parsed.summary}${result.simulated ? ' (Mock mode: no device was activated.)' : ''}`, result });
    } catch (error) {
      return json(response, 400, { error: error.message });
    }
  }
  return json(response, 404, { error: 'Not found.' });
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
  return staticFile(response, url.pathname);
});

server.listen(config.port, '127.0.0.1', () => {
  console.log(`Lovense Chatbot running at http://127.0.0.1:${config.port} (${config.mode} mode)`);
});
