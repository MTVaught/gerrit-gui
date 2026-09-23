import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api.ts'
import type { TabId, UpdateState } from '../shared/types.ts'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  testConnection: () => ipcRenderer.invoke('gerrit:testConnection'),
  fetchDashboard: () => ipcRenderer.invoke('gerrit:fetchDashboard'),
  fetchChange: (id) => ipcRenderer.invoke('gerrit:fetchChange', id),
  act: (action) => ipcRenderer.invoke('gerrit:act', action),
  suggestReviewers: (id, q) => ipcRenderer.invoke('gerrit:suggestReviewers', id, q),
  suggestAccounts: (q) => ipcRenderer.invoke('gerrit:suggestAccounts', q),
  lookupAccounts: (keys) => ipcRenderer.invoke('gerrit:lookupAccounts', keys),
  openChange: (link) => ipcRenderer.invoke('gerrit:openChange', link),
  changeUrl: (link) => ipcRenderer.invoke('gerrit:changeUrl', link),
  inspectChange: (id) => ipcRenderer.invoke('gerrit:inspectChange', id),
  openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),
  getUi: () => ipcRenderer.invoke('ui:get'),
  setCompact: (on) => ipcRenderer.invoke('ui:setCompact', on),
  setBadge: (payload) => ipcRenderer.send('ui:badge', payload),
  onCompactChanged: (cb) => subscribe<[boolean]>('app:compact', cb),
  onSettingsChanged: (cb) => subscribe<[]>('app:settings', cb),
  onRefreshRequested: (cb) => subscribe<[]>('app:refresh', cb),
  onTabRequested: (cb) => subscribe<[TabId]>('app:tab', cb),
  openConnection: () => ipcRenderer.invoke('connection:open'),
  connectionChanged: () => ipcRenderer.invoke('connection:changed'),
  closeConnection: () => ipcRenderer.invoke('connection:close'),
  onConnectionChanged: (cb) => subscribe<[]>('app:connection', cb),
  getUpdateState: () => ipcRenderer.invoke('update:get'),
  checkForUpdate: () => ipcRenderer.invoke('update:check'),
  downloadUpdate: () => ipcRenderer.invoke('update:download'),
  installUpdate: (confirm) => ipcRenderer.invoke('update:install', confirm),
  openReleaseNotes: () => ipcRenderer.invoke('update:openReleaseNotes'),
  onUpdateState: (cb) => subscribe<[UpdateState]>('app:update', cb),
}

contextBridge.exposeInMainWorld('api', api)
