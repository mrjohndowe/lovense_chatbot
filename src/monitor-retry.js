export function createMonitorRetry({ start, onWaiting = () => {}, delayMs = 5_000, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  if (typeof start !== 'function') throw new Error('A monitor start function is required.');

  let requested = false;
  let starting = false;
  let retryTimer = null;

  const clearRetry = () => {
    if (!retryTimer) return;
    clearTimeoutImpl(retryTimer);
    retryTimer = null;
  };

  const scheduleRetry = () => {
    if (!requested || starting || retryTimer) return;
    retryTimer = setTimeoutImpl(async () => {
      retryTimer = null;
      await activate();
    }, delayMs);
    retryTimer.unref?.();
  };

  const activate = async () => {
    requested = true;
    if (starting) return false;
    starting = true;
    let started = false;
    try {
      await start();
      started = true;
      return true;
    } catch (error) {
      onWaiting(error);
      return false;
    } finally {
      starting = false;
      if (!started) scheduleRetry();
    }
  };

  const pause = () => {
    requested = false;
    clearRetry();
  };

  return {
    activate,
    pause,
    isRequested: () => requested,
    isRetryScheduled: () => Boolean(retryTimer)
  };
}
