const form = document.querySelector('#chat-form');
const input = document.querySelector('#message');
const token = document.querySelector('#access-token');
const messages = document.querySelector('#messages');
const status = document.querySelector('#status');

function addMessage(who, text) {
  const article = document.createElement('article');
  article.className = `message ${who}`;
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  avatar.textContent = who === 'user' ? 'Y' : 'L';
  const content = document.createElement('div');
  const strong = document.createElement('strong');
  strong.textContent = who === 'user' ? 'You' : 'Lovense Bot';
  const paragraph = document.createElement('p');
  paragraph.textContent = text;
  content.append(strong, paragraph);
  article.append(avatar, content);
  messages.append(article);
  messages.scrollTop = messages.scrollHeight;
}

function headers() {
  const result = { 'content-type': 'application/json' };
  if (token.value) result.authorization = `Bearer ${token.value}`;
  return result;
}

async function send(message) {
  addMessage('user', message);
  try {
    const response = await fetch('/api/message', { method: 'POST', headers: headers(), body: JSON.stringify({ message }) });
    const data = await response.json();
    addMessage('bot', data.reply || data.error || 'Unexpected response.');
  } catch { addMessage('bot', 'The local server is unavailable.'); }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  const value = input.value.trim();
  if (!value) return;
  input.value = '';
  send(value);
});
document.querySelector('#stop').addEventListener('click', () => send('/stop'));

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}

function renderPlatforms(platforms) {
  const grid = document.querySelector('#platform-grid');
  grid.replaceChildren();
  for (const [name, details] of Object.entries(platforms)) {
    const card = document.createElement('article');
    card.className = 'platform-card';
    const title = document.createElement('h3');
    title.textContent = name[0].toUpperCase() + name.slice(1);
    const description = document.createElement('p');
    description.textContent = details.enabled ? (details.configured ? 'Enabled and configured' : 'Enabled, setup incomplete') : 'Disabled in configuration';
    const badge = document.createElement('span');
    badge.className = `badge ${details.enabled && details.configured ? 'good' : ''}`;
    badge.textContent = details.enabled ? (details.configured ? 'ready' : 'needs setup') : 'off';
    card.append(title, description, badge);
    grid.append(card);
  }
}

function renderConsents(consents) {
  const list = document.querySelector('#consent-list');
  list.replaceChildren();
  for (const consent of consents) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.textContent = `${consent.platform}: ${consent.userId} — ${consent.enabled ? 'granted' : 'revoked'}`;
    list.append(chip);
  }
}

async function loadStatus() {
  try {
    const data = await api('/api/status');
    status.classList.add('online');
    status.replaceChildren();
    const dot = document.createElement('span');
    status.append(dot, document.createTextNode(`${data.mode} mode`));
    renderPlatforms(data.platforms);
    renderConsents(data.consents);
  } catch (error) {
    status.classList.remove('online');
    status.textContent = error.message.includes('token') ? 'Locked' : 'Offline';
  }
}

async function loadAudit() {
  const list = document.querySelector('#audit-list');
  try {
    const data = await api('/api/audit');
    list.replaceChildren();
    if (!data.events.length) list.textContent = 'No activity recorded in this process yet.';
    for (const event of data.events) {
      const row = document.createElement('div');
      row.className = 'audit-row';
      for (const value of [new Date(event.at).toLocaleString(), event.platform, `${event.userId}: ${event.action}`, event.outcome]) {
        const cell = document.createElement('span');
        cell.textContent = value;
        row.append(cell);
      }
      list.append(row);
    }
  } catch (error) { list.textContent = error.message; }
}

document.querySelectorAll('.tab').forEach(button => button.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach(tab => tab.classList.toggle('active', tab === button));
  for (const id of ['control', 'integrations', 'activity']) document.querySelector(`#${id}`).classList.toggle('hidden', id !== button.dataset.panel);
  if (button.dataset.panel === 'activity') loadAudit();
}));
document.querySelector('#refresh').addEventListener('click', loadStatus);
document.querySelector('#refresh-audit').addEventListener('click', loadAudit);
document.querySelector('#pair').addEventListener('click', async () => {
  const result = document.querySelector('#pairing-result');
  result.replaceChildren();
  try {
    const data = await api('/api/pairing/qr', { method: 'POST', body: '{}' });
    const text = document.createElement('p');
    text.textContent = `Expires in ${data.expiresInHours} hours${data.code ? `. PC code: ${data.code}` : ''}`;
    const image = document.createElement('img');
    image.src = data.qr;
    image.alt = 'Lovense pairing QR code';
    result.append(text, image);
  } catch (error) { result.textContent = error.message; }
});
document.querySelector('#save-consent').addEventListener('click', async () => {
  try {
    const body = { platform: document.querySelector('#consent-platform').value, userId: document.querySelector('#consent-user').value.trim(), enabled: document.querySelector('#consent-enabled').value === 'true' };
    const data = await api('/api/consent', { method: 'POST', body: JSON.stringify(body) });
    renderConsents(data.consents);
  } catch (error) { addMessage('bot', error.message); }
});
token.addEventListener('change', loadStatus);
await loadStatus();
