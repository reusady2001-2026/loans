// Electron main process — wraps the offline Loan Debt Service Hub in a desktop
// window. The whole UI/engine lives in index.html; this just hosts it.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog, net, protocol } = require('electron');
// 2.9.7 (#60) — the app is served from an internal address, lds://app/, instead of a file: the second OCR engine
// (PaddleOCR) needs a real web address to load its models and engine. Everything is still read from the app's own
// files on disk; nothing leaves the computer.
protocol.registerSchemesAsPrivileged([{ scheme: 'lds', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } }]);
const APP_URL = 'lds://app/index.html';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { autoUpdater } = require('electron-updater');
const ai = require('./ai');   // AI bridge: Claude Code CLI (subscription) or Anthropic API

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

const LDS_MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.wasm': 'application/wasm', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.tar': 'application/x-tar', '.traineddata': 'application/octet-stream', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
function registerAppProtocol() {
  protocol.handle('lds', async (req) => {
    try {
      const u = new URL(req.url);
      let rel = decodeURIComponent(u.pathname).replace(/^\/+/, ''); if (!rel) rel = 'index.html';
      const full = path.normalize(path.join(__dirname, rel));
      if (full !== __dirname && !full.startsWith(__dirname + path.sep)) return new Response('forbidden', { status: 403 });   // only the app's own files
      const buf = await fs.promises.readFile(full);
      return new Response(buf, { status: 200, headers: { 'content-type': LDS_MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'access-control-allow-origin': '*', 'cache-control': 'no-cache' } });
    } catch (e) { return new Response('not found', { status: 404 }); }
  });
}
// The settings saved at the old address (file://) are copied once to the new one: the first window opens the old
// address for a moment, reads them, then loads the app; the page copies them in before anything reads them.
let legacyStorage = null;
function storageMigrated() { try { return fs.existsSync(path.join(app.getPath('userData'), 'storage-origin.json')); } catch (e) { return false; } }
ipcMain.on('lds:legacy-storage', (e) => { e.returnValue = storageMigrated() ? null : legacyStorage; });
ipcMain.on('lds:legacy-storage-done', (e, n) => {
  try { fs.writeFileSync(path.join(app.getPath('userData'), 'storage-origin.json'), JSON.stringify({ origin: 'lds://app', migratedAt: new Date().toISOString(), keys: Number(n) || 0 })); } catch (x) {}
  legacyStorage = null;
});
function loadApp(win) {
  if (storageMigrated()) { win.loadURL(APP_URL); return; }
  let done = false;
  const go = () => { if (done || win.isDestroyed()) return; done = true; win.loadURL(APP_URL); };
  win.webContents.once('did-finish-load', () => {
    win.webContents.executeJavaScript('(function(){var o={};try{for(var i=0;i<localStorage.length;i++){var k=localStorage.key(i);o[k]=localStorage.getItem(k);}}catch(e){}return o;})()')
      .then((o) => { legacyStorage = (o && typeof o === 'object') ? o : {}; }).catch(() => { legacyStorage = {}; }).then(go);
  });
  setTimeout(go, 5000);   // never stuck on the old page
  try { win.loadFile(path.join(__dirname, 'legacy-storage.html')); } catch (e) { go(); }
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

  loadApp(win);

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

// ---- Tear-off tool panels (Calendar / Underwriting) as their own windows ------
// A tab popped out of the main window becomes a real BrowserWindow that loads the
// SAME index.html with ?panel=<kind>, so it renders just that one tool (shared
// localStorage keeps its data consistent with the main window). Docking sends the
// tab back to the main strip and closes the panel window.
const panelWindows = {};   // kind -> BrowserWindow
const PANEL_KINDS = { calendar: 'Maturity & Reset Calendar', underwriting: 'Underwriting & Sizing', health: 'Data Health' };   // 2.9.7 (#43) — Data Health too
function panelTitle(kind) { return PANEL_KINDS[kind] || 'Loan Debt Service Hub'; }
// 2.9.7 (#43, #228) — anything that stops a pop-out window from opening or loading is written to
// userData/logs/main.log and told to the main window, never swallowed.
function mainLog(line){ try { const d = path.join(app.getPath('userData'), 'logs'); fs.mkdirSync(d, { recursive: true }); fs.appendFileSync(path.join(d, 'main.log'), new Date().toISOString() + ' ' + line + '\n'); } catch (e) {} }
function tellMain(channel, payload){ try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload); } catch (e) {} }
function openPanel(kind){
  if (!PANEL_KINDS[kind]) return { ok: false, error: 'unknown panel ' + kind };
  const existing = panelWindows[kind];
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return { ok: true, existing: true }; }
  let win;
  try {
    win = new BrowserWindow({
      width: kind === 'calendar' ? 1200 : 1100, height: 860, minWidth: 720, minHeight: 520, show: false,
      backgroundColor: '#f6f8f2', title: panelTitle(kind), autoHideMenuBar: true, titleBarStyle: 'hidden',
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
    });
  } catch (err) { mainLog('open-panel ' + kind + ' failed: ' + ((err && err.stack) || err)); return { ok: false, error: String((err && err.message) || err) }; }
  panelWindows[kind] = win;
  let shown = false;
  const show = () => { if (shown || win.isDestroyed()) return; shown = true; try { win.show(); win.focus(); } catch (e) {} };
  win.once('ready-to-show', show);
  setTimeout(show, 3000);   // never stay invisible if ready-to-show is late
  win.webContents.on('did-fail-load', (ev, code, desc, url) => { mainLog('panel ' + kind + ' did-fail-load ' + code + ' ' + desc + ' ' + url); tellMain('lds:panel-error', { kind, error: desc || ('load failed ' + code) }); });
  win.webContents.on('render-process-gone', (ev, d) => { mainLog('panel ' + kind + ' render-process-gone ' + JSON.stringify(d)); tellMain('lds:panel-error', { kind, error: 'the window stopped (' + ((d && d.reason) || 'unknown') + ')' }); });
  win.webContents.on('console-message', (ev, level, message) => { if (level >= 3) mainLog('panel ' + kind + ' console error: ' + String(message).slice(0, 500)); });
  try { win.loadURL(APP_URL + '?panel=' + encodeURIComponent(kind)); }
  catch (err) { mainLog('panel ' + kind + ' loadURL threw: ' + ((err && err.stack) || err)); }
  const sendState = () => { try { win.webContents.send('lds:win-state', { maximized: win.isMaximized() }); } catch (e2) {} };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('closed', () => {
    delete panelWindows[kind];
    tellMain('lds:panel-closed', kind);
  });
  return { ok: true };
}
ipcMain.handle('lds:open-panel-invoke', (e, kind) => openPanel(kind));
ipcMain.on('lds:open-panel', (e, kind) => { const r = openPanel(kind); if (!r.ok) tellMain('lds:panel-error', { kind, error: r.error }); });
ipcMain.on('lds:close-panel', (e, kind) => { const w = panelWindows[kind]; if (w && !w.isDestroyed()) w.close(); });
ipcMain.on('lds:focus-panel', (e, kind) => { const w = panelWindows[kind]; if (w && !w.isDestroyed()) { w.show(); w.focus(); } });
ipcMain.on('lds:dock-panel', (e, kind) => {
  try { if (mainWindow && !mainWindow.isDestroyed()) { mainWindow.webContents.send('lds:dock-panel', kind); bringToFront(mainWindow); } } catch (e2) {}
  const w = panelWindows[kind]; if (w && !w.isDestroyed()) w.close();
});

// Manual backup — native Save dialog, writes wherever the user chooses.
ipcMain.handle('lds:backup-save', async (e, { json, defaultName }) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const res = await dialog.showSaveDialog(win, {
    title: 'Back up portfolio',
    defaultPath: path.join(app.getPath('documents'), defaultName || 'Loan-Portfolio-backup.json'),
    filters: [{ name: 'Loan Debt Service Hub backup', extensions: ['json'] }],
  });
  if (res.canceled || !res.filePath) return { canceled: true };
  try { const r = writeFullBackupFile(res.filePath, json); return { ok: true, path: res.filePath, name: path.basename(res.filePath), fileCount: r.fileCount, bytes: r.bytes }; }
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
  try { const p = res.filePaths[0]; return openBackupContent(fs.readFileSync(p, 'utf8'), path.basename(p), null); }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// 2.9.7 (#64) — the loan records live in a file on disk (userData/loans.json), next to the property
// folders, not in the window's browser storage. Read and written SYNCHRONOUSLY so a change is on disk
// before the app moves on (no lost edit on a quick close). Each write goes to a temp file first and the
// previous version is kept as loans.prev.json, so a failed write can never leave a half-written book.
function loansFile(){ return path.join(app.getPath('userData'), 'loans.json'); }
ipcMain.on('lds:loans-read-sync', (e) => {
  try {
    const f = loansFile();
    if (!fs.existsSync(f)) { e.returnValue = { ok: true, exists: false }; return; }
    e.returnValue = { ok: true, exists: true, json: fs.readFileSync(f, 'utf8') };
  } catch (err) { e.returnValue = { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.on('lds:loans-write-sync', (e, json) => {
  try {
    if (typeof json !== 'string') throw new Error('nothing to write');
    JSON.parse(json);   // never write something that isn't valid JSON
    const f = loansFile(), tmp = f + '.tmp';
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, json, 'utf8');
    if (fs.existsSync(f)) { try { fs.copyFileSync(f, path.join(path.dirname(f), 'loans.prev.json')); } catch (x) {} }
    fs.renameSync(tmp, f);
    e.returnValue = { ok: true };
  } catch (err) { e.returnValue = { ok: false, error: String((err && err.message) || err) }; }
});

// ---- 2.9.7 (#9, #70, #142–#144) — ONE complete backup -----------------------------------------
// A backup is the whole app: the loans, the app's own settings (targets, Underwriting, rate history)
// and EVERY file under documents/ (each property folder: profile, assumptions, T12s, rent rolls,
// agreements, general data, change history) and chats/. ai-config.json is left out on purpose — it
// can hold the Claude API key, and a backup file can be copied anywhere.
//  - The manual backup (Data › Back up) is one self-contained .json with each file inside it (base64).
//  - The automatic snapshots list the files by checksum; each distinct file is stored once under
//    backups/blobs/<sha1>, so twenty snapshots of a 100 MB book do not take 2 GB.
// Restore puts all of it back: the files first (the current ones are kept aside until the new set is
// fully written, and a "before a restore" snapshot is always taken first), then the loans and settings.
const FULL_DIRS = ['documents', 'chats'];
// Tell the page its files changed, so it schedules an automatic snapshot (debounced there).
function dataChanged(e){ try { if (e && e.sender && !e.sender.isDestroyed()) e.sender.send('lds:data-changed'); } catch (x) {} }
const BACKUP_KINDS = {
  'autobackup':            'After a change',
  'before-restore':        'Before a restore',
  'before-import':         'Before Excel import',
  'before-move-to-disk':   'Before moving the loans to disk',
  'before-portfolio-sync': 'Before a portfolio sync',
};
function backupKind(kind){ return Object.prototype.hasOwnProperty.call(BACKUP_KINDS, kind) ? kind : 'autobackup'; }
function blobsDir(){ return path.join(backupsDir(), 'blobs'); }
const shaCache = {};   // abs path -> { size, mtimeMs, sha1 } — a file is hashed again only when it changes
function fileSha1(abs, st){
  const c = shaCache[abs];
  if (c && c.size === st.size && c.mtimeMs === st.mtimeMs) return c.sha1;
  const sha1 = crypto.createHash('sha1').update(fs.readFileSync(abs)).digest('hex');
  shaCache[abs] = { size: st.size, mtimeMs: st.mtimeMs, sha1 };
  return sha1;
}
// Every file of the full set: [{ path: "documents/<hash>/index.json", abs, size, sha1 }], sorted.
function listFullFiles(){
  const root = app.getPath('userData'), out = [];
  const walk = (abs, rel) => {
    let ents = []; try { ents = fs.readdirSync(abs, { withFileTypes: true }); } catch (e) { return; }
    ents.forEach(en => {
      const a = path.join(abs, en.name), r = rel + '/' + en.name;
      if (en.isDirectory()) walk(a, r);
      else if (en.isFile() && !/\.tmp$/.test(en.name)) { try { const st = fs.statSync(a); out.push({ path: r, abs: a, size: st.size, sha1: fileSha1(a, st) }); } catch (e) {} }
    });
  };
  FULL_DIRS.forEach(d => walk(path.join(root, d), d));
  return out.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
function fullCounts(files){
  const props = new Set(), chats = new Set();
  files.forEach(f => { const m = f.path.split('/'); if (m[0] === 'documents' && m.length > 2) props.add(m[1]); if (m[0] === 'chats' && m.length > 2 && m[2] !== 'index.json') chats.add(m[1] + '/' + m[2]); });
  return { propertyFolders: props.size, chatCount: chats.size };
}
// A backup's file path must stay inside documents/ or chats/ — never anywhere else on disk.
function safeBackupPath(p){ return typeof p === 'string' && /^(documents|chats)\/[A-Za-z0-9._\- \/]+$/.test(p) && p.split('/').indexOf('..') < 0; }
// The manual backup: the renderer's envelope (loans + settings) plus every file, inside one .json.
function writeFullBackupFile(dest, json){
  const env = JSON.parse(json);
  const files = listFullFiles();
  Object.assign(env, { format: 2, kind: 'full', fileCount: files.length }, fullCounts(files));
  delete env.files;
  const head = JSON.stringify(env);
  const fd = fs.openSync(dest + '.tmp', 'w');
  let bytes = 0;
  const w = (str) => { bytes += fs.writeSync(fd, str, null, 'utf8'); };
  try {
    w(head.slice(0, -1) + ',"files":[');
    files.forEach((f, i) => {
      const b64 = fs.readFileSync(f.abs).toString('base64');
      w((i ? ',' : '') + JSON.stringify({ path: f.path, size: f.size, sha1: f.sha1, base64: b64 }));
    });
    w(']}');
  } finally { fs.closeSync(fd); }
  fs.renameSync(dest + '.tmp', dest);
  return { fileCount: files.length, bytes };
}
// Restores waiting for the renderer's go-ahead: token -> { files: [{path, sha1, base64?}], fromBlobs }
const pendingRestores = {};
function openBackupContent(content, name, snapshotName){
  let obj; try { obj = JSON.parse(content); } catch (e) { return { ok: false, error: "That file isn't valid JSON." }; }
  if (obj && obj.format === 2 && Array.isArray(obj.files)) {
    const bad = obj.files.find(f => !safeBackupPath(f && f.path));
    if (bad) return { ok: false, error: 'This backup has a file outside the app’s folders (' + String(bad && bad.path).slice(0, 80) + ') — nothing was restored.' };
    const token = crypto.randomBytes(8).toString('hex');
    pendingRestores[token] = { files: obj.files, fromBlobs: !!snapshotName };
    const lite = Object.assign({}, obj); delete lite.files;
    return { ok: true, name, full: true, token, content: JSON.stringify(lite) };
  }
  return { ok: true, name, full: false, content };   // a pre-2.9.7 backup: the loans only
}
// Silent snapshot into the managed backups folder (kind = why it was taken, kept in the file and its name).
function writeSnapshot(json, kind){
  kind = backupKind(kind);
  const env = JSON.parse(json);
  const files = listFullFiles();
  const sig = crypto.createHash('sha1').update(JSON.stringify({ loans: env.loans || [], settings: env.settings || {} }) + '|' + files.map(f => f.path + ':' + f.sha1).join('|')).digest('hex');
  const d = ensureBackupsDir();
  if (kind === 'autobackup') {   // nothing changed since the newest routine snapshot → don't write another
    const last = fs.readdirSync(d).filter(f => f.startsWith('autobackup-') && f.endsWith('.json')).sort().pop();
    if (last) { try { if (JSON.parse(fs.readFileSync(path.join(d, last), 'utf8')).sig === sig) return { ok: true, skipped: true }; } catch (e) {} }
  }
  const bd = blobsDir(); fs.mkdirSync(bd, { recursive: true });
  files.forEach(f => { const b = path.join(bd, f.sha1); if (!fs.existsSync(b)) fs.copyFileSync(f.abs, b); });
  Object.assign(env, { format: 2, kind: 'snapshot', reason: kind, reasonLabel: BACKUP_KINDS[kind], sig, fileCount: files.length,
    files: files.map(f => ({ path: f.path, size: f.size, sha1: f.sha1 })) }, fullCounts(files));
  const file = path.join(d, kind + '-' + stamp() + '.json');
  fs.writeFileSync(file, JSON.stringify(env), 'utf8');
  rotate('autobackup', 20);
  Object.keys(BACKUP_KINDS).filter(k => k !== 'autobackup').forEach(k => rotate(k, 10));
  gcBlobs();
  return { ok: true, path: file };
}
// Remove stored files no snapshot points at any more.
function gcBlobs(){
  try {
    const d = backupsDir(), bd = blobsDir(); if (!fs.existsSync(bd)) return;
    const keep = new Set();
    fs.readdirSync(d).filter(f => f.endsWith('.json')).forEach(f => {
      try { const j = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')); (j.files || []).forEach(x => { if (x && x.sha1 && !x.base64) keep.add(x.sha1); }); } catch (e) {}
    });
    fs.readdirSync(bd).forEach(b => { if (!keep.has(b)) { try { fs.unlinkSync(path.join(bd, b)); } catch (e) {} } });
  } catch (e) {}
}
ipcMain.handle('lds:autobackup-write', async (e, { json, kind }) => {
  try { return writeSnapshot(json, kind); }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// List snapshots in the backups folder (newest first) with why and when each was taken.
ipcMain.handle('lds:autobackup-list', async () => {
  try {
    const d = backupsDir();
    if (!fs.existsSync(d)) return [];
    return fs.readdirSync(d).filter(f => f.endsWith('.json')).map(f => {
      const full = path.join(d, f); let loanCount = null, exportedAt = null, reason = null, reasonLabel = null, fileCount = null, propertyFolders = null, chatCount = null;
      try { const j = JSON.parse(fs.readFileSync(full, 'utf8')); loanCount = (j.loanCount != null) ? j.loanCount : (Array.isArray(j.loans) ? j.loans.length : null); exportedAt = j.exportedAt || null;
            reason = j.reason || null; reasonLabel = j.reasonLabel || null; fileCount = (j.fileCount != null) ? j.fileCount : null; propertyFolders = j.propertyFolders != null ? j.propertyFolders : null; chatCount = j.chatCount != null ? j.chatCount : null; } catch (e) {}
      const st = fs.statSync(full);
      const pre = Object.keys(BACKUP_KINDS).find(k => f.startsWith(k + '-')) || 'autobackup';
      if (!reason) { reason = pre; reasonLabel = BACKUP_KINDS[pre]; }
      const kind = pre === 'before-restore' ? 'before-restore' : pre === 'before-import' ? 'before-import' : pre === 'autobackup' ? 'auto' : pre;
      return { name: f, kind, reason, reasonLabel, mtime: st.mtimeMs, loanCount, exportedAt, fileCount, propertyFolders, chatCount, full: fileCount != null };
    }).sort((a, b) => b.mtime - a.mtime);
  } catch (e) { return []; }
});

// Read one snapshot from the backups folder by name (path-traversal guarded).
ipcMain.handle('lds:autobackup-read', async (e, { name }) => {
  try {
    if (!name || name.indexOf('..') >= 0 || path.isAbsolute(name)) return { ok: false, error: 'bad name' };
    const full = path.join(backupsDir(), path.basename(name));
    return openBackupContent(fs.readFileSync(full, 'utf8'), path.basename(name), path.basename(name));
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// Put a full backup's files back (after the renderer took its "before a restore" snapshot). The current
// documents/ and chats/ are moved aside, the backup's set is written and checked, and only then are the
// old ones removed; on any failure the old ones go back exactly as they were.
ipcMain.handle('lds:fullbackup-restore', async (e, { token }) => {
  const job = pendingRestores[token]; delete pendingRestores[token];
  if (!job) return { ok: false, error: 'That backup is no longer open — open it again.' };
  const root = app.getPath('userData'), aside = path.join(root, '.restore-old-' + stamp());
  const moved = [];
  try {
    fs.mkdirSync(aside, { recursive: true });
    FULL_DIRS.forEach(d => { const a = path.join(root, d); if (fs.existsSync(a)) { fs.renameSync(a, path.join(aside, d)); moved.push(d); } });
    let n = 0;
    for (const f of job.files) {
      if (!safeBackupPath(f.path)) throw new Error('bad path ' + f.path);
      const dest = path.join(root, ...f.path.split('/'));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      let buf;
      if (f.base64 != null) buf = Buffer.from(f.base64, 'base64');
      else { const b = path.join(blobsDir(), String(f.sha1 || '')); if (!/^[0-9a-f]{40}$/.test(String(f.sha1 || '')) || !fs.existsSync(b)) throw new Error('a stored copy of ' + f.path + ' is missing'); buf = fs.readFileSync(b); }
      if (f.sha1 && crypto.createHash('sha1').update(buf).digest('hex') !== f.sha1) throw new Error(f.path + ' does not match its checksum');
      fs.writeFileSync(dest, buf); n++;
    }
    try { fs.rmSync(aside, { recursive: true, force: true }); } catch (x) {}
    Object.keys(shaCache).forEach(k => delete shaCache[k]);
    return { ok: true, fileCount: n };
  } catch (err) {
    FULL_DIRS.forEach(d => { try { fs.rmSync(path.join(root, d), { recursive: true, force: true }); } catch (x) {} });
    moved.forEach(d => { try { fs.renameSync(path.join(aside, d), path.join(root, d)); } catch (x) {} });
    try { fs.rmSync(aside, { recursive: true, force: true }); } catch (x) {}
    return { ok: false, error: String((err && err.message) || err) };
  }
});

// ---- 2.9.7 (#256) — 1-month Term SOFR from Pensford's public rate data -------------------------
// Pensford publishes CME 1-month Term SOFR every business day (the numbers behind
// pensford.com/forward-curve). Their API only answers a request that comes from their own page, so the
// main process asks with that page as the referrer. Returns today's value and every day since `since`
// (percent, e.g. 3.91228). Any failure is reported, never invented — the page then uses its last saved,
// dated value. Tests: LDS_RATES_FAKE=<json file> answers from a file; LDS_RATES_OFFLINE=1 fails.
const PENSFORD = 'https://pensford.com';
async function pensfordJson(p){
  const r = await net.fetch(PENSFORD + p, { headers: { 'Referer': PENSFORD + '/forward-curve', 'Accept': 'application/json' } });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}
ipcMain.handle('lds:rates-termsofr', async (e, { since } = {}) => {
  try {
    if (process.env.LDS_RATES_OFFLINE) return { ok: false, error: 'offline' };
    if (process.env.LDS_RATES_FAKE) return Object.assign({ ok: true }, JSON.parse(fs.readFileSync(process.env.LDS_RATES_FAKE, 'utf8')));
    const out = { ok: true, live: null, history: {} };
    try {
      const j = await pensfordJson('/api/live-rates');
      const q = j && j.termSofr1M, m = q && /^(\d\d)\/(\d\d)\/(\d{4})$/.exec(String(q.quoteDate || ''));
      if (q && typeof q.quote === 'number' && m) out.live = { value: +(q.quote * 100).toFixed(5), date: m[3] + '-' + m[1] + '-' + m[2] };
      else out.liveError = 'the live-rates format changed';
    } catch (x) { out.liveError = String((x && x.message) || x); }
    if (since && /^\d{4}-\d\d-\d\d$/.test(since)) {
      try {
        const j = await pensfordJson('/api/forward-curve/historical?table=historical_floating&since=' + since);
        (j && j.rows || []).forEach(r => { if (r && r.rate_label === '1M Term SOFR' && /^\d{4}-\d\d-\d\d$/.test(String(r.reset_date)) && typeof r.rate_value === 'number') out.history[r.reset_date] = r.rate_value; });
      } catch (x) { out.historyError = String((x && x.message) || x); }
    }
    if (!out.live && !Object.keys(out.history).length) return { ok: false, error: out.liveError || out.historyError || 'no data' };
    return out;
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

// ---- Property documents (per-property file store) ---------------------------
// Files the operator attaches to a property are saved under userData/documents/<hash>/
// so they persist across restarts and updates (data lives beside the backups, never
// touched by an update) and the assistant can reuse them without re-uploading. Each
// property folder holds the ORIGINAL files, a <id>.txt cache of the extracted text
// (what the assistant actually reads), and an index.json:
//   { propKey, propName, files: [{ id, stored, name, size, type, savedAt, textLen }] }
const APP_ROLES = new Set(['profile', 'assumptions', 'general', 'history']);   // the app's own records in a property folder
function documentsDir(){ return path.join(app.getPath('userData'), 'documents'); }
function propDir(propKey){ const h = crypto.createHash('sha1').update(String(propKey || '')).digest('hex').slice(0, 16); return path.join(documentsDir(), h); }
function readDocIndex(dir){ try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); return (j && typeof j === 'object') ? j : {}; } catch (e) { return {}; } }
function writeDocIndex(dir, idx){ try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx)); } catch (e) {} }
// "Loan Agreement.pdf" → "Loan Agreement (2).pdf" (the first number not already taken).
function docUniqueName(name, taken){
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 2; i < 1000; i++) { const n = base + ' (' + i + ')' + ext; if (!taken.has(n)) return n; }
  return base + ' (' + Date.now() + ')' + ext;
}
function docSafeExt(name){ const e = path.extname(String(name || '')).replace(/[^.a-z0-9]/gi, ''); return e.slice(0, 12); }
function pubFile(f){ return { id: f.id, name: f.name, size: f.size, type: f.type, role: f.role || '', savedAt: f.savedAt, textLen: f.textLen || 0, sha: f.sha || '', readLabel: f.readLabel || '' }; }

// Save one original file (base64) + its extracted text under a property. Replaces an
// existing file of the same name for that property. `role` tags what the file is
// (e.g. "t12") so a consumer can find it again without guessing from the name.
ipcMain.handle('lds:doc-save', (e, { propKey, propName, name, base64, text, type, role, label }) => {
  if(!base64) return { ok: false, error: 'missing fields' };
  return docSaveBuffer(e, { propKey, propName, name, buf: Buffer.from(base64, 'base64'), text, type, role, label });
});
function docSaveBuffer(e, { propKey, propName, name, buf, text, type, role, label }) {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try {
    if(!propKey || !name || !buf) return { ok: false, error: 'missing fields' };
    const dir = propDir(propKey); fs.mkdirSync(dir, { recursive: true });
    const idx = readDocIndex(dir); idx.propKey = propKey; idx.propName = propName || idx.propName || ''; idx.files = Array.isArray(idx.files) ? idx.files : [];
    const sha = crypto.createHash('sha1').update(buf).digest('hex');
    // Exact-duplicate guard: the same bytes already stored under this role is not re-saved (a second
    // identical T12 shouldn't create a phantom "newer" statement). The caller is told it was a dup.
    const already = idx.files.find(f => f.sha === sha && (f.role || '') === (role || ''));
    if(already){ return { ok: true, duplicate: true, file: pubFile(already) }; }
    const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const stored = id + docSafeExt(name);
    fs.writeFileSync(path.join(dir, stored), buf);
    const t = String(text || ''); if(t){ try { fs.writeFileSync(path.join(dir, id + '.txt'), t, 'utf8'); } catch (err) {} }
    // The app's own records (profile, assumptions, general data, history) replace their previous version.
    // 2.9.7 (#212) — a DOCUMENT is never deleted because of its name: a second, different file with the same
    // name is kept as "Loan Agreement (2).pdf".
    let finalName = String(name), renamed = null;
    if (APP_ROLES.has(role || '')) {
      idx.files.filter(f => f.name === finalName).forEach(f => { try { fs.unlinkSync(path.join(dir, f.stored)); } catch (x) {} try { fs.unlinkSync(path.join(dir, f.id + '.txt')); } catch (x) {} });
      idx.files = idx.files.filter(f => f.name !== finalName);
    } else if (idx.files.some(f => f.name === finalName)) {
      finalName = docUniqueName(finalName, new Set(idx.files.map(f => f.name))); renamed = finalName;
    }
    const entry = { id, stored, name: finalName, size: buf.length, type: type || '', role: role || '', savedAt: Date.now(), textLen: t.length, sha, readLabel: String(label || '').slice(0, 300) };
    idx.files.push(entry); writeDocIndex(dir, idx);
    return { ok: true, file: pubFile(entry), renamed };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
}
// 2.9.7 (#37) — change a saved document's type (Loan agreement, T12, Rent roll, Unit Statistics, Other).
ipcMain.handle('lds:doc-set-role', (e, { propKey, id, role }) => {
  dataChanged(e);
  try {
    if (!propKey || !id || APP_ROLES.has(role || '')) return { ok: false, error: 'bad request' };
    const dir = propDir(propKey), idx = readDocIndex(dir);
    const f = (idx.files || []).find(x => x.id === id); if (!f) return { ok: false, error: 'not found' };
    if (APP_ROLES.has(f.role || '')) return { ok: false, error: 'that is one of the app’s own records' };
    f.role = String(role || 'other'); writeDocIndex(dir, idx);
    return { ok: true, file: pubFile(f) };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// List one property's saved files (metadata only, no text).
ipcMain.handle('lds:doc-list', (e, { propKey }) => {
  try { const idx = readDocIndex(propDir(propKey)); return { ok: true, propName: idx.propName || '', files: (idx.files || []).map(pubFile).sort((a, b) => b.savedAt - a.savedAt) }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err), files: [] }; }
});
// A light index across ALL properties (propKey → filenames) for the assistant snapshot.
ipcMain.handle('lds:doc-index', () => {
  const out = {};
  try {
    const root = documentsDir(); if(!fs.existsSync(root)) return { ok: true, byKey: out };
    fs.readdirSync(root).forEach(h => {
      const idx = readDocIndex(path.join(root, h));
      if(idx.propKey && Array.isArray(idx.files) && idx.files.length) out[idx.propKey] = { propName: idx.propName || '', files: idx.files.map(f => f.name) };
    });
  } catch (e) {}
  return { ok: true, byKey: out };
});
// The concatenated extracted text of a property's documents (bounded) — what the assistant
// reads when it's focused on that property.
ipcMain.handle('lds:doc-text', (e, { propKey }) => {
  try {
    const dir = propDir(propKey), idx = readDocIndex(dir);
    // 2.9.7 (#212) — newest documents first; say which ones could not be read (no text) or did not fit.
    const files = (Array.isArray(idx.files) ? idx.files : []).filter(f => !APP_ROLES.has(f.role || '')).slice().sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    let out = '', used = [], truncated = false; const unreadable = [], left = [];
    for(const f of files){
      let t = ''; try { t = fs.readFileSync(path.join(dir, f.id + '.txt'), 'utf8'); } catch (x) { t = ''; }
      if(!t){ unreadable.push(f.name); continue; }
      // 2.9.7 (#250) — nothing is cut: a property's documents come back whole (the assistant reads them in parts)
      out += '<file name="' + String(f.name).replace(/"/g, '') + '"' + (f.readLabel ? ' read="' + String(f.readLabel).replace(/"/g, '') + '"' : '') + '>\n' + t + '\n</file>\n\n';
      used.push(f.name);
    }
    return { ok: true, text: out.trim(), files: used, propName: idx.propName || '', truncated, unreadable, left };
  } catch (err) { return { ok: false, error: String((err && err.message) || err), text: '', files: [] }; }
});
// 2.9.7 (#53, #250) — one saved document's text, in parts (the assistant reads a long file part by part instead
// of having it cut). part is 1-based; partSize characters each (default 100,000).
ipcMain.handle('lds:doc-text-part', (e, { propKey, name, id, part, partSize }) => {
  try {
    const dir = propDir(propKey), idx = readDocIndex(dir);
    const files = (Array.isArray(idx.files) ? idx.files : []).filter(f => !APP_ROLES.has(f.role || ''));
    const want = String(name || '').toLowerCase().trim();
    const f = id ? files.find(x => x.id === id) : (files.find(x => String(x.name).toLowerCase() === want) || files.filter(x => String(x.name).toLowerCase().indexOf(want) >= 0).sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0))[0]);
    if (!f) return { ok: false, error: 'not found', files: files.map(x => x.name) };
    let t = ''; try { t = fs.readFileSync(path.join(dir, f.id + '.txt'), 'utf8'); } catch (x) { t = ''; }
    const size = Math.max(10000, Math.min(400000, Number(partSize) || 100000));
    const parts = Math.max(1, Math.ceil(t.length / size)), p = Math.max(1, Math.min(parts, Math.round(Number(part) || 1)));
    return { ok: true, name: f.name, role: f.role || '', savedAt: f.savedAt || 0, readable: t.length > 0, chars: t.length, part: p, parts, text: t.slice((p - 1) * size, p * size) };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// 2.9.7 (#250) — the reading queue: a file added to a property's Documents is kept here (copied straight from disk
// when the page can say where it is) while it is being read; once read it is filed and removed. If the app is
// closed halfway, the next start continues it.
function readqDir(){ return path.join(app.getPath('userData'), 'reading-queue'); }
function readqJob(id){ try { return JSON.parse(fs.readFileSync(path.join(readqDir(), String(id).replace(/[^a-z0-9]/gi, '') + '.json'), 'utf8')); } catch (e) { return null; } }
ipcMain.handle('lds:readq-add', (e, { name, type, base64, filePath, fallbackKey, fallbackName, role }) => {
  try {
    fs.mkdirSync(readqDir(), { recursive: true });
    const id = 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), bin = path.join(readqDir(), id + '.bin');
    if (filePath && fs.existsSync(filePath)) fs.copyFileSync(filePath, bin);
    else if (base64) fs.writeFileSync(bin, Buffer.from(String(base64), 'base64'));
    else return { ok: false, error: 'no file' };
    const job = { id, name: String(name || 'file'), type: type || '', size: fs.statSync(bin).size, fallbackKey: fallbackKey || '', fallbackName: fallbackName || '', role: role || '', addedAt: Date.now() };
    fs.writeFileSync(path.join(readqDir(), id + '.json'), JSON.stringify(job));
    return { ok: true, id, size: job.size };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('lds:readq-list', () => {
  try { if (!fs.existsSync(readqDir())) return { ok: true, jobs: [] };
    return { ok: true, jobs: fs.readdirSync(readqDir()).filter(n => /\.json$/.test(n)).map(n => readqJob(n.replace(/\.json$/, ''))).filter(j => j && fs.existsSync(path.join(readqDir(), j.id + '.bin'))).sort((a, b) => a.addedAt - b.addedAt) };
  } catch (err) { return { ok: false, jobs: [] }; }
});
ipcMain.handle('lds:readq-bytes', (e, { id }) => {
  try { const j = readqJob(id); if (!j) return { ok: false, error: 'not found' }; return { ok: true, base64: fs.readFileSync(path.join(readqDir(), j.id + '.bin')).toString('base64'), name: j.name }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
ipcMain.handle('lds:readq-done', (e, { id }) => {
  try { const b = path.join(readqDir(), String(id).replace(/[^a-z0-9]/gi, '')); try { fs.unlinkSync(b + '.bin'); } catch (x) {} try { fs.unlinkSync(b + '.json'); } catch (x) {} return { ok: true }; }
  catch (err) { return { ok: false }; }
});
// Save a queued file into a property's folder without sending its bytes through the page (big files).
ipcMain.handle('lds:doc-save-queued', (e, { id, propKey, propName, name, text, type, role, label }) => {
  try { const j = readqJob(id); if (!j) return { ok: false, error: 'not found' };
    const buf = fs.readFileSync(path.join(readqDir(), j.id + '.bin'));
    return docSaveBuffer(e, { propKey, propName, name: name || j.name, buf, text, type: type || j.type, role, label });
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// 2.9.7 (#250) — pages read by OCR are kept by the file's checksum, so reading the same file again (after Stop, or
// after the app was closed halfway) continues where it stopped. Old entries are dropped after 120 days.
function ocrCacheDir(){ return path.join(app.getPath('userData'), 'ocr-cache'); }
function ocrCacheFile(sha){ return path.join(ocrCacheDir(), String(sha).replace(/[^a-f0-9]/gi, '').slice(0, 64) + '.json'); }
ipcMain.handle('lds:ocr-cache-get', (e, { sha }) => {
  try { if (!sha) return { ok: true, pages: {} }; const j = JSON.parse(fs.readFileSync(ocrCacheFile(sha), 'utf8')); return { ok: true, pages: j.pages || {}, numPages: j.numPages || 0 }; }
  catch (err) { return { ok: true, pages: {} }; }
});
ipcMain.handle('lds:ocr-cache-put', (e, { sha, page, text, pages }) => {
  try {
    if (!sha || !page) return { ok: false };
    fs.mkdirSync(ocrCacheDir(), { recursive: true });
    const f = ocrCacheFile(sha); let j = {}; try { j = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (x) {}
    j.pages = j.pages || {}; j.pages[String(page)] = { text: String(text || ''), at: Date.now() }; if (pages) j.numPages = pages; j.updatedAt = Date.now();
    fs.writeFileSync(f, JSON.stringify(j));
    return { ok: true };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
function pruneOcrCache(){ try { const d = ocrCacheDir(), cut = Date.now() - 120 * 86400000; fs.readdirSync(d).forEach(n => { try { const f = path.join(d, n); if (fs.statSync(f).mtimeMs < cut) fs.unlinkSync(f); } catch (x) {} }); } catch (e) {} }
// Read one original file back (base64) — for opening/exporting from the Documents panel.
ipcMain.handle('lds:doc-read', (e, { propKey, id }) => {
  try {
    const dir = propDir(propKey), idx = readDocIndex(dir);
    const f = (idx.files || []).find(x => x.id === id); if(!f) return { ok: false, error: 'not found' };
    return { ok: true, base64: fs.readFileSync(path.join(dir, f.stored)).toString('base64'), name: f.name, type: f.type || '' };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Delete one saved file (original + text + index entry).
ipcMain.handle('lds:doc-delete', (e, { propKey, id }) => {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try {
    const dir = propDir(propKey), idx = readDocIndex(dir);
    const f = (idx.files || []).find(x => x.id === id); if(!f) return { ok: true };
    try { fs.unlinkSync(path.join(dir, f.stored)); } catch (x) {} try { fs.unlinkSync(path.join(dir, f.id + '.txt')); } catch (x) {}
    idx.files = (idx.files || []).filter(x => x.id !== id); writeDocIndex(dir, idx);
    return { ok: true };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Move a property's WHOLE document folder when its property key changes (an address edit re-keys
// the property). Guarded so a T12 is never lost or clobbered: refuses if the destination already has
// its own files (kept at the old key), no-ops if the source has none, and carries the index's
// propKey/propName across. Same parent directory, so a plain rename moves it atomically.
ipcMain.handle('lds:doc-move', (e, { fromKey, toKey, propName, merge }) => {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try {
    if(!fromKey || !toKey || fromKey === toKey) return { ok: true, moved: false, reason: 'same key' };
    const src = propDir(fromKey), dst = propDir(toKey);
    const srcIdx = readDocIndex(src);
    if(!fs.existsSync(src) || !(Array.isArray(srcIdx.files) && srcIdx.files.length)) return { ok: true, moved: false, reason: 'nothing to move' };
    const dstIdx = readDocIndex(dst);
    if(fs.existsSync(dst) && Array.isArray(dstIdx.files) && dstIdx.files.length){
      if(!merge) return { ok: true, moved: false, reason: 'target exists' };
      // 2.9.7 (#216) — the user chose to put the two together: every file moves in; a file whose name is
      // already there keeps both ("Loan Agreement (2).pdf"); the app's own records of the moving property
      // (profile, assumptions, general data, history) give way to the ones already there.
      const names = new Set(dstIdx.files.map(f => f.name)), own = new Set(['profile', 'assumptions', 'general', 'history']);
      let moved = 0;
      srcIdx.files.forEach(f => {
        if(own.has(f.role || '') && dstIdx.files.some(x => (x.role || '') === f.role)) return;
        let name = f.name; if(names.has(name)) name = docUniqueName(name, names);
        try { fs.renameSync(path.join(src, f.stored), path.join(dst, f.stored)); } catch (x) { return; }
        try { if(fs.existsSync(path.join(src, f.id + '.txt'))) fs.renameSync(path.join(src, f.id + '.txt'), path.join(dst, f.id + '.txt')); } catch (x) {}
        dstIdx.files.push(Object.assign({}, f, { name })); names.add(name); moved++;
      });
      dstIdx.propKey = toKey; if(propName) dstIdx.propName = propName; writeDocIndex(dst, dstIdx);
      try { fs.rmSync(src, { recursive: true, force: true }); } catch (x) {}
      return { ok: true, moved: true, merged: moved };
    }
    if(fs.existsSync(dst)){ try { fs.rmSync(dst, { recursive: true, force: true }); } catch (x) {} }   // an empty stub at the destination
    fs.renameSync(src, dst);
    srcIdx.propKey = toKey; if(propName) srcIdx.propName = propName; writeDocIndex(dst, srcIdx);
    return { ok: true, moved: true };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Reveal the documents folder in the OS file manager.
ipcMain.handle('lds:docs-open-folder', async () => {
  try { const d = documentsDir(); fs.mkdirSync(d, { recursive: true }); await shell.openPath(d); return { ok: true, path: d }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// 2.9.6 — permanent property delete (archived-only, driven from the renderer with a strong
// confirm). Removes the property's documents folder AND its chats folder from disk, for good.
// 2.9.7 (#206, #208) — refuses unless the property's profile says it is archived; deletes every file and
// reports any it couldn't (a file open in Excel), so the page keeps the property until all of it is gone.
function propIsArchivedOnDisk(propKey){
  try {
    const dir = propDir(propKey), idx = readDocIndex(dir);
    const f = (idx.files || []).filter(x => x.role === 'profile').sort((a, b) => b.savedAt - a.savedAt)[0];
    if (!f) return false;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f.stored), 'utf8'));
    return !!(j && j.archived);
  } catch (e) { return false; }
}
ipcMain.handle('lds:prop-purge', async (e, { propKey }) => {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try {
    if (!propKey) return { ok: false, error: 'no key' };
    const dirs = [propDir(propKey), chatScopeDir(propKey)];
    const hasFiles = dirs.some(d => fs.existsSync(d));
    if (hasFiles && !propIsArchivedOnDisk(propKey)) return { ok: false, notArchived: true, error: 'Archive the property before deleting it.' };
    const failed = [];
    for (const d of dirs) {
      if (!fs.existsSync(d)) continue;
      let ents = []; try { ents = fs.readdirSync(d); } catch (x) {}
      for (const n of ents) { try { fs.rmSync(path.join(d, n), { recursive: true, force: true }); } catch (x) { failed.push(n); } }
      try { if (!failed.length) fs.rmdirSync(d); } catch (x) { if (fs.existsSync(d)) failed.push(path.basename(d)); }
    }
    const left = dirs.filter(d => fs.existsSync(d));
    if (failed.length || left.length) return { ok: false, failed: failed.length || left.length, error: 'Couldn’t delete ' + (failed.length || left.length) + ' file' + ((failed.length || left.length) === 1 ? '' : 's') };
    return { ok: true, removed: dirs.length };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});

// ---- Assistant chat history (per-property + portfolio) -----------------------
// Conversations persist under userData/chats/<hash(scope)>/ — same durable, update-safe
// pattern as the documents store (so 2.9.6's shared DB migrates them like any other file).
// scope is a property's propertyKey, or the literal "portfolio" for general chats. Each scope
// folder holds an index.json { scope, scopeName, conversations:[meta] } and one <id>.json per
// conversation with the full messages. Kept indefinitely; deleted only by hand.
function chatsDir(){ return path.join(app.getPath('userData'), 'chats'); }
function chatScopeDir(scope){ const h = crypto.createHash('sha1').update(String(scope || '')).digest('hex').slice(0, 16); return path.join(chatsDir(), h); }
function readChatIndex(dir){ try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); return (j && typeof j === 'object') ? j : {}; } catch (e) { return {}; } }
function writeChatIndex(dir, idx){ try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx)); } catch (e) {} }
function chatMeta(c){ return { id: c.id, title: c.title || '', createdAt: c.createdAt || 0, updatedAt: c.updatedAt || 0, pinned: !!c.pinned, msgCount: Array.isArray(c.messages) ? c.messages.length : (c.msgCount || 0), scope: c.scope || '', scopeName: c.scopeName || '', fileNames: Array.isArray(c.files) ? c.files.map(f => f && f.name).filter(Boolean) : (Array.isArray(c.fileNames) ? c.fileNames : []) }; }
function chatSnippet(text, terms){
  const s = String(text || ''); if(!s) return '';
  const low = s.toLowerCase(); let pos = -1;
  for(const t of terms){ const i = low.indexOf(t); if(i >= 0 && (pos < 0 || i < pos)) pos = i; }
  if(pos < 0) return s.slice(0, 160).replace(/\s+/g, ' ').trim();
  const start = Math.max(0, pos - 70), end = Math.min(s.length, pos + 120);
  return (start > 0 ? '…' : '') + s.slice(start, end).replace(/\s+/g, ' ').trim() + (end < s.length ? '…' : '');
}

// 2.9.7 (#40, #216) — a renamed property's chats move with it (merged into the new name's chats if it has some).
ipcMain.handle('lds:chat-move', (e, { fromScope, toScope, scopeName }) => {
  dataChanged(e);
  try {
    if (!fromScope || !toScope || fromScope === toScope) return { ok: true, moved: false };
    const src = chatScopeDir(fromScope), dst = chatScopeDir(toScope);
    const si = readChatIndex(src);
    if (!fs.existsSync(src) || !(si.conversations || []).length) return { ok: true, moved: false, reason: 'nothing to move' };
    const di = readChatIndex(dst); di.conversations = Array.isArray(di.conversations) ? di.conversations : [];
    fs.mkdirSync(dst, { recursive: true });
    let moved = 0;
    (si.conversations || []).forEach(c => {
      try { fs.renameSync(path.join(src, c.id + '.json'), path.join(dst, c.id + '.json')); } catch (x) { return; }
      try { const f = path.join(dst, c.id + '.json'), conv = JSON.parse(fs.readFileSync(f, 'utf8')); conv.scope = toScope; if (scopeName) conv.scopeName = scopeName; fs.writeFileSync(f, JSON.stringify(conv)); } catch (x) {}
      di.conversations = di.conversations.filter(x => x.id !== c.id); di.conversations.push(Object.assign({}, c, { scope: toScope, scopeName: scopeName || c.scopeName })); moved++;
    });
    di.scope = toScope; if (scopeName) di.scopeName = scopeName; writeChatIndex(dst, di);
    try { fs.rmSync(src, { recursive: true, force: true }); } catch (x) {}
    return { ok: true, moved: moved > 0, count: moved };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Create or update one conversation (upsert by id). A blank title is auto-filled from the first
// user message. Returns the conversation's metadata (with its assigned id).
ipcMain.handle('lds:chat-save', (e, { scope, scopeName, id, title, messages, files, pinned }) => {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try {
    if(!scope) return { ok: false, error: 'missing scope' };
    const dir = chatScopeDir(scope); fs.mkdirSync(dir, { recursive: true });
    const idx = readChatIndex(dir); idx.scope = scope; idx.scopeName = scopeName || idx.scopeName || ''; idx.conversations = Array.isArray(idx.conversations) ? idx.conversations : [];
    const msgs = Array.isArray(messages) ? messages.filter(m => m && m.text) : [];
    const now = Date.now();
    const existing = id ? idx.conversations.find(c => c.id === id) : null;
    const cid = (id && existing) ? id : ('c' + now.toString(36) + Math.random().toString(36).slice(2, 6));
    let ttl = String(title || '').trim();
    // 2.9.7 (#58) — the title is the question as typed, without the hidden "[attached: …]" / "[property: …]" tags
    if(!ttl){ const firstU = msgs.find(m => m.role === 'user' && m.text); ttl = firstU ? String(firstU.text).replace(/\n\[(attached|property):[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 64) : ''; if(!ttl) ttl = 'New conversation'; }
    const conv = { id: cid, scope, scopeName: idx.scopeName, title: ttl,
      createdAt: existing ? (existing.createdAt || now) : now, updatedAt: now,
      pinned: (pinned != null ? !!pinned : (existing ? !!existing.pinned : false)),
      messages: msgs, files: Array.isArray(files) ? files : [] };
    fs.writeFileSync(path.join(dir, cid + '.json'), JSON.stringify(conv));
    const meta = chatMeta(conv);
    idx.conversations = idx.conversations.filter(c => c.id !== cid); idx.conversations.push(meta);
    writeChatIndex(dir, idx);
    return { ok: true, conversation: meta };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// List one scope's conversations (metadata only), pinned first then most-recent.
ipcMain.handle('lds:chat-list', (e, { scope }) => {
  try { const idx = readChatIndex(chatScopeDir(scope));
    const cs = (idx.conversations || []).slice().sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ok: true, scopeName: idx.scopeName || '', conversations: cs };
  } catch (err) { return { ok: false, error: String((err && err.message) || err), conversations: [] }; }
});
// 2.9.7 (#97) — every saved conversation, of every property and the portfolio (metadata only), for the History list.
ipcMain.handle('lds:chat-list-all', () => {
  try {
    const root = chatsDir(); if (!fs.existsSync(root)) return { ok: true, conversations: [] };
    const out = [];
    fs.readdirSync(root).forEach(h => { const idx = readChatIndex(path.join(root, h));
      (idx.conversations || []).forEach(c => out.push(Object.assign({}, c, { scope: c.scope || idx.scope || '', scopeName: c.scopeName || idx.scopeName || '' }))); });
    out.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ok: true, conversations: out };
  } catch (err) { return { ok: false, error: String((err && err.message) || err), conversations: [] }; }
});
// Read one conversation back in full (messages + files) — to reopen and continue it.
ipcMain.handle('lds:chat-read', (e, { scope, id }) => {
  try { const c = JSON.parse(fs.readFileSync(path.join(chatScopeDir(scope), String(id) + '.json'), 'utf8')); return { ok: true, conversation: c }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Delete one conversation (file + index entry).
ipcMain.handle('lds:chat-delete', (e, { scope, id }) => {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try { const dir = chatScopeDir(scope), idx = readChatIndex(dir);
    try { fs.unlinkSync(path.join(dir, String(id) + '.json')); } catch (x) {}
    idx.conversations = (idx.conversations || []).filter(c => c.id !== id); writeChatIndex(dir, idx);
    return { ok: true };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Rename and/or pin one conversation (metadata only — does not bump updatedAt / reorder).
ipcMain.handle('lds:chat-meta', (e, { scope, id, title, pinned }) => {
  dataChanged(e);   // 2.9.7 (#9) — an automatic snapshot follows any change to the files
  try { const dir = chatScopeDir(scope), idx = readChatIndex(dir);
    const meta = (idx.conversations || []).find(c => c.id === id); if(!meta) return { ok: false, error: 'not found' };
    let full = null; try { full = JSON.parse(fs.readFileSync(path.join(dir, String(id) + '.json'), 'utf8')); } catch (x) {}
    if(title != null){ const t = String(title).trim(); if(t){ meta.title = t; if(full) full.title = t; } }
    if(pinned != null){ meta.pinned = !!pinned; if(full) full.pinned = !!pinned; }
    if(full){ try { fs.writeFileSync(path.join(dir, String(id) + '.json'), JSON.stringify(full)); } catch (x) {} }
    writeChatIndex(dir, idx);
    return { ok: true, conversation: meta };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Search stored conversations by term overlap (offline, deterministic). scopes = array of scope
// keys to search; omitted → every scope. Returns ranked matches with a best-matching snippet —
// used by both the history search box and the assistant's memory recall.
ipcMain.handle('lds:chat-search', (e, { query, scopes, wholeWords }) => {
  try {
    const q = String(query || '').toLowerCase().trim();
    const terms = Array.from(new Set(q.split(/\s+/).filter(t => t.length >= 2)));
    if(!terms.length) return { ok: true, matches: [] };
    const root = chatsDir(); if(!fs.existsSync(root)) return { ok: true, matches: [] };
    let dirs;
    if(Array.isArray(scopes) && scopes.length){ dirs = scopes.filter(Boolean).map(s => chatScopeDir(s)); }
    else { dirs = fs.readdirSync(root).map(h => path.join(root, h)); }
    const matches = [], seen = {};
    dirs.forEach(dir => {
      if(seen[dir]) return; seen[dir] = 1;
      const idx = readChatIndex(dir);
      (idx.conversations || []).forEach(meta => {
        let full = null; try { full = JSON.parse(fs.readFileSync(path.join(dir, meta.id + '.json'), 'utf8')); } catch (x) { return; }
        const msgs = Array.isArray(full.messages) ? full.messages : [];
        // 2.9.7 (#244) — memory recall matches WHOLE words only ("rate" never hits "separate"); the history
        // search box keeps matching parts of words as you type. Only what the operator and Claude said is searched.
        const said = msgs.filter(m => m && (m.role === 'user' || m.role === 'assistant' || m.role === 'compact') && !m.failed);
        const hay = (String(meta.title || '') + ' ' + said.map(m => (m && m.text) || '').join(' ')).toLowerCase();
        const count = (txt, t) => { if (wholeWords) { const re = new RegExp('(^|[^a-z0-9])' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[^a-z0-9])', 'g'); return (txt.match(re) || []).length; } let i = txt.indexOf(t), n = 0; while(i >= 0){ n++; i = txt.indexOf(t, i + t.length); } return n; };
        let score = 0, hitTerms = 0;
        terms.forEach(t => { const n = count(hay, t); if(n){ hitTerms++; score += n; } });
        if(score > 0){
          score += hitTerms * 5;   // reward matching MORE of the distinct query terms, not just many hits of one
          let best = '', bestHits = -1, bestRole = '';
          said.forEach(m => { const txt = String((m && m.text) || ''), low = txt.toLowerCase(); let h = 0; terms.forEach(t => { if(count(low, t) > 0) h++; }); if(h > bestHits){ bestHits = h; best = txt; bestRole = m.role === 'user' ? 'user' : 'assistant'; } });
          matches.push({ scope: full.scope || idx.scope || '', scopeName: full.scopeName || idx.scopeName || '', id: meta.id, title: meta.title || '', updatedAt: meta.updatedAt || 0, score, hitTerms, role: bestRole, snippet: chatSnippet(best, terms) });
        }
      });
    });
    matches.sort((a, b) => b.score - a.score || (b.updatedAt || 0) - (a.updatedAt || 0));
    return { ok: true, matches: matches.slice(0, 12) };
  } catch (err) { return { ok: false, error: String((err && err.message) || err), matches: [] }; }
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

// ---- AI assistant (Claude Code CLI / Anthropic API) --------------------------
ipcMain.handle('lds:ai-status', () => ai.status());
ipcMain.handle('lds:ai-set-key', (e, { key }) => ai.setKey(key));
ipcMain.handle('lds:ai-set-mode', (e, { mode }) => ai.setMode(mode));
ipcMain.handle('lds:ai-set-model', (e, { model }) => ai.setModel(model));
ipcMain.handle('lds:ai-set-effort', (e, { level }) => ai.setEffort(level));
ipcMain.handle('lds:ai-extract', (e, opts) => ai.extract(opts || {}));
ipcMain.handle('lds:ai-chat', (e, opts) => ai.chat(opts || {}));
ipcMain.handle('lds:ai-chat-cancel', (e, { token }) => ai.cancelChat(token));
ipcMain.handle('lds:ai-login', () => ai.login());
ipcMain.handle('lds:ai-logout', () => ai.logout());

app.whenReady().then(() => {
  registerAppProtocol();
  setTimeout(pruneOcrCache, 30000);
  Menu.setApplicationMenu(null); // no default menu bar
  ai.init(app);
  createWindow();
  setupAutoUpdates();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
