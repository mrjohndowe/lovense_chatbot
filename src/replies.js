function compact(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('The reply service returned an empty response.');
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function unknownFact(tease) {
  return `${tease} You’ll have to earn that answer 😉`;
}

function templateReply(config, message) {
  const text = String(message || '').trim();
  const fullName = [config.chatFirstName, config.chatLastName].filter(Boolean).join(' ');
  const name = config.chatDisplayName || fullName || config.chatUsername;
  if (/\b(what(?:’|'| i)s your name|who are you|what should i call you)\b/i.test(text)) return name ? `You can call me ${name}. Say it nicely for me 😉` : unknownFact('Curious about me already?');
  if (/\b(what(?:’|'| i)s your first name)\b/i.test(text)) return config.chatFirstName ? `My first name is ${config.chatFirstName}. Remember it 😉` : unknownFact('You want my first name?');
  if (/\b(what(?:’|'| i)s your last name|what(?:’|'| i)s your surname)\b/i.test(text)) return config.chatLastName ? `My last name is ${config.chatLastName}. Don’t wear it out 😉` : unknownFact('Going for my full identity already?');
  if (/\b(when is your birthday|what(?:’|'| i)s your birthday|what(?:’|'| i)s your date of birth|when were you born)\b/i.test(text)) return config.chatDateOfBirth ? `My birthday is ${config.chatDateOfBirth}. You can remember that for me 😉` : unknownFact('Planning ahead for my birthday?');
  if (/\b(where were you born|what(?:’|'| i)s your place of birth)\b/i.test(text)) return config.chatPlaceOfBirth ? `I was born in ${config.chatPlaceOfBirth}. Now you know a little more about me 😉` : unknownFact('Digging into my origin story?');
  if (/\b(do you have (?:any )?(?:children|kids)|how many (?:children|kids) do you have|are you a (?:mom|mother|dad|father|parent))\b/i.test(text)) return config.chatChildren ? `${config.chatChildren}. That’s all you need to know about that for now 😉` : unknownFact('That’s a personal one.');
  if (/\b(how old are you|what(?:’|'| i)s your age)\b/i.test(text)) return config.chatAge ? `I’m ${config.chatAge}. Old enough to know exactly what I want 😉` : unknownFact('That’s a bold question.');
  if (/\b(where are you from|where do you live|where are you located)\b/i.test(text)) return config.chatLocation ? `I’m in ${config.chatLocation}. Close enough to keep your attention 😉` : unknownFact('Trying to find me?');
  if (/\b(what do you do|what(?:’|'| i)s your job|where do you work)\b/i.test(text)) return config.chatOccupation ? `I work as ${config.chatOccupation}. But right now, you have my attention 😉` : unknownFact('You want to know how I spend my days?');
  if (/\b(what are you into|what do you like|what are your interests|what are your hobbies)\b/i.test(text)) return config.chatInterests ? `I’m into ${config.chatInterests}. Now tell me what gets your attention 😉` : unknownFact('Mmm, eager to learn what I like?');
  if (/\b(are you single|relationship status|do you have a partner)\b/i.test(text)) return config.chatRelationshipStatus ? `I’m ${config.chatRelationshipStatus}. Does that satisfy your curiosity? 😉` : unknownFact('Getting personal already?');
  if (/\b(what are your pronouns|which pronouns do you use)\b/i.test(text)) return config.chatPronouns ? `I use ${config.chatPronouns}. Remember them for me 😉` : 'Ask me directly which pronouns I use, and I’ll tell you.';
  if (/^(hi|hey|hello|hiya)\b/i.test(text)) return "Hey, you. I was wondering when you'd come looking for my attention 😉";
  if (/how are you|how(?:’|'| a)?re you/i.test(text)) return "Better now that you're here. Tell me what you've been up to 😉";
  if (/\?$/.test(text)) return 'Maybe. Ask me nicely, and I might give you the answer you want 😉';
  return 'Mmm, I like the way you’re thinking. Keep talking 😉';
}

async function requestJson(url, options, fetchImpl) {
  const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(30_000) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error?.message || body.error || `Reply service returned HTTP ${response.status}.`);
  return body;
}

export async function generateReply(config, message, fetchImpl = globalThis.fetch) {
  if (config.replyProvider === 'template') return compact(templateReply(config, message), config.maxReplyChars);
  const messages = [
    { role: 'system', content: config.replySystemPrompt },
    { role: 'user', content: String(message || '') }
  ];
  if (config.replyProvider === 'ollama') {
    const body = await requestJson(`${config.ollamaUrl}/api/chat`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.replyModel, messages, stream: false })
    }, fetchImpl);
    return compact(body.message?.content, config.maxReplyChars);
  }
  const body = await requestJson(`${config.openaiBaseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${config.openaiApiKey}` },
    body: JSON.stringify({ model: config.replyModel, messages, temperature: 0.7 })
  }, fetchImpl);
  return compact(body.choices?.[0]?.message?.content, config.maxReplyChars);
}
