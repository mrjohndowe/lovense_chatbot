const modes = new Set(['mock', 'server', 'lan']);

function enabled(value, fallback = false) {
  return value === undefined ? fallback : /^(1|true|yes|on)$/i.test(String(value));
}

function integer(value, fallback, min, max) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

export function loadConfig(env = process.env) {
  const mode = String(env.LOVENSE_MODE || 'mock').toLowerCase();
  if (!modes.has(mode)) throw new Error('LOVENSE_MODE must be mock, server, or lan.');

  const config = {
    mode,
    port: integer(env.PORT, 3000, 1, 65535),
    accessToken: env.CHATBOT_ACCESS_TOKEN || '',
    developerToken: env.LOVENSE_DEVELOPER_TOKEN || '',
    userId: env.LOVENSE_USER_ID || '',
    lanUrl: String(env.LOVENSE_LAN_URL || '').replace(/\/$/, ''),
    toyId: env.LOVENSE_TOY_ID || '',
    platformName: env.LOVENSE_PLATFORM_NAME || 'Lovense Chatbot',
    maxCommandSeconds: integer(env.MAX_COMMAND_SECONDS, 30, 2, 300),
    webEnabled: enabled(env.ENABLE_WEB_CHAT, true),
    pairingEnabled: enabled(env.ENABLE_LOVENSE_PAIRING),
    discordEnabled: enabled(env.ENABLE_DISCORD),
    twitchEnabled: enabled(env.ENABLE_TWITCH),
    chaturbateEnabled: enabled(env.ENABLE_CHATURBATE),
    pairingUserId: env.LOVENSE_PAIRING_USER_ID || 'owner',
    pairingUserName: env.LOVENSE_PAIRING_USER_NAME || 'Owner',
    pairingUserToken: env.LOVENSE_PAIRING_USER_TOKEN || '',
    discordPublicKey: env.DISCORD_PUBLIC_KEY || '',
    discordAllowedUsers: env.DISCORD_ALLOWED_USER_IDS || '',
    twitchSecret: env.TWITCH_EVENTSUB_SECRET || '',
    twitchAllowedUsers: env.TWITCH_ALLOWED_USER_IDS || '',
    chaturbateSecret: env.CHATURBATE_WEBHOOK_SECRET || '',
    chaturbateAllowedUsers: env.CHATURBATE_ALLOWED_USERS || '',
    chaturbateTipRules: env.CHATURBATE_TIP_RULES || '25:5:5,50:10:8,100:15:10',
    auditLimit: integer(env.AUDIT_LIMIT, 200, 20, 2000),
    dedupeMinutes: integer(env.EVENT_DEDUPE_MINUTES, 10, 1, 60)
  };

  if (mode === 'server' && (!config.developerToken || !config.userId)) {
    throw new Error('Server mode requires LOVENSE_DEVELOPER_TOKEN and LOVENSE_USER_ID.');
  }
  if (mode === 'lan' && !config.pairingEnabled && !/^https:\/\//i.test(config.lanUrl)) {
    throw new Error('LAN mode requires an HTTPS LOVENSE_LAN_URL or enabled QR pairing.');
  }
  if (config.pairingEnabled && (!config.developerToken || !config.pairingUserToken)) {
    throw new Error('QR pairing requires LOVENSE_DEVELOPER_TOKEN and LOVENSE_PAIRING_USER_TOKEN.');
  }
  if (config.discordEnabled && !/^[a-f0-9]{64}$/i.test(config.discordPublicKey)) {
    throw new Error('Discord requires a 64-character DISCORD_PUBLIC_KEY.');
  }
  if (config.twitchEnabled && config.twitchSecret.length < 10) {
    throw new Error('Twitch requires a strong TWITCH_EVENTSUB_SECRET.');
  }
  if (config.chaturbateEnabled && config.chaturbateSecret.length < 16) {
    throw new Error('Chaturbate requires a strong CHATURBATE_WEBHOOK_SECRET.');
  }
  return config;
}
