const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('api', {
  getSettings: () => ipcRenderer.invoke('transport:getSettings'),
  saveSettings: input => ipcRenderer.invoke('transport:saveSettings', input),
  testConnection: () => ipcRenderer.invoke('transport:testConnection'),
  onSettingsChanged: () => () => {},
  connectionChanged: async () => {},
  closeConnection: async () => {},
})
