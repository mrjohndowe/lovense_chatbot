import test from 'node:test';
import assert from 'node:assert/strict';
import { RemoteChatBridge } from '../src/remote-chat.js';

test('automatic send rechecks the conversation and clicks the Lovense Send control', async () => {
  let evaluatedExpression = '';
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
});
