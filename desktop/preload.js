const { contextBridge, ipcRenderer } = require('electron');

// Neutral bridge exposed to the web UI. Its presence tells the app it is
// running inside the desktop client (which can do native remote control).
contextBridge.exposeInMainWorld('__host', {
  desktop: true,

  // Secure-login overlay toggle (existing).
  onShowSecureLogin: (callback) => ipcRenderer.on('show-secure-login', callback),
  removeShowSecureLogin: (callback) => ipcRenderer.removeListener('show-secure-login', callback),

  // Remote control. `remoteControlAvailable()` is true only when the native
  // input module loaded successfully.
  remoteControlAvailable: () => ipcRenderer.sendSync('remote-control-available'),
  setRemoteControl: (enabled) => ipcRenderer.send('remote-control-enabled', !!enabled),
  sendRemoteInput: (event) => ipcRenderer.send('remote-input', event),

  // Sharing is auto-accepted (no blocking consent dialog — see SharePanel),
  // so a native OS notification is the only thing that tells the person at
  // this machine someone just connected.
  notifyViewerConnected: () => ipcRenderer.send('viewer-connected'),
});
