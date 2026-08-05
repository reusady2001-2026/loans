// Electron main process — wraps the offline Loan Debt Service Hub in a desktop
// window. The whole UI/engine lives in index.html; this just hosts it.
const { app, BrowserWindow, Menu, shell, ipcMain } = require('electron');
const path = require('path');

// Bring a window to the very front of the screen — used when the calendar
// pop-out asks the main window to surface itself after an event click. A page
// calling window.focus() can't raise an OS window; only the main process can.
function bringToFront(win) {
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();                                   // ensure visible + drawn on top
  try { win.moveTop(); } catch (e) {}           // lift above sibling windows (the pop-out)
  win.focus();                                  // give it keyboard focus
  // On Windows a background window won't foreground itself on request; steal:true
  // forces the app to the front, which is exactly the "pop in front of everything"
  // behaviour we want here.
  try { app.focus({ steal: true }); } catch (e) { try { app.focus(); } catch (e2) {} }
}

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
      // The preload adds a tiny window.ldsShell bridge (raise-to-front only).
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));

  // Allow the app's own pop-out windows (e.g. the Maturity & Reset Calendar, opened
  // via window.open('') and written to in-renderer); send external http(s) links to
  // the system browser; deny everything else.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || url === '') {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 1120, height: 840, minWidth: 720, minHeight: 520,
          autoHideMenuBar: true, backgroundColor: '#f6f8f2',
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        },
      };
    }
    if (/^https?:/.test(url)) { shell.openExternal(url); return { action: 'deny' }; }
    return { action: 'deny' };
  });
}

// The renderer (via preload) asks its own window to come to the front — e.g. when
// an event is clicked in the calendar pop-out and the loan is now showing behind it.
ipcMain.on('lds:focus-main', (e) => {
  bringToFront(BrowserWindow.fromWebContents(e.sender));
});

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
