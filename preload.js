const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('env', {
  // We leave this empty because we are using localStorage for settings now.
  // But the file must exist for Electron to start.
});
