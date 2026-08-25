// Secure bridge between the renderer (index.html) and the Electron main process.
// contextIsolation is on, so the page can't touch Node/Electron directly — we
// expose only a tiny, explicit surface on window.ldsShell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ldsShell', {
  // Marks this as the desktop build (the renderer checks it to show/hide the
  // Data menu, which is desktop-only).
  isDesktop: true,

  // Ask the desktop shell to raise THIS window to the front of the screen.
  // Used when a calendar event is clicked: the main window has already been
  // navigated to the loan; this brings it forward over the calendar pop-out
  // (and anything else) so the user sees it immediately.
  focusMain: () => { try { ipcRenderer.send('lds:focus-main'); } catch (e) {} },

  // ---- Backup / Restore ----
  // Manual backup → native Save dialog. Resolves {ok,path,name} | {canceled} | {ok:false,error}.
  backupSave: (json, defaultName) => ipcRenderer.invoke('lds:backup-save', { json, defaultName }),
  // Manual restore → native Open dialog. Resolves {ok,name,content} | {canceled} | {ok:false,error}.
  backupOpen: () => ipcRenderer.invoke('lds:backup-open'),
  // Silent snapshot into the managed backups folder. kind: 'auto' | 'before-restore'.
  autoBackupWrite: (json, kind) => ipcRenderer.invoke('lds:autobackup-write', { json, kind }),
  // List snapshots (newest first): [{name,kind,mtime,loanCount,exportedAt}].
  autoBackupList: () => ipcRenderer.invoke('lds:autobackup-list'),
  // Read one snapshot by name. Resolves {ok,content} | {ok:false,error}.
  autoBackupRead: (name) => ipcRenderer.invoke('lds:autobackup-read', { name }),
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
  openPanelWindow: (kind) => { try { ipcRenderer.send('lds:open-panel', kind); } catch (e) {} },
  // Close a panel window (used when its tab is closed from the main strip).
  closePanelWindow: (kind) => { try { ipcRenderer.send('lds:close-panel', kind); } catch (e) {} },
  // Bring an already-open panel window to the front.
  focusPanel: (kind) => { try { ipcRenderer.send('lds:focus-panel', kind); } catch (e) {} },
  // From inside a panel window: dock this tool back into the main window's strip.
  dockPanel: (kind) => { try { ipcRenderer.send('lds:dock-panel', kind); } catch (e) {} },
  // Main window: a panel window asked to dock back. cb(kind). Returns unsubscribe.
  onDockPanel: (cb) => {
    const fn = (_e, kind) => { try { cb(kind); } catch (e) {} };
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
  // Run a structured extraction: {instruction, schema, input, model?, timeoutMs?} → {ok,data,via,error}.
  aiExtract: (opts) => ipcRenderer.invoke('lds:ai-extract', opts),
});
