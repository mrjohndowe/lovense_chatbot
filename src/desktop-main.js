import { app, BrowserWindow, Menu, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureDesktopConfig } from './desktop-config.js';

const appName = 'Lovense Remote Reply Assistant';
const dashboardHost = '127.0.0.1';
let mainWindow;
let dashboardUrl;

app.setName(appName);

function createWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show();
    mainWindow.focus();
    return;
  }
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 860,
    minHeight: 640,
    title: appName,
    show: false,
    backgroundColor: '#101116',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => { mainWindow = undefined; });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith(`${dashboardUrl}/`)) return { action: 'allow' };
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.loadURL(dashboardUrl);
}

function installMenu(configDirectory) {
  const menu = Menu.buildFromTemplate([
    {
      label: 'File',
      submenu: [
        { label: 'Show dashboard', accelerator: 'Ctrl+Shift+R', click: createWindow },
        { type: 'separator' },
        { role: 'quit', label: 'Exit Reply Assistant' }
      ]
    },
    {
      label: 'Help',
      submenu: [
        { label: 'Open settings folder', click: () => shell.openPath(configDirectory) },
        { label: 'Open dashboard in browser', click: () => shell.openExternal(dashboardUrl) }
      ]
    }
  ]);
  Menu.setApplicationMenu(menu);
}

async function waitForDashboard(url) {
  const deadline = Date.now() + 20_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1_000) });
      if (response.ok) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw new Error(`The local reply dashboard did not start. ${lastError?.message || ''}`.trim());
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => createWindow());
  app.whenReady().then(async () => {
    app.setAppUserModelId('com.mrjohndowe.lovense-remote-reply-assistant');
    const exampleConfigPath = fileURLToPath(new URL('../config.example.ini', import.meta.url));
    const repositoryConfigPath = path.join(process.cwd(), 'config.ini');
    const userDataPath = app.getPath('userData');
    const result = await ensureDesktopConfig({
      userDataPath,
      exampleConfigPath,
      legacyConfigPath: app.isPackaged ? '' : repositoryConfigPath
    });
    process.chdir(userDataPath);

    const { loadRemoteConfig } = await import('./remote-config.js');
    const { port } = loadRemoteConfig();
    dashboardUrl = `http://${dashboardHost}:${port}`;
    installMenu(userDataPath);
    await import('./remote-server.js');
    await waitForDashboard(dashboardUrl);
    createWindow();
    if (result.created) console.log(`Desktop settings ${result.migrated ? 'migrated' : 'created'} at ${result.configPath}`);
  }).catch(error => {
    console.error(`${appName} could not start: ${error.stack || error.message}`);
    app.quit();
  });
  app.on('window-all-closed', () => app.quit());
}
