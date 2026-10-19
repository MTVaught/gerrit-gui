// Real connection form, desktop settings, Service, and Chromium transport.
// The Gerrit account response is a local fixture. All credentials are dummy.
const { app, BrowserWindow, nativeTheme, ipcMain, net, session } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { X509Certificate } = require('node:crypto')
const { execFileSync } = require('node:child_process')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-transport-ui-'))
const profile = path.join(scratch, 'profile')
app.setPath('userData', profile)
app.disableHardwareAcceleration()
for (const key of ['GERRIT_URL', 'GERRIT_USER', 'GERRIT_PASSWORD', 'GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP']) delete process.env[key]
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
let fixture

app.whenReady().then(async () => {
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }))
  function bundle(relative, name) {
    const file = path.join(scratch, name + '.cjs')
    esbuild.buildSync({ entryPoints: [path.join(__dirname, '..', relative)], outfile: file, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
    return require(file)
  }
  const store = bundle('src/main/settings.ts', 'settings')
  const { createService } = bundle('src/main/service.ts', 'service')
  fixture = await bundle('src/main/test-fixtures/transport-server.ts', 'fixture').transportServer()
  // Trust this fixture certificate only, within this disposable test session.
  const fingerprint = new X509Certificate(fixture.cert).fingerprint256
  session.defaultSession.setCertificateVerifyProc(({ hostname, certificate }, callback) => {
    callback(hostname === '127.0.0.1' && new X509Certificate(certificate.data).fingerprint256 === fingerprint ? 0 : -3)
  })
  let requests = 0
  const service = createService(store, (url, init) => { requests++; return net.fetch(url, init) })
  ipcMain.handle('transport:getSettings', () => service.getSettings())
  ipcMain.handle('transport:saveSettings', (_event, input) => service.saveSettings(input))
  ipcMain.handle('transport:testConnection', () => service.testConnection())
  const evidence = path.join(__dirname, '../docs/screenshots/transport-security')
  fs.mkdirSync(evidence, { recursive: true })

  // Confirm old desktop settings remain visible, but cannot return credentials.
  fs.mkdirSync(profile, { recursive: true })
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({ serverUrl: 'http://gerrit.example.invalid', username: 'dummy', password: 'dummy' }))
  assert.equal((await store.getStatus()).serverUrl, 'http://gerrit.example.invalid')
  await assert.rejects(store.getCredentials(), /requires HTTPS/)
  await assert.rejects(service.testConnection(), /requires HTTPS/)
  assert.equal(requests, 0)

  for (const mode of ['light', 'dark']) {
    fs.unlinkSync(path.join(profile, 'settings.json'))
    nativeTheme.themeSource = mode
    const win = new BrowserWindow({ x: 0, y: 0, width: 1000, height: 700, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/transport-preload.cjs') } })
    const run = script => win.webContents.executeJavaScript(script)
    async function until(script) {
      for (let i = 0; i < 150; i++) { if (await run(script)) return; await delay(50) }
      throw new Error('Timed out: ' + script + '\n' + await run('document.body.innerText'))
    }
    const native = (...args) => execFileSync('xdotool', args.map(String))
    async function click(selector) {
      const point = await run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) } })()`)
      native('mousemove', point.x, point.y)
      native('click', '1')
      await delay(100)
    }
    async function type(selector, text) {
      await click(selector)
      native('key', '--clearmodifiers', 'ctrl+a')
      await delay(150)
      native('type', '--clearmodifiers', '--delay', '50', '--', text)
      await delay(150)
      assert.equal(await run(`document.querySelector(${JSON.stringify(selector)}).value`), text)
    }
    async function capture(name) {
      await delay(150)
      fs.writeFileSync(path.join(evidence, name + '-' + mode + '.png'), (await win.webContents.capturePage()).toPNG())
    }
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'connection' })
    win.focus()
    win.webContents.focus()
    await until('Boolean(document.querySelector("input"))')
    await type('label:nth-of-type(1) input', 'http://gerrit.example.invalid/gerrit1')
    await type('label:nth-of-type(2) input', 'dummy')
    await type('input[type=password]', 'dummy')
    const before = requests
    await click('button[type=submit]')
    await until('document.querySelector(".status.error")?.textContent.includes("requires HTTPS")')
    assert.equal(requests, before, 'HTTP never reaches the network transport')
    assert.equal(fs.existsSync(path.join(profile, 'settings.json')), false, 'HTTP settings were not saved')
    await capture('remote-http-blocked')
    await type('label:nth-of-type(1) input', fixture.httpsUrl + '/gerrit')
    await click('button[type=submit]')
    await until('document.querySelector(".status.ok")?.textContent.includes("Connected as Transport test")')
    assert.equal(requests, before + 1)
    assert.equal((await store.getCredentials()).serverUrl, fixture.httpsUrl + '/gerrit')
    await capture('https-connected')
    win.destroy()
    console.log(`${mode}: remote HTTP rejected before save/fetch; real HTTPS connection succeeds`)
  }
  // Exercise Chromium's redirect behavior, not a substitute fetch.
  for (const status of [301, 302, 303, 307, 308]) {
    await store.save({ ...await store.getStatus(), serverUrl: fixture.httpsUrl + '/redirect-' + status })
    await assert.rejects(service.testConnection(), /redirect/i)
  }
  assert.deepEqual(fixture.httpRequests, [])
  assert.equal(fixture.tlsRequests.length, 7)
  console.log('Desktop legacy HTTP blocked; Chromium rejects five TLS downgrade redirects; HTTP listener received zero requests')
  await fixture.close()
  fixture = null
  fs.rmSync(scratch, { recursive: true, force: true })
  clearTimeout(timeout)
  app.quit()
}).catch(async error => {
  console.error(error)
  if (fixture) await fixture.close()
  clearTimeout(timeout)
  app.exit(1)
})
