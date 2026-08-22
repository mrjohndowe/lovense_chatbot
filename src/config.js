const modes = new Set(['mock', 'server', 'lan']);

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
    maxCommandSeconds: integer(env.MAX_COMMAND_SECONDS, 30, 2, 300)
  };

  if (mode === 'server' && (!config.developerToken || !config.userId)) {
    throw new Error('Server mode requires LOVENSE_DEVELOPER_TOKEN and LOVENSE_USER_ID.');
  }
  if (mode === 'lan' && !/^https:\/\//i.test(config.lanUrl)) {
    throw new Error('LAN mode requires an HTTPS LOVENSE_LAN_URL.');
  }
  return config;
}
