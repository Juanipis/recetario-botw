import { app, BrowserWindow, dialog, ipcMain, Menu, net, protocol, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readSaveLocation, listSlots } from './savefile.js';
import { Settings } from './settings.js';
import { Translator, pickLanguage } from '../shared/i18n.js';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageInfo = JSON.parse(fs.readFileSync(path.join(SRC, '..', 'package.json'), 'utf8'));
const isMac = process.platform === 'darwin';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let settings;
let win;
const tr = new Translator();
const LOCALES_DIR = path.join(SRC, 'locales');

function loadLocales() {
  for (const file of fs.readdirSync(LOCALES_DIR).filter((f) => f.endsWith('.json'))) {
    tr.locales[path.basename(file, '.json')] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf8'));
  }
}
let watchTimer;
let lastStamp = '';

function gameDataDir() {
  if (settings.values.gameDataPath) return settings.values.gameDataPath;
  return app.isPackaged ? path.join(process.resourcesPath, 'gamedata') : path.join(SRC, '..', 'gamedata');
}

// app://bundle/<area>/<file>: renderer and shared code, game icons and data
function resolveAppUrl(url) {
  const { pathname } = new URL(url);
  const [, area, ...rest] = decodeURIComponent(pathname).split('/');
  const roots = {
    renderer: path.join(SRC, 'renderer'),
    shared: path.join(SRC, 'shared'),
    locales: LOCALES_DIR,
    icons: path.join(gameDataDir(), 'icons'),
    gamedata: gameDataDir(),
  };
  const root = roots[area];
  if (!root) return null;
  const file = path.resolve(root, ...rest);
  return file.startsWith(root + path.sep) ? file : null;
}

function readSave() {
  const { savePath, slot } = settings.values;
  if (!savePath) return { error: 'noPath' };
  try {
    return readSaveLocation(savePath, slot);
  } catch (e) {
    return { error: 'read', code: e.code && e.vars ? e.code : 'unknown', vars: e.vars || { message: e.message } };
  }
}

function saveStamp() {
  const slots = listSlots(settings.values.savePath);
  return slots.map((s) => `${s.label}:${s.mtime}`).join('|');
}

function restartWatcher() {
  clearInterval(watchTimer);
  lastStamp = saveStamp();
  if (!settings.values.autoRefresh) return;
  const every = Math.max(1, Number(settings.values.pollSeconds) || 3) * 1000;
  watchTimer = setInterval(() => {
    const stamp = saveStamp();
    if (stamp !== lastStamp) {
      lastStamp = stamp;
      win?.webContents.send('save:changed', readSave());
    }
  }, every);
}

function buildMenu() {
  const send = (action) => () => win?.webContents.send('menu', action);
  const template = [
    ...(isMac ? [{ role: 'appMenu' }] : []),
    {
      label: tr.t('menu.save'),
      submenu: [
        { label: tr.t('menu.reload'), accelerator: 'CmdOrCtrl+R', click: send('reload') },
        { label: tr.t('menu.choose'), accelerator: 'CmdOrCtrl+O', click: send('choose') },
        { label: tr.t('menu.settings'), accelerator: 'CmdOrCtrl+,', click: send('settings') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' },
      ],
    },
    { role: 'editMenu' },
    {
      label: tr.t('menu.view'),
      submenu: [{ role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'resetZoom' }, { type: 'separator' },
        { role: 'togglefullscreen' }, { role: 'toggleDevTools' }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1340,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#0d1b1e',
    title: 'Recetario BotW',
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(SRC, 'main', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
    },
  });
  win.loadURL('app://bundle/renderer/index.html');
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // RECETARIO_SCREENSHOT=out.png [RECETARIO_DEMO='{"open":"..."}']: renders, saves a capture and quits
  const shot = process.env.RECETARIO_SCREENSHOT;
  if (shot) {
    win.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const image = await win.webContents.capturePage();
        fs.writeFileSync(shot, image.toPNG());
        app.quit();
      }, Number(process.env.RECETARIO_SCREENSHOT_DELAY || 2500));
    });
  }
}

ipcMain.handle('state:get', () => {
  const dataFile = path.join(gameDataDir(), 'data.json');
  return {
    settings: settings.values,
    hasGameData: fs.existsSync(dataFile),
    gameDataDir: gameDataDir(),
    save: readSave(),
    platform: process.platform,
    locales: Object.keys(tr.locales),
    homepage: packageInfo.homepage || '',
    demo: process.env.RECETARIO_DEMO ? JSON.parse(process.env.RECETARIO_DEMO) : null,
  };
});
ipcMain.handle('save:reload', () => {
  lastStamp = saveStamp();
  return readSave();
});
ipcMain.handle('save:choose', async (_e, kind) => {
  const result = await dialog.showOpenDialog(win, {
    title: tr.t('dialog.saveTitle'),
    message: kind === 'file' ? tr.t('dialog.saveFile') : tr.t('dialog.saveFolder'),
    defaultPath: settings.values.savePath || undefined,
    properties: kind === 'file' ? ['openFile'] : ['openDirectory'],
    filters: kind === 'file' ? [{ name: tr.t('dialog.saveFilter'), extensions: ['sav'] }] : undefined,
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return result.filePaths[0];
});
ipcMain.handle('gamedata:choose', async () => {
  const result = await dialog.showOpenDialog(win, { title: tr.t('dialog.gameDataTitle'), properties: ['openDirectory'] });
  return result.canceled ? null : result.filePaths[0];
});
ipcMain.handle('settings:set', (_e, partial) => {
  const values = settings.update(partial);
  if ('uiLanguage' in partial) {
    tr.setLanguage(values.uiLanguage);
    buildMenu();
  }
  restartWatcher();
  return values;
});
ipcMain.handle('save:reveal', () => {
  const save = readSave();
  if (save.file) shell.showItemInFolder(save.file);
});

app.whenReady().then(() => {
  settings = new Settings(app.getPath('userData'));
  loadLocales();
  if (!settings.values.uiLanguage) settings.update({ uiLanguage: pickLanguage(app.getLocale(), Object.keys(tr.locales)) });
  tr.setLanguage(settings.values.uiLanguage);
  protocol.handle('app', (request) => {
    const file = resolveAppUrl(request.url);
    if (!file || !fs.existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
  buildMenu();
  createWindow();
  restartWatcher();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (!isMac) app.quit();
});
