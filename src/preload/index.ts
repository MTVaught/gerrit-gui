import { contextBridge, ipcRenderer } from 'electron'
import type { Api } from '../shared/api.ts'
import type { NativeReviewRequest, TabId, UpdateState } from '../shared/types.ts'

function subscribe<T extends unknown[]>(channel: string, cb: (...args: T) => void): () => void {
  const listener = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => cb(...(args as T))
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api: Api = {
  getWindowContext: () => ipcRenderer.invoke('window:context'),
  openReviewWindow: (link, subject) => ipcRenderer.invoke('window:openReview', link, subject),
  closeReviewWindow: () => ipcRenderer.invoke('window:close'),
  onReviewCloseRequested: (cb) => subscribe('app:closeReview', cb),
  replyReviewClose: (token, allowed) => ipcRenderer.send('window:closeReply', token, allowed),
  onReviewChanged: (cb) => subscribe('app:reviewChanged', cb),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  patchSettings: (input) => ipcRenderer.invoke('settings:patch', input),
  getReviewPreferences: (legacy) => ipcRenderer.invoke('preferences:get', legacy),
  patchReviewPreferences: (patch) => ipcRenderer.invoke('preferences:patch', patch),
  onReviewPreferencesChanged: (cb) => subscribe('app:preferences', cb),
  testConnection: () => ipcRenderer.invoke('gerrit:testConnection'),
  fetchDashboard: () => ipcRenderer.invoke('gerrit:fetchDashboard'),
  fetchChange: (id) => ipcRenderer.invoke('gerrit:fetchChange', id),
  reviewBlame: (link, path) => ipcRenderer.invoke('gerrit:reviewBlame', link, path),
  previewReviewFix: (id, patchSet, fix) => ipcRenderer.invoke('gerrit:previewReviewFix', id, patchSet, fix),
  applyProvidedReviewFix: (id, patchSet, fix) => ipcRenderer.invoke('gerrit:applyProvidedReviewFix', id, patchSet, fix),
  reviewFiles: (link) => ipcRenderer.invoke('gerrit:reviewFiles', link),
  reviewDiff: (link, path) => ipcRenderer.invoke('gerrit:reviewDiff', link, path),
  reviewPatchSets: (id) => ipcRenderer.invoke('gerrit:reviewPatchSets', id),
  reviewReviewedFiles: (link) => ipcRenderer.invoke('gerrit:reviewReviewedFiles', link),
  setReviewFileReviewed: (link, path, reviewed) => ipcRenderer.invoke('gerrit:setReviewFileReviewed', link, path, reviewed),
  reviewCommentPositions: (link) => ipcRenderer.invoke('gerrit:reviewCommentPositions', link),
  reviewDiscussion: (id) => ipcRenderer.invoke('gerrit:reviewDiscussion', id),
  saveReviewDraft: (id, patchSet, input, expected) => ipcRenderer.invoke('gerrit:saveReviewDraft', id, patchSet, input, expected),
  deleteReviewDraft: (id, patchSet, draftId, expected) => ipcRenderer.invoke('gerrit:deleteReviewDraft', id, patchSet, draftId, expected),
  deleteReviewComment: (id, patchSet, commentId, reason) => ipcRenderer.invoke('gerrit:deleteReviewComment', id, patchSet, commentId, reason),
  applyReviewFix: (id, patchSet, fixId) => ipcRenderer.invoke('gerrit:applyReviewFix', id, patchSet, fixId),
  submitReview: (link, input) => ipcRenderer.invoke('gerrit:submitReview', link, input),
  act: (action) => ipcRenderer.invoke('gerrit:act', action),
  suggestReviewers: (id, q) => ipcRenderer.invoke('gerrit:suggestReviewers', id, q),
  suggestAccounts: (q) => ipcRenderer.invoke('gerrit:suggestAccounts', q),
  lookupAccounts: (keys) => ipcRenderer.invoke('gerrit:lookupAccounts', keys),
  openChange: (link) => ipcRenderer.invoke('gerrit:openChange', link),
  changeUrl: (link) => ipcRenderer.invoke('gerrit:changeUrl', link),
  inspectChange: (id) => ipcRenderer.invoke('gerrit:inspectChange', id),
  getPretend: () => ipcRenderer.invoke('gerrit:getPretend'),
  setPretend: (key) => ipcRenderer.invoke('gerrit:setPretend', key),
  openUrl: (url) => ipcRenderer.invoke('app:openUrl', url),
  getUi: () => ipcRenderer.invoke('ui:get'),
  setCompact: (on) => ipcRenderer.invoke('ui:setCompact', on),
  setBadge: (payload) => ipcRenderer.send('ui:badge', payload),
  onCompactChanged: (cb) => subscribe<[boolean]>('app:compact', cb),
  onSettingsChanged: (cb) => subscribe<[]>('app:settings', cb),
  onRefreshRequested: (cb) => subscribe<[]>('app:refresh', cb),
  onTabRequested: (cb) => subscribe<[TabId]>('app:tab', cb),
  onNativeReviewRequested: (cb) => subscribe<[NativeReviewRequest]>('app:review', cb),
  setNativeReviewReady: (ready) => ipcRenderer.send('app:reviewReady', ready),
  acknowledgeNativeReview: (requestId) => ipcRenderer.send('app:reviewHandled', requestId),
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

// Child frames never receive the privileged app bridge. Main also validates every IPC sender.
if (process.isMainFrame) contextBridge.exposeInMainWorld('api', api)
