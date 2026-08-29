import test from 'node:test';
import assert from 'node:assert/strict';
import { configureDesktopUpdater } from '../src/desktop-updater.js';

function fakeUpdater() {
  const listeners = new Map();
  return {
    on(event, listener) { listeners.set(event, listener); },
    emit(event, value) { return listeners.get(event)?.(value); },
    async checkForUpdates() { return { updateInfo: { version: '0.0.2-6' } }; },
    quitAndInstallCalled: false,
    quitAndInstall() { this.quitAndInstallCalled = true; }
  };
}

test('does not contact the update feed from an unpackaged development launch', async () => {
  const updater = fakeUpdater();
  const result = configureDesktopUpdater({ updater, app: { isPackaged: false }, dialog: {}, getWindow: () => null });
  assert.equal(await result.checkForUpdates(), null);
  assert.equal(updater.autoDownload, undefined);
});

test('downloads installed-app updates and allows an explicit restart', async () => {
  const updater = fakeUpdater();
  const dialogs = [];
  const result = configureDesktopUpdater({
    updater,
    app: { isPackaged: true },
    dialog: { showMessageBox: async (...args) => { dialogs.push(args); return { response: 0 }; } },
    getWindow: () => null,
    logger: { info() {}, warn() {} }
  });
  assert.equal(updater.autoDownload, true);
  assert.equal(updater.autoInstallOnAppQuit, true);
  await result.checkForUpdates({ initiatedByUser: true });
  await updater.emit('update-downloaded', { version: '0.0.2-6' });
  assert.equal(dialogs.length, 1);
  assert.equal(updater.quitAndInstallCalled, true);
});
