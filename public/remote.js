const state = { token: sessionStorage.getItem('remote-reply-token') || '', data: null };
const queue = document.querySelector('#queue');
const errorBox = document.querySelector('#error');

function headers() {
  return { 'content-type': 'application/json', ...(state.token ? { authorization: `Bearer ${state.token}` } : {}) };
}

async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
  if (response.status === 401) {
    const token = window.prompt('Enter CHATBOT_ACCESS_TOKEN from your private config.ini:');
    if (token === null) throw new Error('Access token is required.');
    state.token = token.trim();
    sessionStorage.setItem('remote-reply-token', state.token);
    return request(path, options);
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `Request failed with HTTP ${response.status}.`);
  return body;
}

function showError(message = '') {
  errorBox.textContent = message;
  errorBox.classList.toggle('hidden', !message);
}

function reviewCard(item) {
  const article = document.createElement('article');
  article.className = 'review';
  article.dataset.id = item.id;
  const top = document.createElement('div');
  top.className = 'review-top';
  const title = document.createElement('strong');
  title.textContent = item.conversation;
  const badge = document.createElement('span');
  badge.className = 'badge';
  badge.textContent = item.status === 'drafted' ? 'Draft placed' : item.scheduledFor ? `Auto ${new Date(item.scheduledFor).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : 'Waiting';
  top.append(title, badge);
  const message = document.createElement('div');
  message.className = 'message';
  message.textContent = item.message;
  const label = document.createElement('label');
  label.textContent = 'Review or edit the proposed reply';
  const textarea = document.createElement('textarea');
  textarea.value = item.reply;
  textarea.maxLength = 2000;
  const actions = document.createElement('div');
  actions.className = 'review-actions';
  for (const [action, labelText, className] of [['dismiss','Dismiss','secondary'],['draft','Place draft','secondary'],['send','Send now','danger']]) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    button.className = className;
    button.textContent = labelText;
    actions.append(button);
  }
  article.append(top, message, label, textarea, actions);
  return article;
}

function render(data) {
  state.data = data;
  const connection = document.querySelector('#connection');
  connection.classList.toggle('connected', data.connected);
  connection.classList.toggle('disconnected', !data.connected);
  connection.querySelector('strong').textContent = data.connected ? 'Lovense connected' : 'Lovense unavailable';
  document.querySelector('#conversation').textContent = data.activeConversation || 'No open conversation';
  document.querySelector('#provider').textContent = `${data.replyProvider} · ${data.replyModel}`;
  document.querySelector('#monitor-detail').textContent = data.watching ? `Watching every ${Math.round(data.pollMs / 100) / 10} seconds` : 'Paused';
  const autoButton = document.querySelector('#auto-send');
  autoButton.textContent = data.autoSend ? 'Disable automatic sending' : 'Enable automatic sending';
  autoButton.className = data.autoSend ? 'danger' : 'secondary';
  document.querySelector('#auto-detail').textContent = data.autoSend
    ? `Armed — random ${Math.round(data.autoSendMinDelayMs / 1000)}–${Math.round(data.autoSendMaxDelayMs / 1000)} second reaction, visible typing, then Enter.`
    : 'Disabled — every reply requires review.';
  document.querySelector('#send-mode').textContent = data.autoSend ? 'Automatic · armed' : 'Review required';
  document.querySelector('#send-notice-title').textContent = data.autoSend ? 'Automatic sending is armed.' : 'Automatic sending is off.';
  document.querySelector('#start').disabled = data.watching;
  document.querySelector('#stop').disabled = !data.watching;
  showError(data.lastError || '');
  const active = data.reviews.filter(item => item.status === 'waiting' || item.status === 'drafted');
  queue.replaceChildren(...(active.length ? active.map(reviewCard) : [Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No new incoming messages are waiting.' })]));
}

function renderToy(toy) {
  state.toy = toy;
  const name = document.querySelector('#toy-name');
  const detail = document.querySelector('#toy-detail');
  const enable = document.querySelector('#toy-enable');
  const random = document.querySelector('#toy-random');
  const stop = document.querySelector('#toy-stop');
  const functions = document.querySelector('#toy-functions');
  name.textContent = toy.available ? toy.name : 'No accepted toy session';
  const limits = toy.randomLimits;
  detail.textContent = toy.available
    ? `${toy.deviceType || 'Toy'}${toy.battery === null ? '' : ` · Battery ${toy.battery}%`} · ${toy.functions.length} function${toy.functions.length === 1 ? '' : 's'}${limits ? ` · Random ${limits.minLevel}–${limits.maxLevel} every ${limits.minIntervalMs / 1000}–${limits.maxIntervalMs / 1000}s` : ''}${toy.randomEnabled ? ' · RANDOM ACTIVE' : ''}`
    : (toy.error || 'Open Live Control in the chat and wait for the other user to accept.');
  enable.disabled = !toy.available;
  enable.textContent = toy.enabled ? 'Disable toy controls' : 'Enable toy controls';
  enable.className = toy.enabled ? 'danger' : 'secondary';
  random.disabled = !toy.available || !toy.enabled;
  random.textContent = toy.randomEnabled ? 'Stop Random' : 'Start Random';
  random.className = toy.randomEnabled ? 'danger' : 'secondary';
  stop.disabled = !toy.available;
  if (!toy.available || !toy.functions.length) {
    functions.replaceChildren(Object.assign(document.createElement('div'), { className: 'empty', textContent: 'No first-toy sliders detected.' }));
    return;
  }
  functions.replaceChildren(...toy.functions.map(control => {
    const row = document.createElement('label');
    row.className = 'toy-function';
    const heading = document.createElement('span');
    heading.className = 'toy-function-heading';
    const title = document.createElement('strong');
    title.textContent = control.name;
    const value = document.createElement('output');
    value.textContent = String(control.value);
    heading.append(title, value);
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(control.min);
    slider.max = String(control.max);
    slider.step = String(control.step);
    slider.value = String(control.value);
    slider.disabled = !toy.enabled || toy.randomEnabled;
    slider.dataset.functionIndex = String(control.index);
    slider.addEventListener('input', () => { value.textContent = slider.value; });
    slider.addEventListener('change', async () => {
      slider.disabled = true;
      try {
        renderToy(await request('/api/toys/control', { method: 'POST', body: JSON.stringify({ functionIndex: Number(slider.dataset.functionIndex), value: Number(slider.value) }) }));
      } catch (error) {
        detail.textContent = error.message;
        await refreshToys();
      }
    });
    const bounds = document.createElement('small');
    bounds.textContent = `${control.min} to ${control.max} · step ${control.step}`;
    row.append(heading, slider, bounds);
    return row;
  }));
}

async function refreshToys() {
  try { renderToy(await request('/api/toys')); }
  catch (error) { renderToy({ available: false, enabled: false, error: error.message, functions: [] }); }
}
async function refresh() {
  try { render(await request('/api/status')); }
  catch (error) { showError(error.message); }
}

async function monitor(action) {
  try { render(await request(`/api/monitor/${action}`, { method: 'POST', body: '{}' })); }
  catch (error) { showError(error.message); }
}

queue.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const card = button.closest('.review');
  const id = card.dataset.id;
  const reply = card.querySelector('textarea').value.trim();
  const action = button.dataset.action;
  if (action === 'send' && !window.confirm(`Send this reply now to ${card.querySelector('strong').textContent}?`)) return;
  button.disabled = true;
  try {
    await request(`/api/review/${action}`, { method: 'POST', body: JSON.stringify({ id, reply }) });
    await refresh();
  } catch (error) {
    showError(error.message);
    button.disabled = false;
  }
});

document.querySelector('#start').addEventListener('click', () => monitor('start'));
document.querySelector('#stop').addEventListener('click', () => monitor('stop'));
document.querySelector('#refresh').addEventListener('click', refresh);
document.querySelector('#toy-enable').addEventListener('click', async () => {
  const enabling = !state.toy?.enabled;
  if (enabling && !window.confirm(`Enable manual controls for ${state.toy?.name || 'this toy'}?`)) return;
  try { renderToy(await request('/api/toys/enable', { method: 'POST', body: JSON.stringify({ enabled: enabling }) })); }
  catch (error) { document.querySelector('#toy-detail').textContent = error.message; }
});
document.querySelector('#toy-random').addEventListener('click', async () => {
  const enabling = !state.toy?.randomEnabled;
  if (enabling && !window.confirm(`Start bounded random intensity/speed changes for ${state.toy?.name || "the chat partner's toy"}? Stop Random or Stop toy returns all sliders to zero.`)) return;
  try { renderToy(await request('/api/toys/random', { method: 'POST', body: JSON.stringify({ enabled: enabling }) })); }
  catch (error) { document.querySelector('#toy-detail').textContent = error.message; }
});document.querySelector('#toy-stop').addEventListener('click', async () => {
  const button = document.querySelector('#toy-stop');
  button.disabled = true;
  try { renderToy(await request('/api/toys/stop', { method: 'POST', body: '{}' })); }
  catch (error) { document.querySelector('#toy-detail').textContent = error.message; }
});document.querySelector('#auto-send').addEventListener('click', async () => {
  const enabling = !state.data?.autoSend;
  if (enabling && !window.confirm('Enable automatic sending? New detected messages will be replied to without individual review after a human-style delay.')) return;
  try {
    render(await request('/api/auto-send', { method: 'POST', body: JSON.stringify({ enabled: enabling }) }));
  } catch (error) { showError(error.message); }
});
refresh();
setInterval(refresh, 2500);





