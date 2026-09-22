// Electron main process — wraps the offline Loan Debt Service Hub in a desktop
// window. The whole UI/engine lives in index.html; this just hosts it.
const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
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

// ---- Tear-off tool panels (Calendar / Underwriting) as their own windows ------
// A tab popped out of the main window becomes a real BrowserWindow that loads the
// SAME index.html with ?panel=<kind>, so it renders just that one tool (shared
// localStorage keeps its data consistent with the main window). Docking sends the
// tab back to the main strip and closes the panel window.
const panelWindows = {};   // kind -> BrowserWindow
function panelTitle(kind) { return kind === 'calendar' ? 'Maturity & Reset Calendar' : 'Underwriting & Sizing'; }
ipcMain.on('lds:open-panel', (e, kind) => {
  if (kind !== 'calendar' && kind !== 'underwriting') return;
  const existing = panelWindows[kind];
  if (existing && !existing.isDestroyed()) { existing.show(); existing.focus(); return; }
  const win = new BrowserWindow({
    width: kind === 'calendar' ? 1200 : 1100, height: 860, minWidth: 720, minHeight: 520,
    backgroundColor: '#f6f8f2', title: panelTitle(kind), autoHideMenuBar: true, titleBarStyle: 'hidden',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, spellcheck: false },
  });
  panelWindows[kind] = win;
  win.loadFile(path.join(__dirname, 'index.html'), { query: { panel: kind } });
  const sendState = () => { try { win.webContents.send('lds:win-state', { maximized: win.isMaximized() }); } catch (e2) {} };
  win.on('maximize', sendState);
  win.on('unmaximize', sendState);
  win.on('closed', () => {
    delete panelWindows[kind];
    try { if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('lds:panel-closed', kind); } catch (e2) {}
  });
});
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

// ---- Property documents (per-property file store) ---------------------------
// Files the operator attaches to a property are saved under userData/documents/<hash>/
// so they persist across restarts and updates (data lives beside the backups, never
// touched by an update) and the assistant can reuse them without re-uploading. Each
// property folder holds the ORIGINAL files, a <id>.txt cache of the extracted text
// (what the assistant actually reads), and an index.json:
//   { propKey, propName, files: [{ id, stored, name, size, type, savedAt, textLen }] }
const DOC_TEXT_CAP = 300000;   // max extracted text handed to the assistant per property, per turn
function documentsDir(){ return path.join(app.getPath('userData'), 'documents'); }
function propDir(propKey){ const h = crypto.createHash('sha1').update(String(propKey || '')).digest('hex').slice(0, 16); return path.join(documentsDir(), h); }
function readDocIndex(dir){ try { const j = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8')); return (j && typeof j === 'object') ? j : {}; } catch (e) { return {}; } }
function writeDocIndex(dir, idx){ try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(idx)); } catch (e) {} }
function docSafeExt(name){ const e = path.extname(String(name || '')).replace(/[^.a-z0-9]/gi, ''); return e.slice(0, 12); }
function pubFile(f){ return { id: f.id, name: f.name, size: f.size, type: f.type, role: f.role || '', savedAt: f.savedAt, textLen: f.textLen || 0, sha: f.sha || '' }; }

// Save one original file (base64) + its extracted text under a property. Replaces an
// existing file of the same name for that property. `role` tags what the file is
// (e.g. "t12") so a consumer can find it again without guessing from the name.
ipcMain.handle('lds:doc-save', (e, { propKey, propName, name, base64, text, type, role }) => {
  try {
    if(!propKey || !name || !base64) return { ok: false, error: 'missing fields' };
    const dir = propDir(propKey); fs.mkdirSync(dir, { recursive: true });
    const idx = readDocIndex(dir); idx.propKey = propKey; idx.propName = propName || idx.propName || ''; idx.files = Array.isArray(idx.files) ? idx.files : [];
    const buf = Buffer.from(base64, 'base64');
    const sha = crypto.createHash('sha1').update(buf).digest('hex');
    // Exact-duplicate guard: the same bytes already stored under this role is not re-saved (a second
    // identical T12 shouldn't create a phantom "newer" statement). The caller is told it was a dup.
    const already = idx.files.find(f => f.sha === sha && (f.role || '') === (role || ''));
    if(already){ return { ok: true, duplicate: true, file: pubFile(already) }; }
    const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const stored = id + docSafeExt(name);
    fs.writeFileSync(path.join(dir, stored), buf);
    const t = String(text || ''); if(t){ try { fs.writeFileSync(path.join(dir, id + '.txt'), t, 'utf8'); } catch (err) {} }
    // Replace any existing file with the same original name.
    idx.files.filter(f => f.name === String(name)).forEach(f => { try { fs.unlinkSync(path.join(dir, f.stored)); } catch (x) {} try { fs.unlinkSync(path.join(dir, f.id + '.txt')); } catch (x) {} });
    idx.files = idx.files.filter(f => f.name !== String(name));
    const entry = { id, stored, name: String(name), size: buf.length, type: type || '', role: role || '', savedAt: Date.now(), textLen: t.length, sha };
    idx.files.push(entry); writeDocIndex(dir, idx);
    return { ok: true, file: pubFile(entry) };
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
    const files = Array.isArray(idx.files) ? idx.files : [];
    let out = '', used = [], truncated = false;
    for(const f of files){
      let t = ''; try { t = fs.readFileSync(path.join(dir, f.id + '.txt'), 'utf8'); } catch (x) { t = ''; }
      if(!t) continue;
      if(out.length + t.length > DOC_TEXT_CAP){ t = t.slice(0, Math.max(0, DOC_TEXT_CAP - out.length)); truncated = true; }
      out += '<file name="' + String(f.name).replace(/"/g, '') + '">\n' + t + '\n</file>\n\n';
      used.push(f.name);
      if(truncated) break;
    }
    return { ok: true, text: out.trim(), files: used, propName: idx.propName || '', truncated };
  } catch (err) { return { ok: false, error: String((err && err.message) || err), text: '', files: [] }; }
});
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
ipcMain.handle('lds:doc-move', (e, { fromKey, toKey, propName }) => {
  try {
    if(!fromKey || !toKey || fromKey === toKey) return { ok: true, moved: false, reason: 'same key' };
    const src = propDir(fromKey), dst = propDir(toKey);
    const srcIdx = readDocIndex(src);
    if(!fs.existsSync(src) || !(Array.isArray(srcIdx.files) && srcIdx.files.length)) return { ok: true, moved: false, reason: 'nothing to move' };
    const dstIdx = readDocIndex(dst);
    if(fs.existsSync(dst) && Array.isArray(dstIdx.files) && dstIdx.files.length) return { ok: true, moved: false, reason: 'target exists' };
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

// Create or update one conversation (upsert by id). A blank title is auto-filled from the first
// user message. Returns the conversation's metadata (with its assigned id).
ipcMain.handle('lds:chat-save', (e, { scope, scopeName, id, title, messages, files, pinned }) => {
  try {
    if(!scope) return { ok: false, error: 'missing scope' };
    const dir = chatScopeDir(scope); fs.mkdirSync(dir, { recursive: true });
    const idx = readChatIndex(dir); idx.scope = scope; idx.scopeName = scopeName || idx.scopeName || ''; idx.conversations = Array.isArray(idx.conversations) ? idx.conversations : [];
    const msgs = Array.isArray(messages) ? messages.filter(m => m && m.text) : [];
    const now = Date.now();
    const existing = id ? idx.conversations.find(c => c.id === id) : null;
    const cid = (id && existing) ? id : ('c' + now.toString(36) + Math.random().toString(36).slice(2, 6));
    let ttl = String(title || '').trim();
    if(!ttl){ const firstU = msgs.find(m => m.role === 'user' && m.text); ttl = firstU ? String(firstU.text).replace(/\s+/g, ' ').trim().slice(0, 64) : 'New conversation'; }
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
// Read one conversation back in full (messages + files) — to reopen and continue it.
ipcMain.handle('lds:chat-read', (e, { scope, id }) => {
  try { const c = JSON.parse(fs.readFileSync(path.join(chatScopeDir(scope), String(id) + '.json'), 'utf8')); return { ok: true, conversation: c }; }
  catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Delete one conversation (file + index entry).
ipcMain.handle('lds:chat-delete', (e, { scope, id }) => {
  try { const dir = chatScopeDir(scope), idx = readChatIndex(dir);
    try { fs.unlinkSync(path.join(dir, String(id) + '.json')); } catch (x) {}
    idx.conversations = (idx.conversations || []).filter(c => c.id !== id); writeChatIndex(dir, idx);
    return { ok: true };
  } catch (err) { return { ok: false, error: String((err && err.message) || err) }; }
});
// Rename and/or pin one conversation (metadata only — does not bump updatedAt / reorder).
ipcMain.handle('lds:chat-meta', (e, { scope, id, title, pinned }) => {
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
ipcMain.handle('lds:chat-search', (e, { query, scopes }) => {
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
        const hay = (String(meta.title || '') + ' ' + msgs.map(m => (m && m.text) || '').join(' ')).toLowerCase();
        let score = 0, hitTerms = 0;
        terms.forEach(t => { let i = hay.indexOf(t), n = 0; while(i >= 0){ n++; i = hay.indexOf(t, i + t.length); } if(n){ hitTerms++; score += n; } });
        if(score > 0){
          score += hitTerms * 5;   // reward matching MORE of the distinct query terms, not just many hits of one
          let best = '', bestHits = -1;
          msgs.forEach(m => { const txt = String((m && m.text) || ''), low = txt.toLowerCase(); let h = 0; terms.forEach(t => { if(low.indexOf(t) >= 0) h++; }); if(h > bestHits){ bestHits = h; best = txt; } });
          matches.push({ scope: full.scope || idx.scope || '', scopeName: full.scopeName || idx.scopeName || '', id: meta.id, title: meta.title || '', updatedAt: meta.updatedAt || 0, score, hitTerms, snippet: chatSnippet(best, terms) });
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
