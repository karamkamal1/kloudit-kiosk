const { app, BrowserWindow } = require('electron');
const path = require('path');

// Handle creating/removing shortcuts on Windows when installing/uninstalling.

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1024,
    height: 600,
    kiosk: true, 
    backgroundColor: '#121212',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.setMenuBarVisibility(false);

  if (isDev) {
    // In dev mode, we wait for Vite (you might need to run npm run dev in another terminal)
    // For simplicity in this guide, we will build first then run.
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
