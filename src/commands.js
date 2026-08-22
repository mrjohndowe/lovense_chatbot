const PRESETS = new Set(['pulse', 'wave', 'fireworks', 'earthquake']);

function wholeNumber(raw, name, min, max) {
  if (!/^\d+$/.test(raw || '')) throw new Error(`${name} must be a whole number from ${min} to ${max}.`);
  const value = Number(raw);
  if (value < min || value > max) throw new Error(`${name} must be from ${min} to ${max}.`);
  return value;
}

export function commandHelp(maxSeconds) {
  return [
    'Commands:',
    `/vibe <0-20> [seconds, 2-${maxSeconds}]`,
    `/pattern <pulse|wave|fireworks|earthquake> [seconds, 2-${maxSeconds}]`,
    '/stop',
    '/status',
    '/help'
  ].join('\n');
}

export function parseCommand(message, maxSeconds = 30) {
  const text = String(message || '').trim();
  if (!text.startsWith('/')) {
    return { type: 'chat', reply: 'I only act on explicit slash commands. Type /help to see them.' };
  }

  const [name, ...args] = text.slice(1).toLowerCase().split(/\s+/);
  if (name === 'help') return { type: 'help' };
  if (name === 'status') return { type: 'status' };
  if (name === 'stop') {
    if (args.length) throw new Error('Usage: /stop');
    return { type: 'device', payload: { command: 'Function', action: 'Stop', timeSec: 0, apiVer: 1 }, summary: 'Stopped all active toy functions.' };
  }
  if (name === 'vibe') {
    if (args.length < 1 || args.length > 2) throw new Error(`Usage: /vibe <0-20> [seconds, 2-${maxSeconds}]`);
    const strength = wholeNumber(args[0], 'Strength', 0, 20);
    const seconds = args[1] ? wholeNumber(args[1], 'Seconds', 2, maxSeconds) : Math.min(10, maxSeconds);
    return { type: 'device', payload: { command: 'Function', action: `Vibrate:${strength}`, timeSec: seconds, apiVer: 1 }, summary: `Vibration ${strength}/20 for ${seconds} seconds.` };
  }
  if (name === 'pattern') {
    if (args.length < 1 || args.length > 2 || !PRESETS.has(args[0])) throw new Error(`Usage: /pattern <pulse|wave|fireworks|earthquake> [seconds, 2-${maxSeconds}]`);
    const seconds = args[1] ? wholeNumber(args[1], 'Seconds', 2, maxSeconds) : Math.min(10, maxSeconds);
    return { type: 'device', payload: { command: 'Preset', name: args[0], timeSec: seconds, apiVer: 1 }, summary: `${args[0]} pattern for ${seconds} seconds.` };
  }
  throw new Error('Unknown command. Type /help to see the allowed commands.');
}
