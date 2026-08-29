function normalizedOrigin(debugUrl) {
  return String(debugUrl || '').replace(/\/$/, '');
}

/** Finds the browser DevTools page published by the local Lovense Remote app. */
export async function lovenseDevtoolsUrl(debugUrl, { fetchImpl = globalThis.fetch } = {}) {
  const origin = normalizedOrigin(debugUrl);
  const response = await fetchImpl(`${origin}/json/list`, { signal: AbortSignal.timeout(5_000) });
  if (!response.ok) throw new Error(`Lovense DevTools returned HTTP ${response.status}.`);
  const targets = await response.json();
  const target = targets.find(item => item?.type === 'page' && item?.title === 'Lovense Remote');
  if (!target) throw new Error('The Lovense Remote debugging target is unavailable.');
  const frontendPath = String(target.devtoolsFrontendUrl || '');
  if (!frontendPath) throw new Error('Lovense Remote did not publish a DevTools inspector URL.');
  return frontendPath.startsWith('/') ? `${origin}${frontendPath}` : frontendPath;
}

export async function waitForLovenseDevtoolsUrl(debugUrl, { fetchImpl = globalThis.fetch, waitImpl = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)), timeoutMs = 35_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      return await lovenseDevtoolsUrl(debugUrl, { fetchImpl });
    } catch (error) {
      lastError = error;
      await waitImpl(1_000);
    }
  }
  throw lastError || new Error('Lovense Remote Developer Tools did not become available.');
}
