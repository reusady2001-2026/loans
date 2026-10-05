// Secure bridge between the renderer (index.html) and the Electron main process.
// contextIsolation is on, so the page can't touch Node/Electron directly — we
// expose only a tiny, explicit surface on window.ldsShell.
const { contextBridge, ipcRenderer } = require('electron');

// 2.9.7 (#60) — the app moved from a file address to lds://app/. The settings saved at the old address are copied in
// once, before the page reads anything (only keys this address doesn't have yet are copied).
try {
  if (location.protocol === 'lds:' && !localStorage.getItem('lds.originMigrated')) {
    const dump = ipcRenderer.sendSync('lds:legacy-storage');
    let n = 0;
    if (dump && typeof dump === 'object') Object.keys(dump).forEach((k) => { if (localStorage.getItem(k) == null && typeof dump[k] === 'string') { localStorage.setItem(k, dump[k]); n++; } });
    localStorage.setItem('lds.originMigrated', new Date().toISOString());
    ipcRenderer.send('lds:legacy-storage-done', n);
  }
} catch (e) {}

contextBridge.exposeInMainWorld('ldsShell', {
  // Marks this as the desktop build (the renderer checks it to show/hide the
  // Data menu, which is desktop-only).
  isDesktop: true,

  // Ask the desktop shell to raise THIS window to the front of the screen.
  // Used when a calendar event is clicked: the main window has already been
  // navigated to the loan; this brings it forward over the calendar pop-out
  // (and anything else) so the user sees it immediately.
  focusMain: () => { try { ipcRenderer.send('lds:focus-main'); } catch (e) {} },

  // ---- 2.9.7 (#64) — loan records on disk (userData/loans.json), read/written synchronously ----
  loansReadSync: () => ipcRenderer.sendSync('lds:loans-read-sync'),
  loansWriteSync: (json) => ipcRenderer.sendSync('lds:loans-write-sync', json),

  // ---- Backup / Restore ----
  // Manual backup → native Save dialog; main adds every property file and chat. Resolves {ok,path,name,fileCount} | {canceled} | {ok:false,error}.
  backupSave: (json, defaultName) => ipcRenderer.invoke('lds:backup-save', { json, defaultName }),
  // Manual restore → native Open dialog. Resolves {ok,name,content,full,token} | {canceled} | {ok:false,error}.
  backupOpen: () => ipcRenderer.invoke('lds:backup-open'),
  // Silent full snapshot into the managed backups folder. kind = why: 'autobackup' | 'before-restore' | 'before-import' | ….
  autoBackupWrite: (json, kind) => ipcRenderer.invoke('lds:autobackup-write', { json, kind }),
  // List snapshots (newest first): [{name,kind,reason,reasonLabel,mtime,loanCount,exportedAt,fileCount}].
  autoBackupList: () => ipcRenderer.invoke('lds:autobackup-list'),
  // Read one snapshot by name. Resolves {ok,content} | {ok:false,error}.
  autoBackupRead: (name) => ipcRenderer.invoke('lds:autobackup-read', { name }),
  // 2.9.7 (#9) — put a full backup's files back (token from backupOpen / autoBackupRead). Resolves {ok,fileCount} | {ok:false,error}.
  fullBackupRestore: (token) => ipcRenderer.invoke('lds:fullbackup-restore', { token }),
  // 2.9.7 (#9) — called whenever a property file or a chat is saved, moved or removed (so a snapshot follows).
  onDataChanged: (cb) => { try { ipcRenderer.on('lds:data-changed', () => { try { cb(); } catch (e) {} }); } catch (e) {} },
  // 2.9.7 (#256) — 1-month Term SOFR (today + every day since `since`) read by the main process. {ok,live:{value,date},history} | {ok:false,error}
  ratesTermSofr: (opts) => ipcRenderer.invoke('lds:rates-termsofr', opts || {}),
  // Reveal the backups folder in File Explorer.
  openBackupsFolder: () => ipcRenderer.invoke('lds:backups-open-folder'),
  // Save binary data (base64) via a native Save dialog — used for the Excel export.
  saveBinary: (base64, defaultName, ext, label) => ipcRenderer.invoke('lds:file-save-binary', { base64, defaultName, ext, label }),

  // ---- Display scale ----
  // Set the app's zoom factor (clamped 0.5–2.0 in main); resolves the value applied.
  setZoom: (factor) => ipcRenderer.invoke('lds:set-zoom', factor),
  // Current zoom factor of this window.
  getZoom: () => ipcRenderer.invoke('lds:get-zoom'),

  // ---- Window controls (custom title bar draws its own min / max / close) ----
  winMinimize: () => ipcRenderer.send('lds:win-minimize'),
  winMaximizeToggle: () => ipcRenderer.send('lds:win-maximize-toggle'),
  winClose: () => ipcRenderer.send('lds:win-close'),
  winIsMaximized: () => ipcRenderer.invoke('lds:win-is-maximized'),
  onWinState: (cb) => {
    const fn = (_e, payload) => { try { cb(payload); } catch (e) {} };
    ipcRenderer.on('lds:win-state', fn);
    return () => { try { ipcRenderer.removeListener('lds:win-state', fn); } catch (e) {} };
  },

  // ---- Auto-update ----
  // Current app version (e.g. "1.6.0").
  getVersion: () => ipcRenderer.invoke('lds:app-version'),
  // Manually ask GitHub whether a newer release exists (auto-downloads if so).
  checkForUpdates: () => ipcRenderer.send('lds:update-check'),
  // Quit and install a downloaded update.
  installUpdate: () => ipcRenderer.send('lds:update-install'),
  // Subscribe to update status: {state:'checking'|'available'|'downloading'|'ready'|'current'|'error', version?, percent?, message?}.
  // Returns an unsubscribe function.
  onUpdateStatus: (cb) => {
    const fn = (_e, payload) => { try { cb(payload); } catch (e) {} };
    ipcRenderer.on('lds:update-status', fn);
    return () => { try { ipcRenderer.removeListener('lds:update-status', fn); } catch (e) {} };
  },

  // ---- Tear-off tool panels (a tab popped into its own window) ----
  // Open a tool ('calendar' | 'underwriting') as its own window (index.html?panel=…).
  openPanelWindow: (kind, state) => { try { return ipcRenderer.invoke('lds:open-panel-invoke', kind, state || null); } catch (e) { return Promise.resolve({ ok: false, error: String(e) }); } },   // 2.9.7 (#43) → {ok} | {ok:false,error}
  // 2.9.7 (#43) — a pop-out window failed to open or load: { kind, error }.
  onPanelError: (cb) => { try { ipcRenderer.on('lds:panel-error', (_e, p) => { try { cb(p); } catch (x) {} }); } catch (e) {} },
  // Close a panel window (used when its tab is closed from the main strip).
  closePanelWindow: (kind) => { try { ipcRenderer.send('lds:close-panel', kind); } catch (e) {} },
  // Bring an already-open panel window to the front.
  focusPanel: (kind) => { try { ipcRenderer.send('lds:focus-panel', kind); } catch (e) {} },
  // From inside a panel window: dock this tool back into the main window's strip.
  dockPanel: (kind, state) => { try { ipcRenderer.send('lds:dock-panel', kind, state || null); } catch (e) {} },
  // 2.9.8 — main window → a popped-out window: { select: propKey } etc. And the window's side of it.
  panelCommand: (kind, payload) => { try { ipcRenderer.send('lds:panel-command', kind, payload || {}); } catch (e) {} },
  onPanelCommand: (cb) => { try { ipcRenderer.on('lds:panel-command', (_e, p) => { try { cb(p || {}); } catch (x) {} }); } catch (e) {} },
  // Main window: a panel window asked to dock back. cb(kind). Returns unsubscribe.
  onDockPanel: (cb) => {
    const fn = (_e, kind, state) => { try { cb(kind, state || null); } catch (e) {} };
    ipcRenderer.on('lds:dock-panel', fn);
    return () => { try { ipcRenderer.removeListener('lds:dock-panel', fn); } catch (e) {} };
  },
  // Main window: a panel window was closed (docked or by the user). cb(kind).
  onPanelClosed: (cb) => {
    const fn = (_e, kind) => { try { cb(kind); } catch (e) {} };
    ipcRenderer.on('lds:panel-closed', fn);
    return () => { try { ipcRenderer.removeListener('lds:panel-closed', fn); } catch (e) {} };
  },

  // ---- AI assistant (Claude Code subscription via the CLI, or an API key) ----
  // Connection status: {cli:{available,version}, apiKey:{configured}, mode}.
  aiStatus: () => ipcRenderer.invoke('lds:ai-status'),
  // Store / clear the Anthropic API key (fallback path). Resolves {configured}.
  aiSetKey: (key) => ipcRenderer.invoke('lds:ai-set-key', { key }),
  // Choose the path: 'auto' | 'cli' | 'api'. Resolves {mode}.
  aiSetMode: (mode) => ipcRenderer.invoke('lds:ai-set-mode', { mode }),
  // Choose the model the assistant uses (a MODELS key). Resolves {model}.
  aiSetModel: (model) => ipcRenderer.invoke('lds:ai-set-model', { model }),
  // Choose the reasoning effort ('low'|'medium'|'high'|'xhigh'|'max'). Resolves {effort}.
  aiSetEffort: (level) => ipcRenderer.invoke('lds:ai-set-effort', { level }),

  // ---- Property documents (per-property file store) ----
  // Save an original file + its extracted text under a property. Resolves {ok,file}.
  docSave: (payload) => ipcRenderer.invoke('lds:doc-save', payload),
  // List one property's saved files (metadata only). Resolves {ok,propName,files}.
  docList: (propKey) => ipcRenderer.invoke('lds:doc-list', { propKey }),
  // A light index of every property that has documents (propKey → filenames). Resolves {ok,byKey}.
  docIndex: () => ipcRenderer.invoke('lds:doc-index'),
  log: (line) => { try { ipcRenderer.send('lds:log', String(line || '').slice(0, 2000)); } catch (e) {} },   // 2.9.8 — a line in userData/logs/main.log
  // The concatenated extracted text of a property's documents (bounded). Resolves {ok,text,files}.
  docText: (propKey) => ipcRenderer.invoke('lds:doc-text', { propKey }),
  // Read one original file back (base64) to open/export it. Resolves {ok,base64,name,type}.
  docTextPart: (opts) => ipcRenderer.invoke('lds:doc-text-part', opts || {}),   // 2.9.7 — {propKey,name|id,part,partSize} → {ok,name,text,part,parts,chars,readable}
  docRead: (propKey, id) => ipcRenderer.invoke('lds:doc-read', { propKey, id }),
  readqAdd: (o) => ipcRenderer.invoke('lds:readq-add', o || {}),          // 2.9.7 (#250) — the reading queue (Documents)
  readqList: () => ipcRenderer.invoke('lds:readq-list'),
  readqBytes: (id) => ipcRenderer.invoke('lds:readq-bytes', { id }),
  readqDone: (id) => ipcRenderer.invoke('lds:readq-done', { id }),
  docSaveQueued: (o) => ipcRenderer.invoke('lds:doc-save-queued', o || {}),
  filePath: (file) => { try { return require('electron').webUtils.getPathForFile(file) || ''; } catch (e) { return ''; } },   // where a dropped / chosen file is on disk
  ocrCacheGet: (sha) => ipcRenderer.invoke('lds:ocr-cache-get', { sha }),             // 2.9.7 (#250) — pages already read by OCR
  ocrCachePut: (o) => ipcRenderer.invoke('lds:ocr-cache-put', o || {}),
  // Delete one saved file. Resolves {ok}.
  docDelete: (propKey, id) => ipcRenderer.invoke('lds:doc-delete', { propKey, id }),
  docCopy: (o) => ipcRenderer.invoke('lds:doc-copy', o || {}),   // 2.9.8
  // 2.9.7 (#37) — change a saved document's type. → {ok,file} | {ok:false,error}
  docSetRole: (propKey, id, role) => ipcRenderer.invoke('lds:doc-set-role', { propKey, id, role }),
  // Move a property's whole document folder when its key changes (an address edit). Resolves {ok,moved,reason?}.
  docMove: (fromKey, toKey, propName, opts) => ipcRenderer.invoke('lds:doc-move', { fromKey, toKey, propName, merge: !!(opts && opts.merge) }),
  // 2.9.7 (#40, #216) — a renamed property's chats move with it. {fromScope,toScope,scopeName} → {ok,moved,count}
  chatMove: (payload) => ipcRenderer.invoke('lds:chat-move', payload),
  // Reveal the documents folder in the OS file manager.
  openDocsFolder: () => ipcRenderer.invoke('lds:docs-open-folder'),
  propPurge: (payload) => ipcRenderer.invoke('lds:prop-purge', payload),        // {propKey} → {ok,removed} | {ok:false,notArchived|failed,error} — permanent delete of an ARCHIVED property's files
  // Assistant chat history (per-property + portfolio), persisted on disk.
  chatSave: (payload) => ipcRenderer.invoke('lds:chat-save', payload),       // {scope,scopeName,id?,title?,messages,files?,pinned?} → {ok,conversation}
  chatList: ({ scope }) => ipcRenderer.invoke('lds:chat-list', { scope }),    // → {ok,scopeName,conversations:[meta]}
  chatListAll: () => ipcRenderer.invoke('lds:chat-list-all'),   // 2.9.7 (#97) → {ok,conversations:[meta + scope, scopeName]}
  chatRead: ({ scope, id }) => ipcRenderer.invoke('lds:chat-read', { scope, id }), // → {ok,conversation}
  chatDelete: ({ scope, id }) => ipcRenderer.invoke('lds:chat-delete', { scope, id }),
  chatMeta: ({ scope, id, title, pinned }) => ipcRenderer.invoke('lds:chat-meta', { scope, id, title, pinned }), // rename/pin
  chatSearch: ({ query, scopes, wholeWords }) => ipcRenderer.invoke('lds:chat-search', { query, scopes, wholeWords: !!wholeWords }), // → {ok,matches:[{scope,scopeName,id,title,updatedAt,score,hitTerms,role,snippet}]}
  // Run a structured extraction: {instruction, schema, input, model?, timeoutMs?} → {ok,data,via,error}.
  aiExtract: (opts) => ipcRenderer.invoke('lds:ai-extract', opts),
  // Free-form chat (no tools): {system, prompt, model?, timeoutMs?, cancelToken?} → {ok,text,via,error}.
  aiChat: (opts) => ipcRenderer.invoke('lds:ai-chat', opts),
  // Cancel an in-flight aiChat by its cancelToken (the Stop button). Resolves {ok}.
  aiChatCancel: (token) => ipcRenderer.invoke('lds:ai-chat-cancel', { token }),
  // Browser OAuth sign-in to the Claude subscription (`claude setup-token`) → {ok,error}.
  aiLogin: () => ipcRenderer.invoke('lds:ai-login'),
  aiLogout: () => ipcRenderer.invoke('lds:ai-logout'),
});
