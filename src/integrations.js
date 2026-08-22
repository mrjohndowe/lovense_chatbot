import { createHmac, createPublicKey, verify as verifySignature } from 'node:crypto';
import { constantTimeEqual } from './policy.js';

function discordKey(rawHex) {
  const raw = Buffer.from(rawHex, 'hex');
  if (raw.length !== 32) throw new Error('Invalid Discord public key.');
  return createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]), format: 'der', type: 'spki' });
}

export function verifyDiscord(headers, rawBody, publicKey) {
  const signature = headers['x-signature-ed25519'];
  const timestamp = headers['x-signature-timestamp'];
  if (!signature || !timestamp || !publicKey) return false;
  try { return verifySignature(null, Buffer.concat([Buffer.from(timestamp), rawBody]), discordKey(publicKey), Buffer.from(signature, 'hex')); }
  catch { return false; }
}

export function discordMessage(interaction) {
  if (interaction.type === 1) return { ping: true };
  const options = Object.fromEntries((interaction.data?.options || []).map(option => [option.name, option.value]));
  const userId = interaction.member?.user?.id || interaction.user?.id;
  if (interaction.data?.name === 'consent') return { userId, consent: Boolean(options.enabled) };
  if (interaction.data?.name === 'lovense') return { userId, message: String(options.command || '') };
  throw new Error('Unsupported Discord command.');
}

export function verifyTwitch(headers, rawBody, secret, now = Date.now()) {
  const id = headers['twitch-eventsub-message-id'];
  const timestamp = headers['twitch-eventsub-message-timestamp'];
  const signature = headers['twitch-eventsub-message-signature'];
  if (!id || !timestamp || !signature || !secret) return false;
  if (!Number.isFinite(Date.parse(timestamp)) || Math.abs(now - Date.parse(timestamp)) > 10 * 60_000) return false;
  const expected = `sha256=${createHmac('sha256', secret).update(id).update(timestamp).update(rawBody).digest('hex')}`;
  return constantTimeEqual(signature, expected);
}

export function twitchMessage(body) {
  if (body.subscription?.type !== 'channel.chat.message') return null;
  return { userId: body.event?.chatter_user_id, message: body.event?.message?.text || '' };
}

export function parseTipRules(value, maxSeconds = 30) {
  return String(value || '').split(',').map(text => {
    const [tokens, strength, seconds] = text.split(':').map(Number);
    return { tokens, strength, seconds: Math.min(seconds, maxSeconds) };
  }).filter(rule => Number.isInteger(rule.tokens) && rule.tokens > 0 && Number.isInteger(rule.strength) && rule.strength >= 0 && rule.strength <= 20 && Number.isInteger(rule.seconds) && rule.seconds >= 2).sort((a, b) => b.tokens - a.tokens);
}

export function chaturbateMessage(body, rules) {
  if (body.type === 'message') return { userId: body.username, message: String(body.message || '') };
  if (body.type === 'tip') {
    const rule = rules.find(item => Number(body.tokens) >= item.tokens);
    return rule ? { userId: body.username, message: `/vibe ${rule.strength} ${rule.seconds}`, tip: Number(body.tokens) } : null;
  }
  return null;
}
