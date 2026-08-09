// Electron main process — wraps the offline Loan Debt Service Hub in a desktop
// window. The whole UI/engine lives in index.html; this just hosts it.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');

let mainWindow = null;   // the primary window, so background events (updates) can reach its renderer

// ---- Backup / Restore file plumbing ------------------------------------------
// Snapshots live in a managed folder inside the app's per-user data directory:
//   %APPDATA%\Loan Debt Service Hub\backups   (Windows)
function backupsDir(){ return path.join(app.getPath('userData'), 'backups'); }
function ensureBackupsDir(){ const d = backupsDir(); try { fs.mkdirSync(d, { recursive: true }); } catch (e) {} return d; }
function stamp(){ return new Date().toISOString().replace(/[:.]/g, '-'); }   // 2026-08-05T14-23-05-123Z
// Keep only the newest `keep` files that start with `prefix`.
function rotate(prefix, keep){
  try {
    const d = backupsDir();
    fs.readdirSync(d)
      .filter(f => f.startsWith(prefix) && f.endsWith('.json'))
      .map(f => ({ f, t: fs.statSync(path.join(d, f)).mtimeMs }))
      .sort((a, b) => b.t - a.t)
      .slice(keep)
      .forEach(x => { try { fs.unlinkSync(path.join(d, x.f)); } catch (e) {} });
  } catch (e) {}
}

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
    titleBarStyle: 'hidden',   // the app draws its own title bar (top strip + window controls)
    webPreferences: {
      // The renderer only needs the DOM + fetch; keep Node out of it for safety.
      // The preload adds a tiny window.ldsShell bridge (raise-to-front only).
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });

  mainWindow = win;
  win.on('closed', () => { if (mainWindow === win) mainWindow = null; });
  // Keep the custom title bar's maximize/restore icon in sync when the state
  // changes without a button click (double-click the bar, aero-snap, etc.).
  const sendWinState = () => { try { win.webContents.send('lds:win-state', { maximized: win.isMaximized() }); } catch (e) {} };
  win.on('maximize', sendWinState);
  win.on('unmaximize', sendWinState);

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

// Custom title-bar window controls (the native caption buttons are hidden).
ipcMain.on('lds:win-minimize', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.minimize(); });
ipcMain.on('lds:win-maximize-toggle', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) { w.isMaximized() ? w.unmaximize() : w.maximize(); } });
ipcMain.on('lds:win-close', (e) => { const w = BrowserWindow.fromWebContents(e.sender); if (w) w.close(); });
ipcMain.handle('lds:win-is-maximized', (e) => { const w = BrowserWindow.fromWebContents(e.sender); return !!(w && w.isMaximized()); });

// Manual backup — native Save dialog, writes wherever the user chooses.
ipcMain.handle('lds:backup-save', async (e, { json, defaultName }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Back up portfolio',
    defaultPath: path.join(app.getPath('documents'), defaultName || 'Loan-Portfolio-backup.json'),
    filters: [{ name: 'Loan Debt Service Hub backup', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try { fs.writeFileSync(res.filePath, json, 'utf8'); return { ok: true, path: res.filePath, name: path.basename(res.filePath) }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// Manual restore — native Open dialog, returns the file's contents to the renderer.
ipcMain.handle('lds:backup-open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showOpenDialog(win, {
    title: 'Restore portfolio from backup',
    properties: ['openFile'],
    filters: [{ name: 'Loan Debt Service Hub backup', extensions: ['json'] }, { name: 'All files', extensions: ['*'] }],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { canceled: true };
  try { const p = res.filePaths[0]; return { ok: true, name: path.basename(p), content: fs.readFileSync(p, 'utf8') }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// Silent snapshot into the managed backups folder. kind: 'auto' (routine, on change)
// or 'before-restore' (the safety copy taken before a restore replaces the book).
// The two kinds rotate separately, so a restore is always reversible.
ipcMain.handle('lds:autobackup-write', async (e, { json, kind }) => {
  const prefix = kind === 'before-restore' ? 'before-restore'
               : kind === 'before-import' ? 'before-import'
               : 'autobackup';
  try {
    const d = ensureBackupsDir();
    const file = path.join(d, prefix + '-' + stamp() + '.json');
    fs.writeFileSync(file, json, 'utf8');
    rotate('autobackup', 20);
    rotate('before-restore', 10);
    rotate('before-import', 10);
    return { ok: true, path: file };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// List snapshots in the backups folder (newest first) with light header info.
ipcMain.handle('lds:autobackup-list', async () => {
  try {
    const d = backupsDir();
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => {
      const full = path.join(d, f); let loanCount = null, exportedAt = null;
      try { const j = JSON.parse(fs.readFileSync(full, 'utf8')); loanCount = (j.loanCount != null) ? j.loanCount : (Array.isArray(j.loans) ? j.loans.length : null); exportedAt = j.exportedAt || null; } catch (e) {}
      const st = fs.statSync(full);
      const kind = f.startsWith('before-restore') ? 'before-restore' : f.startsWith('before-import') ? 'before-import' : 'auto';
      return { name: f, kind, mtime: st.mtimeMs, loanCount, exportedAt };
    }).sort((a, b) => b.mtime - a.mtime);
  } catch (e) { return []; }
});

// Read one snapshot from the backups folder by name (path-traversal guarded).
ipcMain.handle('lds:autobackup-read', async (e, { name }) => {
  try {
    if (!name || name.indexOf('..') >= 0 || path.isAbsolute(name)) return { ok: false, error: 'bad name' };
    const full = path.join(backupsDir(), path.basename(name));
    return { ok: true, content: fs.readFileSync(full, 'utf8') };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// Reveal the backups folder in the OS file manager.
ipcMain.handle('lds:backups-open-folder', async () => {
  try { const d = ensureBackupsDir(); await shell.openPath(d); return { ok: true, path: d }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// Save arbitrary binary (base64) via a native Save dialog — used for the Excel export.
ipcMain.handle('lds:file-save-binary', async (e, { base64, defaultName, ext, label }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Export',
    defaultPath: path.join(app.getPath('documents'), defaultName || 'export.' + (ext || 'xlsx')),
    filters: [{ name: label || 'File', extensions: [ext || 'xlsx'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try { fs.writeFileSync(res.filePath, Buffer.from(base64, 'base64')); return { ok: true, path: res.filePath, name: path.basename(res.filePath) }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// ---- Display scale (window zoom) --------------------------------------------
// The Settings panel in the renderer drives the app scale. We use Chromium's
// native zoom factor so the entire UI scales crisply and reflows at any size,
// rather than a CSS transform. Range is clamped to 25%–300% (0.25–3.0). The
// choice itself is remembered by the renderer (localStorage) and re-applied on
// the next launch.
const ZOOM_MIN = 0.5, ZOOM_MAX = 2.0;
function clampZoom(z) { z = Number(z); if (!isFinite(z)) z = 1; return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)); }
ipcMain.handle('lds:set-zoom', (e, factor) => {
  const z = clampZoom(factor);
  try { e.sender.setZoomFactor(z); } catch (err) {}
  return z;
});
ipcMain.handle('lds:get-zoom', (e) => {
  try { return e.sender.getZoomFactor(); } catch (err) { return 1; }
});

// ---- Auto-update (electron-updater + GitHub Releases) ------------------------
// Checks the repo's Releases for a newer version, downloads it in the background,
// and installs on restart. IMPORTANT: an update only replaces the program files
// (in %LOCALAPPDATA%\Programs\...). The user's loans (localStorage) and the
// backups folder live under userData (%APPDATA%\Loan Debt Service Hub\) and are
// never touched — data and every snapshot survive across updates and versions.
function sendUpdate(payload) {
  try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lds:update-status', payload); } catch (e) {}
}
function setupAutoUpdates() {
  autoUpdater.autoDownload = true;             // quietly fetch the new version once found
  autoUpdater.autoInstallOnAppQuit = true;     // if the user doesn't restart now, install on next quit
  autoUpdater.on('checking-for-update', ()  => sendUpdate({ state: 'checking' }));
  autoUpdater.on('update-available',    (i) => sendUpdate({ state: 'available', version: i && i.version }));
  autoUpdater.on('update-not-available',(i) => sendUpdate({ state: 'current', version: (i && i.version) || app.getVersion() }));
  autoUpdater.on('download-progress',   (p) => sendUpdate({ state: 'downloading', percent: Math.round((p && p.percent) || 0) }));
  autoUpdater.on('update-downloaded',   (i) => sendUpdate({ state: 'ready', version: i && i.version }));
  autoUpdater.on('error',               (e) => sendUpdate({ state: 'error', message: String((e && e.message) || e).slice(0, 200) }));
  // First check a few seconds after launch — only in the packaged app (dev has no
  // update feed). Offline failures surface as an 'error' event and are ignored.
  if (app.isPackaged) setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}); }, 3000);
}
ipcMain.handle('lds:app-version', () => app.getVersion());
ipcMain.on('lds:update-check', () => {
  if (!app.isPackaged) { sendUpdate({ state: 'current', version: app.getVersion() }); return; }
  autoUpdater.checkForUpdates().catch((e) => sendUpdate({ state: 'error', message: String((e && e.message) || e).slice(0, 200) }));
});
ipcMain.on('lds:update-install', () => { try { autoUpdater.quitAndInstall(); } catch (e) {} });

app.whenReady().then(() => {
  Menu.setApplicationMenu(null); // no default menu bar
  createWindow();
  setupAutoUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
