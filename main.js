const { app, BrowserWindow } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    kiosk: true, 
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // <-- CRITICAL FIX: Allows connecting to any IP/Domain
      allowRunningInsecureContent: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Load the built React app
  win.loadFile(path.join(__dirname, 'dist', 'index.html'));

  if (app.isPackaged) {
    autoUpdater.checkForUpdatesAndNotify();
  }
}

autoUpdater.on('update-downloaded', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
