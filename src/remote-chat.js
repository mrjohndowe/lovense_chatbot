import { createHash } from 'node:crypto';

const DEFAULT_DEBUG_URL = 'http://127.0.0.1:9223';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function fingerprint(conversation, message) {
  return createHash('sha256').update(`${conversation}\0${message}`).digest('hex');
}

export class RemoteChatBridge {
  constructor({ debugUrl = DEFAULT_DEBUG_URL, fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket } = {}) {
    this.debugUrl = debugUrl.replace(/\/$/, '');
    this.fetch = fetchImpl;
    this.WebSocketImpl = WebSocketImpl;
    this.socket = null;
    this.pending = new Map();
    this.nextId = 1;
  }

  async connect() {
    if (this.socket?.readyState === this.WebSocketImpl.OPEN) return;
    const response = await this.fetch(`${this.debugUrl}/json/list`, { signal: AbortSignal.timeout(4_000) });
    if (!response.ok) throw new Error(`Lovense inspection endpoint returned HTTP ${response.status}.`);
    const targets = await response.json();
    const target = targets.find(item => item.type === 'page' && item.title === 'Lovense Remote');
    if (!target?.webSocketDebuggerUrl) throw new Error('Lovense Remote renderer was not found.');

    await new Promise((resolve, reject) => {
      const socket = new this.WebSocketImpl(target.webSocketDebuggerUrl);
      const timeout = setTimeout(() => reject(new Error('Timed out connecting to Lovense Remote.')), 5_000);
      socket.addEventListener('open', () => {
        clearTimeout(timeout);
        this.socket = socket;
        resolve();
      }, { once: true });
      socket.addEventListener('error', () => {
        clearTimeout(timeout);
        reject(new Error('Could not connect to Lovense Remote.'));
      }, { once: true });
      socket.addEventListener('message', event => this.#message(event));
      socket.addEventListener('close', () => {
        if (this.socket === socket) this.socket = null;
        for (const { reject: rejectPending } of this.pending.values()) rejectPending(new Error('Lovense Remote disconnected.'));
        this.pending.clear();
      });
    });
  }

  #message(event) {
    const payload = JSON.parse(event.data);
    const pending = this.pending.get(payload.id);
    if (!pending) return;
    this.pending.delete(payload.id);
    if (payload.error) pending.reject(new Error(payload.error.message || 'Lovense inspection failed.'));
    else pending.resolve(payload.result);
  }

  async command(method, params = {}) {
    await this.connect();
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Lovense inspection request timed out.'));
      }, 5_000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value); },
        reject: error => { clearTimeout(timeout); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async evaluate(expression) {
    const result = await this.command('Runtime.evaluate', { expression, returnByValue: true });
    return result?.result?.value;
  }

  async snapshot() {
    const value = await this.evaluate(`(()=>{
      const tidy=value=>String(value||'').replace(/\\s+/g,' ').trim();
      const conversation=tidy(document.querySelector('header .header-title span.header-title')?.innerText);
      const rows=[...document.querySelectorAll('#chatContent .chat-content-lists')];
      const messages=rows.map((row,index)=>{
        const direction=row.classList.contains('left')?'incoming':row.classList.contains('right')?'outgoing':'notice';
        const textNode=direction==='incoming'?row.querySelector('.msg.friend-msg:not(.messageImage-box)'):row.querySelector('.msg:not(.friend-msg):not(.messageImage-box)');
        const text=tidy(textNode?.innerText);
        return {index,direction,type:text?'text':'non-text',text};
      }).filter(item=>item.direction!=='notice');
      return {ready:Boolean(conversation&&document.querySelector('.w-e-text[contenteditable=true]')&&document.querySelector('.send')),conversation,messages};
    })()`);
    if (!value?.ready) throw new Error('Open a Lovense Remote chat conversation so its title, messages, and editor are visible.');
    return {
      conversation: clean(value.conversation),
      messages: (value.messages || []).map(item => ({ ...item, text: clean(item.text) }))
    };
  }

  async fillDraft(text, expectedConversation) {
    const reply = clean(text);
    if (!reply) throw new Error('Reply cannot be empty.');
    const result = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(clean(expectedConversation))};
      const reply=${JSON.stringify(reply)};
      const title=String(document.querySelector('header .header-title span.header-title')?.innerText||'').replace(/\\s+/g,' ').trim();
      if(title!==expected)return {ok:false,error:'The selected Lovense conversation changed.'};
      const editor=document.querySelector('.w-e-text[contenteditable=true]');
      if(!editor)return {ok:false,error:'The Lovense message editor is unavailable.'};
      editor.focus();
      editor.textContent='';
      const paragraph=document.createElement('p');
      paragraph.textContent=reply;
      editor.appendChild(paragraph);
      editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'insertText',data:reply}));
      return {ok:true};
    })()`);
    if (!result?.ok) throw new Error(result?.error || 'Could not fill the Lovense draft.');
  }

  async send(expectedConversation) {
    const result = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(clean(expectedConversation))};
      const title=String(document.querySelector('header .header-title span.header-title')?.innerText||'').replace(/\\s+/g,' ').trim();
      if(title!==expected)return {ok:false,error:'The selected Lovense conversation changed.'};
      const editor=document.querySelector('.w-e-text[contenteditable=true]');
      const send=document.querySelector('.send');
      if(!editor||!send||!String(editor.innerText||'').trim())return {ok:false,error:'The Lovense draft is empty or unavailable.'};
      send.click();
      return {ok:true};
    })()`);
    if (!result?.ok) throw new Error(result?.error || 'Could not send the Lovense reply.');
  }
  async typeAndSend(text, expectedConversation, delayMsPerCharacter = 45, shouldContinue = () => true) {
    const reply = clean(text);
    if (!reply) throw new Error('Reply cannot be empty.');
    const expected = clean(expectedConversation);
    const prepared = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(expected)};
      const title=String(document.querySelector('header .header-title span.header-title')?.innerText||'').replace(/\\s+/g,' ').trim();
      if(title!==expected)return {ok:false,error:'The selected Lovense conversation changed.'};
      const editor=document.querySelector('.w-e-text[contenteditable=true]');
      if(!editor)return {ok:false,error:'The Lovense message editor is unavailable.'};
      editor.focus();
      editor.textContent='';
      editor.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward',data:null}));
      return {ok:true};
    })()`);
    if (!prepared?.ok) throw new Error(prepared?.error || 'Could not prepare the Lovense editor.');

    for (const character of Array.from(reply)) {
      if (!shouldContinue()) throw new Error('Automatic sending was cancelled while typing.');
      await this.command('Input.insertText', { text: character });
      if (delayMsPerCharacter > 0) await new Promise(resolve => setTimeout(resolve, delayMsPerCharacter));
    }

    if (!shouldContinue()) throw new Error('Automatic sending was cancelled before Enter was pressed.');
    const ready = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(expected)};
      const title=String(document.querySelector('header .header-title span.header-title')?.innerText||'').replace(/\\s+/g,' ').trim();
      const editor=document.querySelector('.w-e-text[contenteditable=true]');
      if(title!==expected)return {ok:false,error:'The selected Lovense conversation changed.'};
      if(!editor||!String(editor.innerText||'').trim())return {ok:false,error:'The Lovense draft is empty or unavailable.'};
      editor.focus();
      return {ok:true};
    })()`);
    if (!ready?.ok) throw new Error(ready?.error || 'Could not send the Lovense reply.');
    const key = { key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 };
    await this.command('Input.dispatchKeyEvent', { type: 'keyDown', ...key });
    await this.command('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
  }
}


