// Secure bridge between the renderer (index.html) and the Electron main process.
// contextIsolation is on, so the page can't touch Node/Electron directly — we
// expose only a tiny, explicit surface on window.ldsShell.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('ldsShell', {
  // Ask the desktop shell to raise THIS window to the front of the screen.
  // Used when a calendar event is clicked: the main window has already been
  // navigated to the loan; this brings it forward over the calendar pop-out
  // (and anything else) so the user sees it immediately.
  focusMain: () => { try { ipcRenderer.send('lds:focus-main'); } catch (e) {} },
});
