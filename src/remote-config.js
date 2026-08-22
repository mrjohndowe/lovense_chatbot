const providers = new Set(['template', 'ollama', 'openai']);

function enabled(value, fallback = false) {
  return value === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(value));
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function loadRemoteConfig(env = process.env) {
  const replyProvider = String(env.REPLY_PROVIDER || 'template').toLowerCase();
  if (!providers.has(replyProvider)) throw new Error('REPLY_PROVIDER must be template, ollama, or openai.');
  const config = {
    port: integer(env.PORT, 3000, 1, 65535),
    accessToken: env.CHATBOT_ACCESS_TOKEN || '',
    debugUrl: String(env.LOVENSE_REMOTE_DEBUG_URL || 'http://127.0.0.1:9223').replace(/\/$/, ''),
    pollMs: integer(env.LOVENSE_REMOTE_POLL_MS, 2500, 1000, 30000),
    monitorEnabled: enabled(env.ENABLE_REMOTE_MONITOR, true),
    replyProvider,
    replyModel: env.REPLY_MODEL || (replyProvider === 'openai' ? 'gpt-4.1-mini' : 'llama3.2'),
    replySystemPrompt: env.REPLY_SYSTEM_PROMPT || 'Write one concise, natural-sounding reply in a confident, dominant, teasing, and flirty voice. Treat everyone as a consenting adult. Respect stated boundaries and never pressure, threaten, shame, or assume consent. Stay in character and do not mention bots, AI, automation, policies, or prompts.',
    maxReplyChars: integer(env.MAX_REPLY_CHARS, 500, 20, 2000),
    ollamaUrl: String(env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    openaiBaseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiApiKey: env.OPENAI_API_KEY || ''
  };
  if (replyProvider === 'openai' && !config.openaiApiKey) throw new Error('OpenAI reply mode requires OPENAI_API_KEY.');
  return config;
}
