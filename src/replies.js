function compact(value, maxLength) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('The reply service returned an empty response.');
  return text.length <= maxLength ? text : `${text.slice(0, Math.max(1, maxLength - 1)).trimEnd()}…`;
}

function templateReply(message) {
  const text = String(message || '').trim();
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
  if (config.replyProvider === 'template') return compact(templateReply(message), config.maxReplyChars);
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
