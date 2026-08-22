import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteChatBridge } from '../src/remote-chat.js';

test('automatic send rechecks the conversation and clicks the Lovense Send control', async () => {
  let evaluatedExpression = '';
  const requests = [];
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
      evaluatedExpression = request.params.expression;
      queueMicrotask(() => this.emit('message', { data: JSON.stringify({ id: request.id, result: { result: { value: { ok: true } } } }) }));
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
  assert.match(evaluatedExpression, /title!==expected/);
  assert.match(evaluatedExpression, /send\.click\(\)/);

  requests.length = 0;
  await bridge.typeAndSend('Hi', 'Selected conversation', 0);
  const inputRequests = requests.filter(request => request.method.startsWith('Input.'));
  assert.deepEqual(inputRequests.map(request => [request.method, request.params.text || request.params.type]), [
    ['Input.insertText', 'H'],
    ['Input.insertText', 'i'],
    ['Input.dispatchKeyEvent', 'keyDown'],
    ['Input.dispatchKeyEvent', 'keyUp']
  ]);
  assert.equal(inputRequests.at(-2).params.key, 'Enter');
  assert.equal(inputRequests.at(-1).params.key, 'Enter');
  assert.equal(requests.some(request => request.method === 'Page.bringToFront' || request.method === 'Target.activateTarget'), false);
});



