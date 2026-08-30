const state = { token: sessionStorage.getItem('remote-reply-token') || '', objectUrls: [] };

function headers() { return state.token ? { authorization: `Bearer ${state.token}` } : {}; }

async function request(path) {
  const response = await fetch(path, { headers: headers() });
  if (response.status === 401) {
    const token = window.prompt('Enter CHATBOT_ACCESS_TOKEN from your private config.ini:');
    if (token === null) throw new Error('Access token is required.');
    state.token = token.trim();
    sessionStorage.setItem('remote-reply-token', state.token);
    return request(path);
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || 'Request failed.');
  return body;
}

function clearImageUrls() {
  for (const url of state.objectUrls) URL.revokeObjectURL(url);
  state.objectUrls = [];
}

async function showSavedImage(image, savedMedia) {
  try {
    const response = await fetch(`/api/media/${encodeURIComponent(savedMedia.id)}`, { headers: headers() });
    if (!response.ok) throw new Error('Saved image is unavailable.');
    const url = URL.createObjectURL(await response.blob());
    state.objectUrls.push(url);
    image.src = url;
  } catch (error) {
    image.alt = error.message;
    image.classList.add('unavailable');
  }
}

function render(conversations, savedMedia) {
  clearImageUrls();
  const list = document.querySelector('#conversation-list');
  const cards = new Map();
  for (const conversation of conversations) cards.set(conversation.conversation, { conversation: conversation.conversation, messages: conversation.messages, media: [] });
  for (const image of savedMedia) {
    const card = cards.get(image.conversation) || { conversation: image.conversation, messages: [], media: [] };
    card.media.push(image);
    cards.set(image.conversation, card);
  }
  const entries = [...cards.values()].sort((left, right) => left.conversation.localeCompare(right.conversation));
  document.querySelector('#conversation-status').textContent = `${conversations.length} active text conversation${conversations.length === 1 ? '' : 's'} and ${savedMedia.length} saved picture${savedMedia.length === 1 ? '' : 's'}. Pictures remain private on this computer.`;
  if (!entries.length) { list.innerHTML = '<div class="empty">No saved messages or pictures yet.</div>'; return; }
  list.replaceChildren(...entries.map(conversation => {
    const card = document.createElement('article');
    card.className = 'conversation-card';
    const title = document.createElement('h3');
    title.textContent = conversation.conversation;
    const meta = document.createElement('p');
    meta.className = 'muted';
    meta.textContent = `${conversation.messages.length} remembered message${conversation.messages.length === 1 ? '' : 's'} · ${conversation.media.length} saved picture${conversation.media.length === 1 ? '' : 's'}`;
    card.append(title, meta);
    for (const message of conversation.messages) {
      const row = document.createElement('div');
      row.className = `conversation-message ${message.role}`;
      row.textContent = `${message.role === 'assistant' ? 'Assistant' : 'Other person'}: ${message.content}`;
      card.append(row);
    }
    if (conversation.media.length) {
      const gallery = document.createElement('div');
      gallery.className = 'conversation-media-grid';
      for (const savedMedia of conversation.media) {
        const figure = document.createElement('figure');
        figure.className = 'conversation-media';
        const image = document.createElement('img');
        image.alt = `${savedMedia.direction === 'outgoing' ? 'Picture sent by the Assistant account' : 'Picture received from the other person'}`;
        image.loading = 'lazy';
        const caption = document.createElement('figcaption');
        caption.textContent = `${savedMedia.direction === 'outgoing' ? 'Sent' : 'Received'} · ${new Date(savedMedia.capturedAt).toLocaleString()}`;
        figure.append(image, caption);
        gallery.append(figure);
        void showSavedImage(image, savedMedia);
      }
      card.append(gallery);
    }
    return card;
  }));
}

async function load() {
  try {
    const conversations = await request('/api/conversations');
    const media = await request('/api/media');
    render(conversations.conversations, media.media);
  } catch (error) { document.querySelector('#conversation-status').textContent = error.message; }
}

document.querySelector('#conversation-refresh').addEventListener('click', load);
window.addEventListener('beforeunload', clearImageUrls);
load();
setInterval(load, 5000);
