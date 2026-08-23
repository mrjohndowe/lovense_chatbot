import { createHash } from 'node:crypto';

const DEFAULT_DEBUG_URL = 'http://127.0.0.1:9223';

function clean(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

export function classifyRemoteMessage(text, fallbackType = 'text') {
  if (fallbackType !== 'text') return fallbackType;
  return /\[vowgameinvitecard\]/i.test(clean(text)) ? 'mobile-game-card' : 'text';
}

export function fingerprint(conversation, message) {
  return createHash('sha256').update(`${conversation}\0${message}`).digest('hex');
}

export class RemoteChatBridge {
  constructor({ debugUrl = DEFAULT_DEBUG_URL, targetUrlIncludes = '', fetchImpl = globalThis.fetch, WebSocketImpl = globalThis.WebSocket } = {}) {
    this.debugUrl = debugUrl.replace(/\/$/, '');
    this.targetUrlIncludes = targetUrlIncludes;
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
    const pages = targets.filter(item => item.type === 'page' && item.title === 'Lovense Remote');
    const target = this.targetUrlIncludes
      ? pages.find(item => String(item.url || '').includes(this.targetUrlIncludes))
      : (pages.find(item => String(item.url || '').includes('/index.html')) || pages[0]);
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

  async unreadConversations() {
    const value = await this.evaluate(`(()=>{
      const tidy=value=>String(value||'').replace(/\\s+/g,' ').trim();
      return [...document.querySelectorAll('li.contact-lis')].map((row,index)=>{
        const conversation=tidy(row.querySelector('.nick-name')?.innerText);
        const badge=row.querySelector('.message-num:not(.message-mute)');
        const unreadCount=Number.parseInt(tidy(badge?.innerText),10);
        const preview=tidy(row.querySelector('.last-msg')?.innerText);
        return {index,conversation,preview,unreadCount:Number.isInteger(unreadCount)?unreadCount:0,current:row.classList.contains('current-lis')};
      }).filter(item=>item.conversation&&item.unreadCount>0);
    })()`);
    return Array.isArray(value) ? value.map(item => ({
      ...item,
      conversation: clean(item.conversation),
      preview: clean(item.preview),
      unreadCount: Math.max(1, Number(item.unreadCount) || 1)
    })) : [];
  }

  async openConversation(expectedConversation) {
    const expected = clean(expectedConversation);
    if (!expected) throw new Error('Conversation name cannot be empty.');
    const selected = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(expected)};
      const tidy=value=>String(value||'').replace(/\\s+/g,' ').trim();
      const rows=[...document.querySelectorAll('li.contact-lis')];
      const row=rows.find(item=>tidy(item.querySelector('.nick-name')?.innerText).toLocaleLowerCase('en-US')===expected.toLocaleLowerCase('en-US'));
      if(!row)return {ok:false,error:'The unread Lovense conversation is no longer available.'};
      row.scrollIntoView({block:'nearest'});
      row.click();
      return {ok:true};
    })()`);
    if (!selected?.ok) throw new Error(selected?.error || 'Could not open the unread Lovense conversation.');

    const deadline = Date.now() + 4_000;
    while (Date.now() < deadline) {
      const title = clean(await this.evaluate(`String(document.querySelector('header .header-title span.header-title')?.innerText||'')`));
      if (title.toLocaleLowerCase('en-US') === expected.toLocaleLowerCase('en-US')) return title;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error('Lovense did not finish switching to the expected conversation.');
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
      messages: (value.messages || []).map(item => {
        const text = clean(item.text);
        return { ...item, text, type: classifyRemoteMessage(text, item.type) };
      })
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

  async send(expectedConversation, maxSendAttempts = 5) {
    const expected = clean(expectedConversation);
    const attempts = Math.max(1, Math.min(10, Number(maxSendAttempts) || 5));

    // Try the normal keyboard path first.
    const key = {
      key: 'Enter',
      code: 'Enter',
      windowsVirtualKeyCode: 13,
      nativeVirtualKeyCode: 13
    };
    await this.command('Input.dispatchKeyEvent', { type: 'rawKeyDown', ...key });
    await this.command('Input.dispatchKeyEvent', { type: 'keyUp', ...key });
    await new Promise(resolve => setTimeout(resolve, 250));

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      // Recheck the exact recipient and draft before every click. If a prior
      // attempt sent it, the empty editor ends the loop without another click.
      const target = await this.evaluate(`(()=>{
        const expected=${JSON.stringify(expected)};
        const title=String(document.querySelector('header .header-title span.header-title')?.innerText||'').replace(/\\s+/g,' ').trim();
        if(title!==expected)return {ok:false,error:'The selected Lovense conversation changed.'};
        const editor=document.querySelector('.w-e-text[contenteditable=true]');
        const send=document.querySelector('.send');
        if(!editor||!send)return {ok:false,error:'The Lovense editor or Send control is unavailable.'};
        if(!String(editor.innerText||'').trim())return {ok:true,sent:true};
        // Lovense's older Electron renderer can ignore synthetic mouse events.
        // Invoke its own Send handler, then let the bounded loop verify the draft cleared.
        send.click();
        return {ok:true,sent:false,clicked:true};
      })()`);
      if (!target?.ok) throw new Error(target?.error || 'Could not locate the Lovense Send control.');
      if (target.sent) return;

      await new Promise(resolve => setTimeout(resolve, 500));
    }

    const verified = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(expected)};
      const title=String(document.querySelector('header .header-title span.header-title')?.innerText||'').replace(/\\s+/g,' ').trim();
      const editor=document.querySelector('.w-e-text[contenteditable=true]');
      if(title!==expected)return {ok:false,error:'The selected Lovense conversation changed.'};
      if(!editor)return {ok:false,error:'The Lovense message editor is unavailable.'};
      if(String(editor.innerText||'').trim())return {ok:false,error:'Lovense left the reply in the draft after repeated Send attempts.'};
      return {ok:true};
    })()`);
    if (!verified?.ok) throw new Error(verified?.error || 'Lovense did not confirm that the reply was sent.');
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
    await this.send(expected);
  }
  async toySnapshot() {
    const result = await this.evaluate(`(()=>{
      const panel=document.querySelector('.control-toys-pannel');
      const page=panel?.__vue__;
      if(!page)return {ok:false,error:'Open an accepted Lovense Live Control slider window.'};
      const connected=(page.controlToysArr||[]).filter(toy=>String(toy.status)==='2');
      if(connected.length!==1)return {ok:false,error:'Exactly one accepted toy must be visible for setup.'};
      const toy=connected[0];
      const device=page.toys?.[toy.id]||{};
      const sliders=[...document.querySelectorAll('.toy-slider')].map((wrapper,index)=>{
        const input=wrapper.querySelector('input[type=range]');
        const vm=wrapper.__vue__;
        if(!input||!vm)return null;
        return {index,name:String(vm.$options?.propsData?.title||wrapper.innerText||'Function '+(index+1)).trim(),min:Number(input.min),max:Number(input.max),step:Number(input.step||1),value:Number(input.value)};
      }).filter(Boolean);
      if(!sliders.length)return {ok:false,error:'No Lovense toy sliders are visible.'};
      return {ok:true,toy:{id:String(toy.id),name:String(device.name||device.deviceType||toy.deviceType||'Toy'),deviceType:String(device.deviceType||toy.deviceType||''),battery:Number(device.battery),functions:sliders}};
    })()`);
    if (!result?.ok) throw new Error(result?.error || 'Could not inspect the Lovense toy controls.');
    return result.toy;
  }

  async setToyControl(expectedToyId, functionIndex, requestedValue) {
    const result = await this.evaluate(`(()=>{
      const expected=${JSON.stringify(String(expectedToyId || ''))};
      const index=${JSON.stringify(Number(functionIndex))};
      const value=${JSON.stringify(Number(requestedValue))};
      const page=document.querySelector('.control-toys-pannel')?.__vue__;
      const connected=(page?.controlToysArr||[]).filter(toy=>String(toy.status)==='2');
      if(connected.length!==1||String(connected[0].id)!==expected)return {ok:false,error:'The accepted Lovense toy changed.'};
      const wrappers=[...document.querySelectorAll('.toy-slider')];
      const wrapper=wrappers[index];
      const input=wrapper?.querySelector('input[type=range]');
      const vm=wrapper?.__vue__;
      if(!input||!vm)return {ok:false,error:'The requested Lovense slider is unavailable.'};
      const min=Number(input.min),max=Number(input.max),step=Number(input.step||1);
      if(!Number.isFinite(value)||value<min||value>max)return {ok:false,error:'The requested slider value is outside Lovense’s range.'};
      const aligned=Math.round((value-min)/step)*step+min;
      if(Math.abs(aligned-value)>1e-9)return {ok:false,error:'The requested slider value does not match Lovense’s step size.'};
      vm.controlData=value;
      input.value=String(value);
      input._value=value;
      vm.rotateChange(value);
      return {ok:true,index,value,name:String(vm.$options?.propsData?.title||wrapper.innerText||'Function '+(index+1)).trim()};
    })()`);
    if (!result?.ok) throw new Error(result?.error || 'Could not change the Lovense toy control.');
    return result;
  }

  async stopToy(expectedToyId) {
    const toy = await this.toySnapshot();
    if (String(toy.id) !== String(expectedToyId || toy.id)) throw new Error('The accepted Lovense toy changed.');
    const results = [];
    for (const control of toy.functions) results.push(await this.setToyControl(toy.id, control.index, 0));
    return results;
  }
}





