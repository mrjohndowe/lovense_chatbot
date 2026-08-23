import { WORD_LIBRARY as words } from './word-library.js';

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.codePointAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

function pick(items, seed, offset) {
  return items[((seed + Math.imul(offset + 1, 2654435761)) >>> 0) % items.length];
}

function punctuate(value, mark = '.') {
  const text = String(value || '').trim();
  return /[.!?…]$/.test(text) ? text : text + mark;
}

export function composeLocalSentence({ intent = 'general', message = '', history = [], tone = 'neutral' } = {}) {
  const topic = words.topics[intent] || words.topics.general;
  const prior = history.slice(-4).map(item => item?.content || '').join('\0');
  const turns = history.filter(item => item?.role === 'user').length;
  const seed = hash(String(message).toLowerCase() + '\0' + prior + '\0' + intent + '\0' + turns);
  const openerPool = words.openers[tone] || words.openers.neutral;
  const reactionPool = words.reactions[tone] || words.reactions.neutral;
  const opener = pick(openerPool, seed, 0);
  const reaction = pick(reactionPool, seed, 1);
  const transition = pick(words.transitions, seed, 2);
  const lead = pick(words.questionLeads, seed, 3);
  const subject = pick(topic.subjects, seed, 4);
  const question = pick(topic.questions, seed, 5);
  const closer = pick(words.closers, seed, 6);

  const pattern = seed % 5;
  if (tone === 'dominant') {
    const consent = pick(words.consent, seed, 7);
    return punctuate(opener) + ' ' + punctuate(reaction[0].toUpperCase() + reaction.slice(1)) + ' ' + punctuate(transition + ', ' + consent) + ' ' + punctuate('Then ' + lead + ' ' + question, '?');
  }
  if (tone === 'flirty') {
    const adjective = pick(words.adjectives, seed, 7);
    return punctuate(opener + ', ' + reaction) + ' ' + punctuate('There is something ' + adjective + ' about ' + subject) + ' ' + punctuate(transition + ', ' + lead + ' ' + question, '?');
  }

  const promptLead = pick(['Tell me ', 'Can you tell me ', "I'm curious about "], seed, 11);
  const naturalQuestion = punctuate(promptLead + question, promptLead === 'Can you tell me ' ? '?' : '.');
  const naturalReaction = punctuate(reaction[0].toUpperCase() + reaction.slice(1));
  switch (pattern) {
    case 0: return punctuate(opener) + ' ' + naturalQuestion;
    case 1: return naturalReaction + ' ' + naturalQuestion;
    case 2: return naturalQuestion;
    case 3: return punctuate(opener + ', ' + reaction) + ' ' + naturalQuestion;
    default: return punctuate(opener) + ' ' + punctuate(closer[0].toUpperCase() + closer.slice(1));
  }
}

export const LOCAL_SENTENCE_COMBINATIONS =
  Object.values(words.openers).reduce((sum, list) => sum + list.length, 0) *
  Object.values(words.reactions).reduce((sum, list) => sum + list.length, 0) *
  words.transitions.length *
  words.questionLeads.length *
  Object.values(words.topics).reduce((sum, topic) => sum + topic.questions.length, 0);

