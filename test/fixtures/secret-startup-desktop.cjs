// Load the REAL built desktop entrypoint. Observation only; no service/store replacement.
const { app, BrowserWindow, ipcMain, net, safeStorage, nativeTheme } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const file = path.join(process.env.GERRIT_GUI_USER_DATA, 'settings.json')
const auditFile = process.env.GERRIT_SECRET_STARTUP_AUDIT
const record = value => fs.appendFileSync(auditFile, JSON.stringify({ at: Date.now(), ...value }) + '\n')
app.disableHardwareAcceleration()
nativeTheme.themeSource = process.env.GERRIT_SECRET_THEME
const handle = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, callback) => handle(channel, (...args) => {
  if (channel === 'settings:save') record({ event: 'saveSettings' })
  if (channel === 'connection:open') record({ event: 'openConnection' })
  return callback(...args)
})
const fetch = net.fetch.bind(net)
net.fetch = (...args) => { record({ event: 'authenticated-request', url: args[0] }); return fetch(...args) }
app.on('browser-window-created', (_event, win) => {
  record({ event: 'window-created', snapshot: JSON.parse(fs.readFileSync(file, 'utf8')), mode: (fs.statSync(file).mode & 0o777).toString(8), backend: safeStorage.getSelectedStorageBackend() })
  win.once('ready-to-show', () => win.setBounds({ x: 0, y: 0, width: 900, height: 1000 }))
  win.webContents.on('did-finish-load', () => {
    const connection = win.webContents.getURL().includes('connection')
    record({ event: 'renderer-loaded', connection })
    const poll = setInterval(async () => {
      if (win.isDestroyed()) return clearInterval(poll)
      const result = await win.webContents.executeJavaScript(`({board:document.body.innerText.includes('Nothing needs your review'),reentry:document.querySelector('input[type=password]')?.placeholder==='Enter HTTP password' && document.querySelector('button[type=submit]')?.disabled})`).catch(() => null)
      if (result?.board || result?.reentry) { clearInterval(poll); record({event:result.board?'board-ready':'requires-reentry',connection}) }
    }, 100)
  })
})
if (process.env.GERRIT_SECRET_FAIL_STARTUP === '1') {
  // Acquire the normal instance lock first, then deny only the isolated startup write.
  app.whenReady().then(() => fs.chmodSync(process.env.GERRIT_GUI_USER_DATA, 0o500))
}
// No screenshot/test-tab hooks. Normal startup decides which window to create.
require(path.join(__dirname, '../../out/main/index.js'))
