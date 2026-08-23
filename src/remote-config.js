import { loadPersonalConfig } from './ini-config.js';

const providers = new Set(['template', 'ollama', 'openai']);

function enabled(value, fallback = false) {
  return value === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(value));
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

function decimal(value, fallback, min, max) {
  const parsed = Number.parseFloat(value ?? '');
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function loadRemoteConfig(env = loadPersonalConfig()) {
  const replyProvider = String(env.REPLY_PROVIDER || 'template').toLowerCase();
  if (!providers.has(replyProvider)) throw new Error('REPLY_PROVIDER must be template, ollama, or openai.');
  const config = {
    port: integer(env.PORT, 3000, 1, 65535),
    accessToken: env.CHATBOT_ACCESS_TOKEN || '',
    debugUrl: String(env.LOVENSE_REMOTE_DEBUG_URL || 'http://127.0.0.1:9223').replace(/\/$/, ''),
    pollMs: integer(env.LOVENSE_REMOTE_POLL_MS, 2500, 1000, 30000),
    monitorEnabled: enabled(env.ENABLE_REMOTE_MONITOR, true),
    autoSend: enabled(env.ENABLE_AUTO_SEND, false),
    autoSendMinDelayMs: integer(env.AUTO_SEND_MIN_DELAY_SECONDS, 8, 2, 300) * 1000,
    autoSendMaxDelayMs: integer(env.AUTO_SEND_MAX_DELAY_SECONDS, 25, 2, 600) * 1000,
    autoSendTypingMsPerChar: integer(env.AUTO_SEND_TYPING_MS_PER_CHAR, 45, 10, 250),
    toyRandomMinLevel: decimal(env.TOY_RANDOM_MIN_LEVEL, 0, 0, 5),
    toyRandomMaxLevel: decimal(env.TOY_RANDOM_MAX_LEVEL, 2, 0, 5),
    toyRandomMinIntervalMs: integer(env.TOY_RANDOM_MIN_INTERVAL_SECONDS, 3, 1, 300) * 1000,
    toyRandomMaxIntervalMs: integer(env.TOY_RANDOM_MAX_INTERVAL_SECONDS, 8, 1, 600) * 1000,
    replyProvider,
    replyModel: env.REPLY_MODEL || (replyProvider === 'openai' ? 'gpt-4.1-mini' : 'llama3.2'),
    replySystemPrompt: env.REPLY_SYSTEM_PROMPT || 'Write one concise, natural reply that continues a genuine conversation. Match the other person’s tone, ask a relevant follow-up question when natural, and use confident, dominant, teasing, or flirty language only when the conversation invites it. Treat everyone as a consenting adult. Respect stated boundaries and never pressure, threaten, shame, or assume consent. Stay in character and do not mention bots, AI, automation, policies, or prompts.',
    maxReplyChars: integer(env.MAX_REPLY_CHARS, 500, 20, 2000),
    conversationMemoryMessages: integer(env.CONVERSATION_MEMORY_MESSAGES, 24, 2, 100),
    sendMemoryToOpenAI: enabled(env.SEND_MEMORY_TO_OPENAI, false),
    ollamaUrl: String(env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    openaiBaseUrl: String(env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
    openaiApiKey: env.OPENAI_API_KEY || '',
    chatUsername: String(env.CHAT_USERNAME || '').trim(),
    chatDisplayName: String(env.CHAT_DISPLAY_NAME || '').trim(),
    chatFirstName: String(env.CHAT_FIRST_NAME || '').trim(),
    chatLastName: String(env.CHAT_LAST_NAME || '').trim(),
    chatDateOfBirth: String(env.CHAT_DATE_OF_BIRTH || '').trim(),
    chatPlaceOfBirth: String(env.CHAT_PLACE_OF_BIRTH || '').trim(),
    chatChildren: String(env.CHAT_CHILDREN || '').trim(),
    chatAge: String(env.CHAT_AGE || '').trim(),
    chatPronouns: String(env.CHAT_PRONOUNS || '').trim(),
    chatLocation: String(env.CHAT_LOCATION || '').trim(),
    chatOccupation: String(env.CHAT_OCCUPATION || '').trim(),
    chatRelationshipStatus: String(env.CHAT_RELATIONSHIP_STATUS || '').trim(),
    chatInterests: String(env.CHAT_INTERESTS || '').trim()
  };
  config.autoSendMaxDelayMs = Math.max(config.autoSendMinDelayMs, config.autoSendMaxDelayMs);
  config.toyRandomMaxLevel = Math.max(config.toyRandomMinLevel, config.toyRandomMaxLevel);
  config.toyRandomMaxIntervalMs = Math.max(config.toyRandomMinIntervalMs, config.toyRandomMaxIntervalMs);
  if (config.chatAge && (!/^\d{1,3}$/.test(config.chatAge) || Number(config.chatAge) < 18 || Number(config.chatAge) > 120)) {
    throw new Error('CHAT_AGE must be an adult age from 18 to 120 when provided.');
  }
  if (config.chatDateOfBirth) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(config.chatDateOfBirth);
    const month = Number(match?.[1]);
    const day = Number(match?.[2]);
    const year = Number(match?.[3]);
    const date = match ? new Date(Date.UTC(year, month - 1, day)) : null;
    const valid = date && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
    if (!valid) throw new Error('CHAT_DATE_OF_BIRTH must be a valid date in MM/DD/YYYY format when provided.');
  }
  if (replyProvider === 'openai' && !config.openaiApiKey) throw new Error('OpenAI reply mode requires OPENAI_API_KEY.');
  return config;
}







