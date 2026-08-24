import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyRemoteMessage, RemoteChatBridge } from '../src/remote-chat.js';

test('automatic send rechecks the conversation and clicks the Lovense Send control', async () => {
  let evaluatedExpression = '';
  const requests = [];
  let sent = false;
  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.listeners = new Map();
      queueMicrotask(() => {
        this.readyState = FakeWebSocket.OPEN;
        this.emit('open', {});
      });
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, event) {
      for (const listener of this.listeners.get(type) || []) listener(event);
    }
    send(raw) {
      const request = JSON.parse(raw);
      requests.push(request);
      if (request.params.expression) evaluatedExpression = request.params.expression;
      let value = { ok: true };
      if (request.params.expression?.includes('send.click()')) {
        value = sent ? { ok: true, sent: true } : { ok: true, sent: false, clicked: true };
        sent = true;
      }
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: request.id, result: { result: { value } } }) }));
    }
    close() {
      this.readyState = 3;
      this.emit('close', {});
    }
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [{ type: 'page', title: 'Lovense Remote', webSocketDebuggerUrl: 'ws://127.0.0.1/test' }]
  });
  const bridge = new RemoteChatBridge({ fetchImpl, WebSocketImpl: FakeWebSocket });
  await bridge.send('Selected conversation');
  const initialEvaluated = requests.filter(request => request.method === 'Runtime.evaluate').map(request => request.params.expression).join(' ');
  assert.match(initialEvaluated, /title!==expected/);
  assert.match(initialEvaluated, /send\.click\(\)/);
  assert.equal(requests.some(request => request.method === 'Input.dispatchMouseEvent'), false);
  assert.match(initialEvaluated, /send\.click\(\)/);


  requests.length = 0;
  sent = false;
  await bridge.typeAndSend('Hi', 'Selected conversation', 0);
  const inputRequests = requests.filter(request => request.method === 'Input.insertText');
  assert.deepEqual(inputRequests.map(request => [request.method, request.params.text]), [
    ['Input.insertText', 'H'],
    ['Input.insertText', 'i']
  ]);
  const keyRequests = requests.filter(request => request.method === 'Input.dispatchKeyEvent');
  assert.deepEqual(keyRequests.map(request => request.params.type), ['rawKeyDown', 'keyUp']);
  assert.ok(keyRequests.every(request => request.params.key === 'Enter' && request.params.windowsVirtualKeyCode === 13));
  const evaluated = requests.filter(request => request.method === 'Runtime.evaluate').map(request => request.params.expression).join(' ');
  assert.match(evaluated, /send\.click\(\)/);
  assert.equal(requests.some(request => request.method === 'Input.dispatchMouseEvent'), false);
  assert.equal(requests.some(request => request.method === 'Page.bringToFront' || request.method === 'Target.activateTarget'), false);
});
test('targets the separate Live Control renderer and validates a bounded slider command', async () => {
  let connectedUrl = '';
  let expression = '';
  class FakeWebSocket {
    static OPEN = 1;
    constructor(url) {
      connectedUrl = url;
      this.readyState = 0;
      this.listeners = new Map();
      queueMicrotask(() => { this.readyState = FakeWebSocket.OPEN; this.emit('open', {}); });
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send(raw) {
      const request = JSON.parse(raw);
      expression = request.params.expression;
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: request.id, result: { result: { value: { ok: true, index: 0, value: 2.4, name: 'Vibrate' } } } }) }));
    }
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [
      { type: 'page', title: 'Lovense Remote', url: 'file:///resources/app/dist/window.html', webSocketDebuggerUrl: 'ws://127.0.0.1/control' },
      { type: 'page', title: 'Lovense Remote', url: 'file:///resources/app/dist/index.html#/long-distance', webSocketDebuggerUrl: 'ws://127.0.0.1/chat' }
    ]
  });
  const bridge = new RemoteChatBridge({ targetUrlIncludes: '/window.html', fetchImpl, WebSocketImpl: FakeWebSocket });
  const result = await bridge.setToyControl('expected-toy', 0, 2.4);
  assert.equal(connectedUrl, 'ws://127.0.0.1/control');
  assert.equal(result.value, 2.4);
  assert.match(expression, /String\(connected\[0\]\.id\)!==expected/);
  assert.match(expression, /value<min\|\|value>max/);
  assert.match(expression, /vm\.rotateChange\(value\)/);
});



test('classifies the mobile-only Vow game invitation as non-replyable', () => {
  assert.equal(classifyRemoteMessage('[vowgameinvitecard]'), 'mobile-game-card');
  assert.equal(classifyRemoteMessage('  [VowGameInviteCard]  '), 'mobile-game-card');
  assert.equal(classifyRemoteMessage('Want to play? [vowgameinvitecard]'), 'mobile-game-card');
  assert.equal(classifyRemoteMessage('Want to play a game?'), 'text');
});


test('discovers unread contacts and confirms the selected conversation after switching', async () => {
  const expressions = [];
  class FakeWebSocket {
    static OPEN = 1;
    constructor() {
      this.readyState = 0;
      this.listeners = new Map();
      queueMicrotask(() => { this.readyState = FakeWebSocket.OPEN; this.emit('open', {}); });
    }
    addEventListener(type, listener) {
      const listeners = this.listeners.get(type) || [];
      listeners.push(listener);
      this.listeners.set(type, listeners);
    }
    emit(type, event) { for (const listener of this.listeners.get(type) || []) listener(event); }
    send(raw) {
      const request = JSON.parse(raw);
      const expression = request.params.expression;
      expressions.push(expression);
      let value = { ok: true };
      if (expression.includes("querySelectorAll('li.contact-lis')") && expression.includes('unreadCount')) {
        value = [{ index: 1, conversation: 'JudeLaw ', preview: 'hey', unreadCount: 1, current: false }];
      } else if (expression.includes("querySelectorAll('li.contact-lis')") && expression.includes('.map((row,index)')) {
        value = [{ index: 1, conversation: 'JudeLaw ', preview: 'hey', unreadCount: 1, current: false }];
      } else if (expression.startsWith("String(document.querySelector('header")) {
        value = 'JudeLaw';
      }
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: request.id, result: { result: { value } } }) }));
    }
  }
  const fetchImpl = async () => ({
    ok: true,
    json: async () => [{ type: 'page', title: 'Lovense Remote', url: 'file:///index.html', webSocketDebuggerUrl: 'ws://127.0.0.1/test' }]
  });
  const bridge = new RemoteChatBridge({ fetchImpl, WebSocketImpl: FakeWebSocket });
  const conversations = await bridge.conversations();
  assert.deepEqual(conversations, [{ index: 1, conversation: 'JudeLaw', preview: 'hey', unreadCount: 1, current: false }]);
  const unread = await bridge.unreadConversations();
  assert.deepEqual(unread, [{ index: 1, conversation: 'JudeLaw', preview: 'hey', unreadCount: 1, current: false }]);
  assert.equal(await bridge.openConversation('JudeLaw'), 'JudeLaw');
  const source = expressions.join(' ');
  assert.match(source, /message-num:not\(\.message-mute\)/);
  assert.match(source, /nick-name/);
  assert.match(source, /row\.click\(\)/);
  assert.match(source, /toLocaleLowerCase/);
});
