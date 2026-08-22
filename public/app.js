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

try {
  const response = await fetch('/api/status', { headers: headers() });
  const data = await response.json();
  status.classList.toggle('online', response.ok);
  status.innerHTML = `<span></span>${response.ok ? `${data.mode} mode` : 'Locked'}`;
} catch { status.innerHTML = '<span></span>Offline'; }
