import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constantTimeEqual } from './policy.js';
import { loadRemoteConfig } from './remote-config.js';
import { RemoteChatBridge, fingerprint } from './remote-chat.js';
import { createReplyDeduper, generateReply } from './replies.js';
import { chooseRandomToyControl, randomDelayMs } from './toy-random.js';

const config = loadRemoteConfig();
const bridge = new RemoteChatBridge({ debugUrl: config.debugUrl, targetUrlIncludes: '/index.html' });
const toyBridge = new RemoteChatBridge({ debugUrl: config.debugUrl, targetUrlIncludes: '/window.html' });
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const seen = new Set();
const dedupeReply = createReplyDeduper();
const conversationMemories = new Map();
const reviews = [];
let watching = false;
let scanning = false;
let timer = null;
let activeConversation = '';
let lastScanAt = null;
let lastError = '';
let nextReviewId = 1;
let autoSend = config.autoSend;
let toyControlEnabled = false;
let selectedToyId = '';
let randomToyEnabled = false;
let randomToyTimer = null;
let nextRandomToyChangeAt = null;
let lastRandomControl = null;
const autoTimers = new Map();

function json(response, status, data) {
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'"
  });
  response.end(JSON.stringify(data));
}

function authorized(request) {
  if (!config.accessToken) return true;
  return constantTimeEqual(request.headers.authorization, `Bearer ${config.accessToken}`);
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  return !origin || origin === `http://127.0.0.1:${config.port}` || origin === `http://localhost:${config.port}`;
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 65_536) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw new Error('Request body must be valid JSON.'); }
}

function publicState() {
  return {
    watching,
    connected: Boolean(activeConversation && !lastError),
    activeConversation,
    lastScanAt,
    lastError,
    pollMs: config.pollMs,
    replyProvider: config.replyProvider,
    replyModel: config.replyModel,
    reviewMode: !autoSend,
    autoSend,
    autoSendMinDelayMs: config.autoSendMinDelayMs,
    autoSendMaxDelayMs: config.autoSendMaxDelayMs,
    autoSendTypingMsPerChar: config.autoSendTypingMsPerChar,
    toyControlEnabled,
    reviews: reviews.map(item => ({ ...item }))
  };
}

function publicToy(toy) {
  return {
    available: true,
    enabled: toyControlEnabled,
    randomEnabled: randomToyEnabled,
    nextRandomChangeAt: nextRandomToyChangeAt,
    randomLimits: { minLevel: config.toyRandomMinLevel, maxLevel: config.toyRandomMaxLevel, minIntervalMs: config.toyRandomMinIntervalMs, maxIntervalMs: config.toyRandomMaxIntervalMs },
    name: toy.name,
    deviceType: toy.deviceType,
    battery: Number.isFinite(toy.battery) ? toy.battery : null,
    functions: toy.functions.map(control => ({ ...control }))
  };
}

function clearRandomToyTimer() {
  if (randomToyTimer) clearTimeout(randomToyTimer);
  randomToyTimer = null;
  nextRandomToyChangeAt = null;
}

async function stopRandomToy({ stopToy = true } = {}) {
  randomToyEnabled = false;
  clearRandomToyTimer();
  lastRandomControl = null;
  if (stopToy && selectedToyId) {
    try { await toyBridge.stopToy(selectedToyId); } catch {}
  }
}

function scheduleRandomToyChange() {
  if (!randomToyEnabled || !toyControlEnabled || !selectedToyId) return;
  const delay = randomDelayMs(config);
  nextRandomToyChangeAt = new Date(Date.now() + delay).toISOString();
  randomToyTimer = setTimeout(async () => {
    randomToyTimer = null;
    nextRandomToyChangeAt = null;
    try {
      const toy = await toyBridge.toySnapshot();
      if (!randomToyEnabled || !toyControlEnabled || toy.id !== selectedToyId) {
        await stopRandomToy();
        return;
      }
      const selection = chooseRandomToyControl(toy, config, lastRandomControl);
      await toyBridge.setToyControl(selectedToyId, selection.functionIndex, selection.value);
      lastRandomControl = selection;
      scheduleRandomToyChange();
    } catch (error) {
      lastError = `Random chat-partner toy control stopped: ${error.message}`;
      await stopRandomToy();
    }
  }, delay);
  randomToyTimer.unref();
}
async function toyState() {
  try {
    const toy = await toyBridge.toySnapshot();
    if (selectedToyId && selectedToyId !== toy.id) {
      await stopRandomToy();
      toyControlEnabled = false;
      selectedToyId = '';
    }
    return publicToy(toy);
  } catch (error) {
    await stopRandomToy();
    toyControlEnabled = false;
    selectedToyId = '';
    return { available: false, enabled: false, randomEnabled: false, error: error.message, functions: [] };
  }
}
function humanDelayMs(reply, random = Math.random) {
  const reactionRange = config.autoSendMaxDelayMs - config.autoSendMinDelayMs;
  return config.autoSendMinDelayMs + Math.floor(random() * (reactionRange + 1));
}
function clearAutoTimer(id) {
  const timeout = autoTimers.get(id);
  if (timeout) clearTimeout(timeout);
  autoTimers.delete(id);
  const item = reviews.find(review => review.id === String(id));
  if (item) item.scheduledFor = null;
}

function scheduleAuto(item) {
  if (!autoSend || item.status !== 'waiting' || autoTimers.has(item.id)) return;
  const delayMs = humanDelayMs(item.reply);
  item.scheduledFor = new Date(Date.now() + delayMs).toISOString();
  const timeout = setTimeout(async () => {
    autoTimers.delete(item.id);
    item.scheduledFor = null;
    if (!autoSend || !watching || item.status !== 'waiting') return;
    try {
      await bridge.typeAndSend(
        item.reply,
        item.conversation,
        config.autoSendTypingMsPerChar,
        () => autoSend && watching && item.status === 'waiting'
      );
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
    } catch (error) {
      item.status = 'error';
      item.error = error.message;
      lastError = `Automatic reply was not sent: ${error.message}`;
    }
  }, delayMs);
  timeout.unref();
  autoTimers.set(item.id, timeout);
}
function seedConversationMemory(conversation, messages) {
  const history = messages
    .filter(item => item.type === 'text' && item.text && (item.direction === 'incoming' || item.direction === 'outgoing'))
    .map(item => ({ role: item.direction === 'incoming' ? 'user' : 'assistant', content: item.text }))
    .slice(-config.conversationMemoryMessages);
  conversationMemories.set(conversation, history);
}

function rememberConversationTurn(conversation, role, content) {
  const history = conversationMemories.get(conversation) || [];
  history.push({ role, content: String(content || '').trim() });
  if (history.length > config.conversationMemoryMessages) history.splice(0, history.length - config.conversationMemoryMessages);
  conversationMemories.set(conversation, history);
}
async function scan({ baseline = false } = {}) {
  if (scanning) return;
  scanning = true;
  try {
    const snapshot = await bridge.snapshot();
    const conversationChanged = snapshot.conversation !== activeConversation;
    activeConversation = snapshot.conversation;
    const incoming = snapshot.messages.filter(item => item.direction === 'incoming' && item.type === 'text' && item.text);
    const keyed = incoming.map(item => ({ ...item, key: fingerprint(snapshot.conversation, `${item.index}\0${item.text}`) }));

    if (baseline || conversationChanged) {
      seedConversationMemory(snapshot.conversation, snapshot.messages);
      for (const item of keyed) seen.add(item.key);
    } else {
      const fresh = keyed.filter(item => !seen.has(item.key));
      for (const item of fresh) seen.add(item.key);
      if (fresh.length) {
        const combinedMessage = fresh.map(item => item.text).join('\n');
        const history = conversationMemories.get(snapshot.conversation) || [];
        const generatedReply = await generateReply(config, combinedMessage, globalThis.fetch, { history });
        const reply = dedupeReply(snapshot.conversation, generatedReply);
        rememberConversationTurn(snapshot.conversation, 'user', combinedMessage);
        rememberConversationTurn(snapshot.conversation, 'assistant', reply);
        const review = {
          id: String(nextReviewId++),
          conversation: snapshot.conversation,
          message: combinedMessage,
          reply,
          status: 'waiting',
          createdAt: new Date().toISOString()
        };
        reviews.push(review);
        scheduleAuto(review);
        while (reviews.length > 20) reviews.shift();
      }
    }
    lastScanAt = new Date().toISOString();
    lastError = '';
  } catch (error) {
    activeConversation = '';
    lastError = error.message;
  } finally {
    scanning = false;
  }
}

async function startWatching() {
  if (watching) return;
  watching = true;
  await scan({ baseline: true });
  timer = setInterval(scan, config.pollMs);
  timer.unref();
}

function stopWatching() {
  watching = false;
  if (timer) clearInterval(timer);
  timer = null;
}

async function api(request, response, pathname) {
  if (!authorized(request)) return json(response, 401, { error: 'Access token required.' });
  if (request.method !== 'GET' && !sameOrigin(request)) return json(response, 403, { error: 'Request origin was rejected.' });
  try {
    if (request.method === 'GET' && pathname === '/api/status') return json(response, 200, publicState());
    if (request.method === 'GET' && pathname === '/api/toys') return json(response, 200, await toyState());
    if (request.method === 'POST' && pathname === '/api/toys/enable') {
      const body = await readJson(request);
      if (body.enabled === true) {
        const toy = await toyBridge.toySnapshot();
        selectedToyId = toy.id;
        toyControlEnabled = true;
        return json(response, 200, publicToy(toy));
      }
      await stopRandomToy();
      toyControlEnabled = false;
      selectedToyId = '';
      return json(response, 200, await toyState());
    }
    if (request.method === 'POST' && pathname === '/api/toys/control') {
      if (!toyControlEnabled || !selectedToyId) throw new Error('Enable toy controls before changing a slider.');
      if (randomToyEnabled) throw new Error('Stop Random mode before moving a slider manually.');
      const body = await readJson(request);
      const functionIndex = Number(body.functionIndex);
      const value = Number(body.value);
      if (!Number.isInteger(functionIndex) || !Number.isFinite(value)) throw new Error('A valid toy function and value are required.');
      await toyBridge.setToyControl(selectedToyId, functionIndex, value);
      return json(response, 200, publicToy(await toyBridge.toySnapshot()));
    }
    if (request.method === 'POST' && pathname === '/api/toys/random') {
      const body = await readJson(request);
      if (body.enabled === true) {
        if (!toyControlEnabled || !selectedToyId) throw new Error('Enable chat-partner toy controls before starting Random mode.');
        const toy = await toyBridge.toySnapshot();
        if (toy.id !== selectedToyId) throw new Error('The accepted Live Control session changed. Enable controls again.');
        randomToyEnabled = true;
        clearRandomToyTimer();
        lastRandomControl = null;
        scheduleRandomToyChange();
        return json(response, 200, publicToy(toy));
      }
      await stopRandomToy();
      return json(response, 200, await toyState());
    }
    if (request.method === 'POST' && pathname === '/api/toys/stop') {
      const toy = await toyBridge.toySnapshot();
      await stopRandomToy({ stopToy: false });
      await toyBridge.stopToy(toy.id);
      return json(response, 200, publicToy(await toyBridge.toySnapshot()));
    }
    if (request.method === 'POST' && pathname === '/api/auto-send') {
      const body = await readJson(request);
      autoSend = body.enabled === true;
      if (!autoSend) {
        for (const timeout of autoTimers.values()) clearTimeout(timeout);
        autoTimers.clear();
        for (const item of reviews) item.scheduledFor = null;
      }
      return json(response, 200, publicState());
    }
    if (request.method === 'POST' && pathname === '/api/monitor/start') {
      await startWatching();
      return json(response, 200, publicState());
    }
    if (request.method === 'POST' && pathname === '/api/monitor/stop') {
      stopWatching();
      return json(response, 200, publicState());
    }
    if (request.method === 'POST' && pathname === '/api/review/draft') {
      const body = await readJson(request);
      const item = reviews.find(review => review.id === String(body.id));
      if (!item) return json(response, 404, { error: 'Review item was not found.' });
      item.reply = String(body.reply || '').trim().slice(0, config.maxReplyChars);
      clearAutoTimer(item.id);
      await bridge.fillDraft(item.reply, item.conversation);
      item.status = 'drafted';
      return json(response, 200, { item });
    }
    if (request.method === 'POST' && pathname === '/api/review/send') {
      const body = await readJson(request);
      const item = reviews.find(review => review.id === String(body.id));
      if (!item) return json(response, 404, { error: 'Review item was not found.' });
      item.reply = String(body.reply || '').trim().slice(0, config.maxReplyChars);
      clearAutoTimer(item.id);
      await bridge.typeAndSend(
        item.reply,
        item.conversation,
        config.autoSendTypingMsPerChar,
        () => true
      );
      item.status = 'sent';
      item.sentAt = new Date().toISOString();
      return json(response, 200, { item });
    }
    if (request.method === 'POST' && pathname === '/api/review/dismiss') {
      const body = await readJson(request);
      const item = reviews.find(review => review.id === String(body.id));
      if (!item) return json(response, 404, { error: 'Review item was not found.' });
      clearAutoTimer(item.id);
      item.status = 'dismissed';
      return json(response, 200, { item });
    }
    return json(response, 404, { error: 'Not found.' });
  } catch (error) {
    return json(response, 400, { error: error.message });
  }
}

async function staticFile(response, pathname) {
  const requested = pathname === '/' ? 'remote.html' : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(publicDir, safePath);
  if (!filePath.startsWith(publicDir)) return json(response, 404, { error: 'Not found.' });
  const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
  try {
    const content = await readFile(filePath);
    response.writeHead(200, {
      'content-type': types[extname(filePath)] || 'application/octet-stream',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; frame-ancestors 'none'"
    });
    response.end(content);
  } catch { json(response, 404, { error: 'Not found.' }); }
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  if (url.pathname.startsWith('/api/')) return api(request, response, url.pathname);
  return staticFile(response, url.pathname);
});

server.listen(config.port, '127.0.0.1', async () => {
  console.log(`Lovense Remote Reply Assistant running at http://127.0.0.1:${config.port} (review mode)`);
  if (config.monitorEnabled) await startWatching();
});

process.on('SIGINT', () => {
  stopWatching();
  server.close(() => process.exit(0));
});







