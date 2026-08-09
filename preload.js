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
  // Set the app's zoom factor (clamped 0.25–3.0 in main); resolves the value applied.
  setZoom: (factor) => ipcRenderer.invoke('lds:set-zoom', factor),
  // Current zoom factor of this window.
  getZoom: () => ipcRenderer.invoke('lds:get-zoom'),

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
});
