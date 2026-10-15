const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1520,
    height: 940,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#060911',
    title: 'Zook Astro — Galactic Sector & Star System Simulator',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // In development, load the Vite dev server if ELECTRON_START_URL is set; otherwise load built dist/index.html
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }

  // Open external http/https links in the user's default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
