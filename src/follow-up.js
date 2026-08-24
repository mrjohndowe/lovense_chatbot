import { fingerprint } from './remote-chat.js';

export function latestTextMessage(messages = []) {
  return [...messages].reverse().find(item =>
    item?.type === 'text' &&
    item.text &&
    (item.direction === 'incoming' || item.direction === 'outgoing')
  ) || null;
}

export function createFollowUpTracker({ idleMs, now = Date.now } = {}) {
  const waitMs = Math.max(1, Number(idleMs) || 1);
  const states = new Map();

  return {
    inspect(conversation, messages, { eligible = true } = {}) {
      const latest = latestTextMessage(messages);
      if (!conversation || !latest) {
        states.delete(conversation);
        return null;
      }

      const key = fingerprint(conversation, `${latest.index}\0${latest.direction}\0${latest.text}`);
      let state = states.get(conversation);
      if (!state || state.key !== key) {
        state = { key, firstObservedAt: now(), claimed: false };
        states.set(conversation, state);
        return null;
      }

      if (!eligible || latest.direction !== 'incoming' || state.claimed) return null;
      if (now() - state.firstObservedAt < waitMs) return null;

      state.claimed = true;
      return { ...latest, key };
    },

    release(conversation, key) {
      const state = states.get(conversation);
      if (state?.key === key) state.claimed = false;
    }
  };
}
