// Real directory permissions, desktop renderer/store/service, and native X11 input.
// Dummy credentials only. The Gerrit response and permission-repair window are fixtures.
const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-cleanup-error-'))
const staged = path.join(scratch, 'evidence')
fs.mkdirSync(staged)
app.setPath('userData', path.join(scratch, 'profile'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const settingsDir = path.join(scratch, 'settings')
fs.mkdirSync(settingsDir)
const file = path.join(settingsDir, 'settings.json')
const identity = { serverUrl: 'https://gerrit.invalid', username: 'dummy' }
const before = JSON.stringify({ ...identity, password: 'dummy-old-password' })
const evidence = path.join(__dirname, '../docs/screenshots/secret-storage')
const native = (...args) => execFileSync('xdotool', args.map(String))
let win, helper, recorder
let pointer = [30, 30]
const deadline = setTimeout(async () => { await cleanup(); app.exit(2) }, 180000)
const run = (target, script) => target.webContents.executeJavaScript(script)
async function until(target, script) {
  for (let i = 0; i < 150; i++) {
    if (await run(target, script)) return
    await delay(50)
  }
  throw Error('Timed out: ' + script + '\n' + await run(target, 'document.body.innerText'))
}
async function click(target, selector) {
  const point = await run(target, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) } })()`)
  const bounds = target.getBounds()
  const x = point.x + bounds.x, y = point.y + bounds.y
  const movement = []
  for (let step = 1; step <= 20; step++) movement.push('mousemove', Math.round(pointer[0]+(x-pointer[0])*step/20), Math.round(pointer[1]+(y-pointer[1])*step/20), 'sleep', '0.05')
  native(...movement)
  pointer = [x, y]
  await delay(2000)
  native('click', '1')
  await delay(200)
}
async function caption(text) {
  await run(win, `(() => { let el=document.getElementById('evidence-caption'); if(!el){el=document.createElement('aside');el.id='evidence-caption';el.style='position:fixed;bottom:20px;left:20px;right:20px;padding:16px;background:#18344d;color:white;font:16px system-ui;border-radius:8px;z-index:99999';document.body.append(el)}el.textContent=${JSON.stringify(text)} })()`)
}
async function screenshot(name, mode) {
  await run(win, `document.getElementById('evidence-caption')?.remove()`)
  await delay(250)
  fs.writeFileSync(path.join(staged, `${name}-${mode}.png`), (await win.webContents.capturePage()).toPNG())
}
async function record(mode) {
  recorder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1280x900', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(staged, `cleanup-recovery-${mode}.mp4`)], { stdio: ['pipe', 'ignore', 'pipe'] })
  let error = ''
  recorder.stderr.on('data', data => { error += data })
  await delay(600)
  assert.equal(recorder.exitCode, null, error)
  return async () => {
    const done = new Promise(resolve => recorder.once('exit', resolve))
    recorder.stdin.write('q')
    assert.equal(await done, 0, error)
    recorder = null
  }
}
async function cleanup() {
  if (recorder && recorder.exitCode === null) {
    const done = new Promise(resolve => recorder.once('exit', resolve))
    recorder.kill('SIGINT')
    await done
  }
  for (const target of [win, helper]) if (target && !target.isDestroyed()) target.destroy()
  fs.chmodSync(settingsDir, 0o700)
  fs.rmSync(scratch, { recursive: true, force: true })
  clearTimeout(deadline)
}
app.whenReady().then(async () => {
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }))
  function bundle(relative, name) {
    const out = path.join(scratch, name + '.cjs')
    esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', relative)], outfile: out, bundle: true, platform: 'node', format: 'cjs' })
    return require(out)
  }
  const { settingsStore } = bundle('src/main/settings-store.ts', 'store')
  const { createService } = bundle('src/main/service.ts', 'service')
  let store, service, successfulReads, requests
  ipcMain.handle('transport:getSettings', async () => { const status = await store.getStatus(); successfulReads++; return status })
  ipcMain.handle('transport:saveSettings', (_event, input) => service.saveSettings(input))
  ipcMain.handle('transport:testConnection', () => service.testConnection())
  ipcMain.handle('fixture:repair', () => { fs.chmodSync(settingsDir, 0o700); return 'Permissions repaired. Click Gerrit connection to retry.' })
  const preload = path.join(scratch, 'repair-preload.cjs')
  fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('fixture',{repair:()=>ipcRenderer.invoke('fixture:repair')})`)
  const results = []
  for (const mode of ['light', 'dark']) {
    fs.chmodSync(settingsDir, 0o700)
    fs.writeFileSync(file, before, { mode: 0o600 })
    store = settingsStore(file)
    successfulReads = 0
    requests = 0
    service = createService(store, async (url, init) => {
      assert.equal(url, identity.serverUrl + '/a/accounts/self')
      assert.equal(init.headers.Authorization, 'Basic ' + Buffer.from('dummy:dummy-old-password').toString('base64'))
      assert.equal(init.redirect, 'error')
      requests++
      return new Response(JSON.stringify({ _account_id: 1, username: 'dummy', name: 'Dummy user', email: 'dummy@example.invalid' }))
    })
    fs.chmodSync(settingsDir, 0o500)
    nativeTheme.themeSource = mode
    helper = new BrowserWindow({ x: 1020, y: 0, width: 240, height: 900, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload } })
    await helper.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(`<!doctype html><style>:root{color-scheme:light dark}body{font:16px system-ui;padding:16px}button{font:inherit;padding:10px}</style><h2>Isolated fixture</h2><p>Only dummy settings are used.</p><button id="repair">Repair directory permissions</button><p id="result">The settings directory denies writes.</p><p>Click here later to move focus away from the connection form.</p><script>document.querySelector('button').onclick=async()=>{document.querySelector('#result').textContent=await window.fixture.repair();document.querySelector('button').disabled=true}</script>`))
    win = new BrowserWindow({ x: 0, y: 0, width: 1000, height: 900, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/transport-preload.cjs') } })
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'connection' })
    await until(win, `document.querySelector('[role=alert]')?.textContent.includes('A failed password cleanup keeps the saved file unchanged')`)
    assert.equal(successfulReads, 0)
    assert.equal(fs.readFileSync(file, 'utf8'), before)
    pointer = [30, 30]
    native('mousemove', ...pointer)
    await screenshot('cleanup-error', mode)
    const finish = await record(mode)
    await caption('Cleanup failed and the original dummy file is intact. Click the fixture button to repair its directory permissions.')
    await delay(2000)
    await click(helper, '#repair')
    await until(helper, `document.querySelector('#result').textContent.includes('Permissions repaired')`)
    assert.equal(await run(win, 'document.hasFocus()'), false)
    assert.equal(fs.readFileSync(file, 'utf8'), before, 'repair alone has not cleaned or loaded the form')
    await caption('Permissions are repaired. Click Gerrit connection to return native focus and retry the failed first settings load.')
    const readsBeforeRecovery = successfulReads
    await click(win, 'h2')
    await until(win, `document.querySelector('input[type=password]')?.placeholder === '(unchanged)'`)
    assert.ok(successfulReads > readsBeforeRecovery)
    assert.equal(await run(win, 'document.hasFocus()'), true)
    const fields = await run(win, `Array.from(document.querySelectorAll('form > label input')).map(el=>el.value)`)
    assert.deepEqual(fields, [identity.serverUrl, identity.username, ''])
    assert.equal(await run(win, `Boolean(document.querySelector('[role=alert],input[type=checkbox]'))`), false)
    assert.equal(await run(win, `document.querySelector('button[type=submit]').disabled`), false)
    assert.equal(await run(win, `document.body.textContent.includes('The current password is kept in memory only')`), true)
    const afterRecovery = JSON.parse(fs.readFileSync(file, 'utf8'))
    for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in afterRecovery, false)
    assert.equal(fs.statSync(file).mode & 0o777, 0o600)
    await screenshot('recovery', mode)
    await caption('The first successful load populated the saved URL and account. The old saved fields are gone. Test the original bound memory password.')
    await click(win, 'button[type=submit]')
    await until(win, `document.querySelector('.status.ok')?.textContent.includes('Connected as Dummy user')`)
    assert.equal(requests, 1)
    await screenshot('recovery-connected', mode)
    await caption('The simulated Gerrit response confirms the original bound password. Use Ctrl+A to type a draft URL. Do not save the draft.')
    await delay(2000)
    await click(win, 'form > label:nth-of-type(1) input')
    const draft = identity.serverUrl + '/draft'
    native('key', '--clearmodifiers', 'ctrl+a')
    native('type', '--clearmodifiers', '--delay', '40', '--', draft)
    await until(win, `document.querySelector('form > label:nth-of-type(1) input').value === ${JSON.stringify(draft)}`)
    await caption('A draft is entered. Move focus to the fixture window, then back. A later settings refresh must keep the unsaved draft.')
    await click(helper, 'h2')
    assert.equal(await run(win, 'document.hasFocus()'), false)
    const readsBeforeDraftFocus = successfulReads
    await click(win, 'h2')
    for (let i = 0; i < 100 && successfulReads === readsBeforeDraftFocus; i++) await delay(50)
    assert.ok(successfulReads > readsBeforeDraftFocus)
    await delay(200)
    assert.equal(await run(win, `document.querySelector('form > label:nth-of-type(1) input').value`), draft)
    assert.equal(await run(win, `document.querySelector('form > label:nth-of-type(2) input').value`), identity.username)
    assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).serverUrl, identity.serverUrl)
    assert.equal(requests, 1, 'focus refresh does not submit or send the draft')
    await screenshot('recovery-draft', mode)
    await caption('Later focus refresh preserved the draft URL and saved account. The file still has the original URL and no password. No draft request was sent.')
    await delay(4000)
    await finish()
    results.push({ mode, platform: 'Linux Electron, native X11 input', data: 'Dummy credentials. Simulated Gerrit response and repair window. Real directory permissions, production renderer/store/service.', failedInitialLoad: true, failedFileIntact: true, recoveredOnNativeFocus: true, recoveredFields: fields.slice(0, 2), memoryPasswordUsedForOriginalIdentity: true, obsoleteCheckboxAbsent: true, afterRecovery, fileMode: '600', laterNativeFocusPreservedDraft: true, draft, unsavedDraftNotPersisted: true, requests })
    win.destroy(); helper.destroy()
    console.log(mode + ': actual EACCES; native focus recovery populated saved identity; bound memory password connected; later focus kept unsaved draft')
  }
  fs.writeFileSync(path.join(staged, 'recovery-result.json'), JSON.stringify({ results }, null, 2) + '\n')
  for (const name of fs.readdirSync(staged)) fs.copyFileSync(path.join(staged, name), path.join(evidence, name))
}).then(async () => { await cleanup(); app.quit() }).catch(async error => { console.error(error); await cleanup(); app.exit(1) })
