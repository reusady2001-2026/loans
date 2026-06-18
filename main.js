// Electron main process — wraps the offline Loan Debt Service Hub in a desktop
// window. The whole UI/engine lives in index.html; this just hosts it.
const { app, BrowserWindow, Menu, shell } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 680,
    backgroundColor: '#f1f5f9',
    title: 'Loan Debt Service Hub',
    autoHideMenuBar: true,
    webPreferences: {
      // The renderer only needs the DOM + fetch; keep Node out of it for safety.
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // Open any external link (e.g. doc links) in the system browser, not in-app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // no default menu bar
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
