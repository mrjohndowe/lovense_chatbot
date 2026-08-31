const NONSTANDARD_WHITESPACE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/gu;
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}]/u;
const WORD = /\p{L}+(?:['’\-]\p{L}+)*/gu;
const WORD_TOKEN = /^\p{L}+(?:['’\-]\p{L}+)*$/u;
const COMMON_WORDS = new Set(`
  a about after again all also am an and any are as at be because been before being but by can could do does doing
  for from get give go good got had has have he her here him his how i if in is it just know like look me mean more
  my no not now of oh on one or out people really say see she so some something that the their them then there these
  they think this time to too up us was we well what when where which who will with would yeah you your
  awesome beautiful better call calm care caring chance close cool day definitely enjoy even excited feel find first
  friend funny glad great happy hear help hope interesting kind little love make maybe moment much nice nothing only
  pretty right same sense sounds still sure talk thank thanks thing today tomorrow understand want way went work yes yet
`.trim().split(/\s+/));

function normalize(value) {
  return String(value || '').normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

export function inspectReplyQuality(value) {
  const raw = String(value || '');
  const nonstandardWhitespaceCount = (raw.match(NONSTANDARD_WHITESPACE) || []).length;
  if (INVISIBLE_OR_CONTROL.test(raw)) {
    return { ok: false, error: 'The reply contains invisible or control characters.' };
  }
  if (nonstandardWhitespaceCount >= 3) {
    return { ok: false, error: 'The reply contains excessive non-standard spacing.' };
  }

  const reply = normalize(raw);
  if (!reply) return { ok: false, error: 'The reply is empty.' };
  if (reply.length > 2_000) return { ok: false, error: 'The reply is too long to verify safely.' };

  const malformed = reply.split(/\s+/u).filter(token => {
    const core = token.replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '');
    return core && /\p{L}/u.test(core) && !WORD_TOKEN.test(core);
  });
  if (malformed.length) {
    return { ok: false, error: 'The reply contains broken words or punctuation inside a word.' };
  }

  const words = reply.match(WORD) || [];
  const substantialWords = words.filter(word => word.length >= 4);
  const unknownWords = substantialWords.filter(word => !COMMON_WORDS.has(word.toLocaleLowerCase('en-US')) && word === word.toLocaleLowerCase('en-US'));
  if (substantialWords.length >= 8 && unknownWords.length >= 6 && unknownWords.length / substantialWords.length >= 0.7) {
    return { ok: false, error: 'The reply has too many unreadable word fragments.' };
  }

  return { ok: true, reply };
}

export function requireReadableReply(value) {
  const result = inspectReplyQuality(value);
  if (!result.ok) throw new Error(`Reply was not sent because the readability check failed: ${result.error}`);
  return result.reply;
}
