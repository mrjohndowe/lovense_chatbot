import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

function wait(milliseconds) { return new Promise(resolve => setTimeout(resolve, milliseconds)); }
async function debugEndpointReady(debugUrl, fetchImpl) { try { return (await fetchImpl(`${debugUrl}/json/version`, { signal: AbortSignal.timeout(2_000) })).ok; } catch { return false; } }
export function lovenseStartupPowerShellScript(executable, workingDirectory) {
  const encode = value => Buffer.from(value, 'utf8').toString('base64');
  return `$exe=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(executable)}'));$cwd=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${encode(workingDirectory)}'));Start-Process -FilePath $exe -ArgumentList @('--remote-debugging-address=127.0.0.1','--remote-debugging-port=9223') -WorkingDirectory $cwd`;
}
function powerShellStart(executable, workingDirectory) {
  const script = lovenseStartupPowerShellScript(executable, workingDirectory);
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], { windowsHide: true, stdio: 'ignore' });
    child.once('error', error => reject(new Error(`Could not request Lovense Remote startup: ${error.message}`)));
    child.once('close', code => code === 0 ? resolve() : reject(new Error('Lovense Remote startup was cancelled or failed.')));
  });
}
export async function ensureLovenseRemote(config, { fetchImpl = globalThis.fetch, start = powerShellStart, waitImpl = wait } = {}) {
  if (await debugEndpointReady(config.debugUrl, fetchImpl)) return { started: false };
  const executable = String(config.remoteExecutable || '').trim();
  if (!executable || !existsSync(executable)) throw new Error(`Lovense Remote was not found at ${executable || 'the configured executable path'}. Update LOVENSE_REMOTE_EXECUTABLE in config.ini.`);
  await start(executable, path.dirname(executable));
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) { await waitImpl(1_000); if (await debugEndpointReady(config.debugUrl, fetchImpl)) return { started: true }; }
  throw new Error('Lovense Remote did not enable its local debugging connection. Approve the Windows prompt, or close an already-open Lovense Remote instance and try again.');
}
