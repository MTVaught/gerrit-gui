// Native desktop error state after an actual failed legacy-file replacement.
const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-cleanup-error-'))
app.setPath('userData', path.join(scratch, 'profile'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const settingsDir = path.join(scratch, 'settings')
fs.mkdirSync(settingsDir)
const file = path.join(settingsDir, 'settings.json')
const before = JSON.stringify({ serverUrl: 'https://gerrit.invalid', username: 'dummy', password: 'dummy-old-password' })
let win
const deadline = setTimeout(() => app.exit(2), 60000)
async function cleanup() {
  if (win && !win.isDestroyed()) win.destroy()
  fs.chmodSync(settingsDir, 0o700)
  fs.rmSync(scratch, { recursive: true, force: true })
  clearTimeout(deadline)
}
app.whenReady().then(async () => {
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }))
  const bundled = path.join(scratch, 'store.cjs')
  esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/main/settings-store.ts')], outfile: bundled, bundle: true, platform: 'node', format: 'cjs' })
  const { settingsStore } = require(bundled)
  let store
  ipcMain.handle('transport:getSettings', () => store.getStatus())
  for (const mode of ['light', 'dark']) {
    fs.chmodSync(settingsDir, 0o700)
    fs.writeFileSync(file, before, { mode: 0o600 })
    store = settingsStore(file)
    fs.chmodSync(settingsDir, 0o500)
    nativeTheme.themeSource = mode
    win = new BrowserWindow({ width: 1000, height: 700, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/transport-preload.cjs') } })
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'connection' })
    let found = false
    for (let i = 0; i < 100; i++) {
      found = await win.webContents.executeJavaScript(`document.querySelector('[role=alert]')?.textContent.includes('A failed password cleanup keeps the saved file unchanged')`)
      if (found) break
      await delay(50)
    }
    assert.equal(found, true)
    assert.equal(fs.readFileSync(file, 'utf8'), before)
    await delay(300)
    fs.writeFileSync(path.join(__dirname, '../docs/screenshots/secret-storage', `cleanup-error-${mode}.png`), (await win.webContents.capturePage()).toPNG())
    win.destroy()
    fs.chmodSync(settingsDir, 0o700)
    assert.equal((await store.getStatus()).passwordStorage, 'session', 'retry cleans and commits memory only after the write succeeds')
    assert.equal(JSON.parse(fs.readFileSync(file)).password, undefined)
    console.log(mode + ': actual EACCES is visible; old bytes remain; retry cleans successfully')
  }
}).then(async () => { await cleanup(); app.quit() }).catch(async error => { console.error(error); await cleanup(); app.exit(1) })
