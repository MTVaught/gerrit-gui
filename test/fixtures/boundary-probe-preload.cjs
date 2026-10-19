// Deliberately exposes arbitrary IPC only in the unregistered adversarial test window.
const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('boundaryProbe', {
  invoke: (channel, ...args) => ipcRenderer.invoke(channel, ...args),
  send: (channel, ...args) => ipcRenderer.send(channel, ...args),
})
