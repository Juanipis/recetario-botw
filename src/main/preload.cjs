// The only bridge between the page and the system (context isolated, sandboxed).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('recetario', {
  getState: () => ipcRenderer.invoke('state:get'),
  reload: () => ipcRenderer.invoke('save:reload'),
  chooseSave: (kind) => ipcRenderer.invoke('save:choose', kind),
  chooseGameData: () => ipcRenderer.invoke('gamedata:choose'),
  setSettings: (partial) => ipcRenderer.invoke('settings:set', partial),
  reveal: () => ipcRenderer.invoke('save:reveal'),
  onSaveChanged: (cb) => ipcRenderer.on('save:changed', (_e, save) => cb(save)),
  onMenu: (cb) => ipcRenderer.on('menu', (_e, action) => cb(action)),
});
