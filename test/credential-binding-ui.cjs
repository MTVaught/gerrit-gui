// Build first. Real renderer input, production browser settings/service, dummy
// Gerrit responses, isolated settings. Run with Electron under Xvfb on Linux.
const { app, BrowserWindow, nativeTheme } = require('electron')
const { spawn } = require('node:child_process')
const { once } = require('node:events')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-credential-ui-profile-'))
app.setPath('userData', directory)
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const fixture = spawn('node', ['--no-warnings', path.join(__dirname, 'fixtures/credential-binding-server.ts')], { stdio: ['ignore', 'pipe', 'inherit'] })
const ready = new Promise((resolve, reject) => {
  fixture.once('error', reject)
  let output = ''
  fixture.stdout.on('data', chunk => { output += chunk; if (output.includes('\n')) resolve(JSON.parse(output.split('\n')[0]).port) })
  fixture.once('exit', code => reject(new Error('Fixture exited: ' + code)))
})
const timeout = setTimeout(() => { fixture.kill(); app.exit(2) }, 60000)
async function cleanup() {
  clearTimeout(timeout)
  fixture.kill()
  await once(fixture, 'exit')
  fs.rmSync(directory, { recursive: true, force: true })
}
app.whenReady().then(async () => {
  const port = await ready
  const base = `http://127.0.0.1:${port}`
  const output = path.join(__dirname, '../docs/screenshots/credential-binding')
  fs.mkdirSync(output, { recursive: true })
  for (const theme of ['light', 'dark']) {
    await fetch(base + '/fixture/reset')
    nativeTheme.themeSource = theme
    const win = new BrowserWindow({ width: 840, height: 600, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true } })
    const run = script => win.webContents.executeJavaScript(script)
    const errors = []
    win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
    async function until(script) {
      for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(50) }
      throw new Error('Timed out: ' + script)
    }
    async function click(selector) {
      const { x, y } = await run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, x, y })
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, x, y })
      await delay(30)
    }
    async function type(selector, value) {
      await click(selector)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] })
      await win.webContents.insertText(value)
      await delay(50)
    }
    const fields = ['label:nth-of-type(1) input', 'label:nth-of-type(2) input', 'input[type="password"]']
    const stats = async () => (await fetch(base + '/fixture/stats')).json()
    await win.loadURL(base + '/#connection')
    await until(`document.querySelector('button[type="submit"]') && !document.querySelector('button[type="submit"]').disabled`)
    await type(fields[0], 'https://new.example/gerrit')
    await until(`Boolean(document.querySelector('#credential-identity-hint'))`)
    assert.equal(await run(`document.querySelector('button[type="submit"]').disabled`), true)
    assert.equal(await run(`document.querySelector('input[type="password"]').placeholder`), 'Enter HTTP password')
    // Native click on the disabled control cannot call save or send credentials.
    await click('button[type="submit"]')
    assert.equal((await stats()).saves, 0)
    assert.deepEqual((await stats()).sent, [])
    assert.equal((await stats()).credentials.password, 'dummy-old-secret')
    await type(fields[2], 'dummy-typed-for-alice')
    await type(fields[1], 'bob')
    assert.equal(await run(`document.querySelector('input[type="password"]').value`), '', 'changing account clears an already typed password')
    assert.equal(await run(`document.querySelector('button[type="submit"]').disabled`), true)
    await type(fields[0], 'https://old.example/gerrit')
    assert.equal(await run(`document.querySelector('button[type="submit"]').disabled`), true, 'an account-only change also requires replacement credentials')
    await type(fields[0], 'https://new.example/gerrit')
    await click('h2')
    await delay(100)
    fs.writeFileSync(path.join(output, `replacement-required-${theme}.png`), (await win.webContents.capturePage()).toPNG())
    await type(fields[2], 'dummy-replacement-secret')
    await click('button[type="submit"]')
    await until(`document.querySelector('.status.ok')?.textContent.includes('Connected as Dummy Bob')`)
    const result = await stats()
    assert.equal(result.saves, 1)
    assert.deepEqual(result.sent, [{ origin: 'https://new.example', authorization: 'Basic ' + Buffer.from('bob:dummy-replacement-secret').toString('base64') }])
    assert.deepEqual(result.credentials, { serverUrl: 'https://new.example/gerrit', username: 'bob', password: 'dummy-replacement-secret' })
    await delay(100)
    fs.writeFileSync(path.join(output, `replacement-connected-${theme}.png`), (await win.webContents.capturePage()).toPNG())
    assert.deepEqual(errors, [])
    console.log(`${theme}: native input blocked origin/account reuse; new identity received only the replacement dummy password`)
    win.destroy()
  }
  await cleanup()
  app.quit()
}).catch(async error => { console.error(error); await cleanup(); app.exit(1) })
