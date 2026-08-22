import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIni } from '../src/ini-config.js';

test('parses grouped INI settings and comments', () => {
  const values = parseIni(`
; comment
[Remote automation]
ENABLE_AUTO_SEND=false ; disabled by default
CHAT_DISPLAY_NAME="Taylor" ; inline identity comment
REPLY_SYSTEM_PROMPT="Keep = signs; in values" ; trailing comment
`);
  assert.deepEqual(values, {
    ENABLE_AUTO_SEND: 'false',
    CHAT_DISPLAY_NAME: 'Taylor',
    REPLY_SYSTEM_PROMPT: 'Keep = signs; in values'
  });
});

test('rejects malformed INI settings', () => {
  assert.throws(() => parseIni('[Group]\nNOT A SETTING'), /line 2/);
});

test('treats unchanged placeholders as blank', () => {
  const values = parseIni('CHAT_FIRST_NAME="<your first name>" ; replace this value');
  assert.equal(values.CHAT_FIRST_NAME, '');
});
