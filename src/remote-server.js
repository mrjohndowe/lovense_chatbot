import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { constantTimeEqual } from './policy.js';
import { loadRemoteConfig } from './remote-config.js';
import { loadPersonalConfig } from './ini-config.js';
import { RemoteChatBridge, fingerprint } from './remote-chat.js';
import { createFollowUpTracker } from './follow-up.js';
import { createReplyDeduper, generateReply } from './replies.js';
import { unrepliedIncomingText } from './reply-catchup.js';
import { chooseRandomToyControl, randomDelayMs } from './toy-random.js';
import { readDashboardSettings, saveDashboardSettings } from './config-editor.js';
import { decryptSecret } from './secret-crypto.js';
import { ensureLovenseRemote } from './remote-launcher.js';
import { createMonitorRetry } from './monitor-retry.js';

const config = loadRemoteConfig();
const bridge = new RemoteChatBridge({ debugUrl: config.debugUrl, targetUrlIncludes: '/index.html' });
const toyBridge = new RemoteChatBridge({ debugUrl: config.debugUrl, targetUrlIncludes: '/window.html' });
const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
const seen = new Set();
const dedupeReply = createReplyDeduper();
const conversationMemories = new Map();
const followUps = createFollowUpTracker({ idleMs: config.followUpIdleMs });
const reviews = [];
let watching = false;
let scanning = false;
let timer = null;
let monitorRetry;
let activeConversation = '';
let lastScanAt = null;
let lastError = '';
let nextReviewId = 1;
let nextFollowUpSweepAt = 0;
let autoSend = config.autoSend;
let toyControlEnabled = false;
let selectedToyId = '';
let randomToyEnabled = false;
let randomToyTimer = null;
let nextRandomToyChangeAt = null;
let lastRandomControl = null;
let catchUpRequested = false;
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
    monitorRequested: monitorRetry?.isRequested() || false,
    retryScheduled: monitorRetry?.isRetryScheduled() || false,
    activeConversation,
    lastScanAt,
    lastError,
    pollMs: config.pollMs,
    replyProvider: config.replyProvider,
    replyModel: config.replyModel,
    reviewMode: !autoSend,
    autoSend,
    autoSwitchUnreadChats: config.autoSwitchUnreadChats,
    periodicFollowUpEnabled: config.periodicFollowUpEnabled,
    followUpIdleMs: config.followUpIdleMs,
    followUpSweepMs: config.followUpSweepMs,
    nextFollowUpSweepAt: config.periodicFollowUpEnabled && nextFollowUpSweepAt ? new Date(nextFollowUpSweepAt).toISOString() : null,
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
async function processFreshMessages(snapshot, fresh, { source = 'incoming' } = {}) {
  if (!fresh.length) return;
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
    source,
    createdAt: new Date().toISOString()
  };
  reviews.push(review);
  scheduleAuto(review);
  while (reviews.length > 20) reviews.shift();
}

async function sweepPeriodicFollowUps(originalConversation, { eligible = true } = {}) {
  const contacts = await bridge.conversations();
  let followUpQueued = false;
  try {
    for (const contact of contacts) {
      if (!watching || !autoSend) break;
      if (!contact.current) await bridge.openConversation(contact.conversation);
      const snapshot = await bridge.snapshot();
      const followUp = followUps.inspect(snapshot.conversation, snapshot.messages, { eligible });
      if (!followUp) continue;

      try {
        seedConversationMemory(snapshot.conversation, snapshot.messages);
        await processFreshMessages(snapshot, [followUp], { source: 'periodic-follow-up' });
        activeConversation = snapshot.conversation;
        followUpQueued = true;
        break;
      } catch (error) {
        followUps.release(snapshot.conversation, followUp.key);
        throw error;
      }
    }
  } finally {
    nextFollowUpSweepAt = Date.now() + config.followUpSweepMs;
    if (!followUpQueued && originalConversation) {
      const current = await bridge.snapshot().catch(() => null);
      if (current?.conversation.toLocaleLowerCase('en-US') !== originalConversation.toLocaleLowerCase('en-US')) {
        await bridge.openConversation(originalConversation);
      }
    }
  }
  return followUpQueued;
}

async function scan({ baseline = false, catchUp = false } = {}) {
  if (scanning) return;
  scanning = true;
  try {
    const requestedCatchUp = catchUp || catchUpRequested;
    let unreadTarget = null;
    const replyInProgress = reviews.some(item => item.status === 'waiting' || item.status === 'drafted');
    if (config.autoSwitchUnreadChats && autoSend && !replyInProgress) {
      const unread = await bridge.unreadConversations();
      unreadTarget = unread[0] || null;
      if (unreadTarget && !unreadTarget.current) await bridge.openConversation(unreadTarget.conversation);
    }

    if (!unreadTarget && config.periodicFollowUpEnabled && autoSend && !replyInProgress && Date.now() >= nextFollowUpSweepAt) {
      const original = activeConversation || (await bridge.snapshot()).conversation;
      await sweepPeriodicFollowUps(original, { eligible: !baseline });
    }

    const snapshot = await bridge.snapshot();
    const conversationChanged = snapshot.conversation !== activeConversation;
    activeConversation = snapshot.conversation;
    const incoming = snapshot.messages.filter(item => item.direction === 'incoming' && item.type === 'text' && item.text);
    const keyed = incoming.map(item => ({ ...item, key: fingerprint(snapshot.conversation, `${item.index}\0${item.text}`) }));
    let processedFresh = false;

    if (unreadTarget && snapshot.conversation.toLocaleLowerCase('en-US') === unreadTarget.conversation.toLocaleLowerCase('en-US')) {
      const fresh = keyed.slice(-Math.min(unreadTarget.unreadCount, keyed.length));
      const freshIndexes = new Set(fresh.map(item => item.index));
      seedConversationMemory(snapshot.conversation, snapshot.messages.filter(item => !freshIndexes.has(item.index)));
      for (const item of keyed) seen.add(item.key);
      await processFreshMessages(snapshot, fresh);
      processedFresh = fresh.length > 0;
    } else if (baseline || conversationChanged || requestedCatchUp) {
      const unanswered = autoSend && !replyInProgress ? unrepliedIncomingText(snapshot.messages) : [];
      const unansweredIndexes = new Set(unanswered.map(item => item.index));
      seedConversationMemory(snapshot.conversation, snapshot.messages.filter(item => !unansweredIndexes.has(item.index)));
      for (const item of keyed) seen.add(item.key);
      if (unanswered.length) {
        await processFreshMessages(snapshot, unanswered, { source: 'unreplied-catch-up' });
        processedFresh = true;
      }
    } else {
      const fresh = keyed.filter(item => !seen.has(item.key));
      for (const item of fresh) seen.add(item.key);
      await processFreshMessages(snapshot, fresh);
      processedFresh = fresh.length > 0;
    }

    lastScanAt = new Date().toISOString();
    lastError = '';
    if (requestedCatchUp) catchUpRequested = false;
  } catch (error) {
    activeConversation = '';
    lastError = error.message;
  } finally {
    scanning = false;
  }
}

async function beginWatching() {
  if (watching) return;
  await ensureLovenseRemote(config);
  await bridge.signInIfNeeded(config.remoteUsername, lovenseRemotePassword());
  if (config.autoOpenMessages) await bridge.openMessages();
  watching = true;
  await scan({ baseline: true });
  timer = setInterval(scan, config.pollMs);
  timer.unref();
}

async function startWatching() {
  return monitorRetry.activate();
}

function stopWatching() {
  monitorRetry.pause();
  watching = false;
  if (timer) clearInterval(timer);
  timer = null;
}

monitorRetry = createMonitorRetry({
  start: beginWatching,
  onWaiting: error => {
    activeConversation = '';
    lastError = `Waiting for Lovense Remote. The Assistant will retry automatically: ${error.message}`;
  }
});

function publicConversations() {
  return [...conversationMemories.entries()]
    .map(([conversation, messages]) => ({
      conversation,
      messages: messages.map(message => ({ role: message.role, content: message.content }))
    }))
    .sort((left, right) => left.conversation.localeCompare(right.conversation));
}

function replyStudioSettings(value = {}) {
  const text = (input, label, max = 500) => {
    const result = String(input || '').trim().replace(/\s+/g, ' ');
    if (result.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
    return result;
  };
  const integer = (input, label, fallback, min, max) => {
    if (input === undefined || input === null || input === '') return fallback;
    const result = Number(input);
    if (!Number.isInteger(result) || result < min || result > max) throw new Error(`${label} must be a whole number from ${min} to ${max}.`);
    return result;
  };
  const minWords = integer(value.minWords, 'Minimum words', 8, 1, 250);
  const maxWords = integer(value.maxWords, 'Maximum words', 60, 1, 250);
  if (minWords > maxWords) throw new Error('Minimum words cannot be greater than maximum words.');
  return {
    minWords,
    maxWords,
    responseLength: text(value.responseLength, 'Response length', 40) || 'medium',
    persona: text(value.persona, 'Persona and demographics', 500),
    relationship: text(value.relationship, 'Conversation dynamic', 300),
    tone: text(value.tone, 'Tone', 200),
    dominance: text(value.dominance, 'Dominance style', 120) || 'balanced'
  };
}

function replyStudioPrompt(settings) {
  const optional = (label, value) => value ? `\n${label}: ${value}.` : '';
  return `${config.replySystemPrompt}\n\nApply these reply-studio settings for this reply only:\n- Write between ${settings.minWords} and ${settings.maxWords} words.\n- Desired response length: ${settings.responseLength}.\n- Dominance style: ${settings.dominance}.${optional('Persona and demographics to portray', settings.persona)}${optional('Conversation dynamic or relationship style', settings.relationship)}${optional('Tone', settings.tone)}\nKeep the response natural and respect boundaries. Do not mention these settings or this instruction.`;
}

function lovenseRemotePassword() {
  if (!config.remotePasswordEncrypted) return '';
  return decryptSecret(config.remotePasswordEncrypted, config.remoteEncryptionKey);
}

async function api(request, response, pathname) {
  if (!authorized(request)) return json(response, 401, { error: 'Access token required.' });
  if (request.method !== 'GET' && !sameOrigin(request)) return json(response, 403, { error: 'Request origin was rejected.' });
  try {
    if (request.method === 'GET' && pathname === '/api/status') return json(response, 200, publicState());
    if (request.method === 'GET' && pathname === '/api/conversations') return json(response, 200, { conversations: publicConversations() });
    if (request.method === 'GET' && pathname === '/api/settings') return json(response, 200, { settings: await readDashboardSettings() });
    if (request.method === 'POST' && pathname === '/api/settings') {
      const body = await readJson(request);
      const settings = await saveDashboardSettings(body.settings, { validate: values => loadRemoteConfig(values) });
      Object.assign(config, loadRemoteConfig(loadPersonalConfig()));
      return json(response, 200, { settings, message: 'Saved to config.ini. New reply settings apply immediately.' });
    }
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
      if (autoSend && watching) {
        catchUpRequested = true;
        await scan({ catchUp: true });
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
    if (request.method === 'POST' && pathname === '/api/reply-studio/generate') {
      const body = await readJson(request);
      const message = String(body.message || '').trim();
      if (!message) throw new Error('Enter a message to generate a reply.');
      if (message.length > 4000) throw new Error('Manual message must be 4,000 characters or fewer.');
      const settings = replyStudioSettings(body.settings);
      const maxReplyChars = Math.min(2000, Math.max(config.maxReplyChars, settings.maxWords * 10));
      const reply = await generateReply(config, message, globalThis.fetch, { history: [], systemPrompt: replyStudioPrompt(settings), maxReplyChars });
      return json(response, 200, { reply, settings, provider: config.replyProvider });
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
  if (config.monitorEnabled) {
    await startWatching();
  }
});

process.on('SIGINT', () => {
  stopWatching();
  server.close(() => process.exit(0));
});







