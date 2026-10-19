// Actual browser mode, process sessions, file settings and OS input under Xvfb.
// Only Gerrit's account/search responses and the launch/attack pages are fixtures.
// xvfb-run -a -s '-screen 0 1280x900x24' node_modules/.bin/electron --no-sandbox test/secret-storage-ui.cjs
const { app, BrowserWindow, session, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { mkdtempSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'docs/screenshots/secret-storage')
const temporary = mkdtempSync(path.join(os.tmpdir(), 'gerrit-browser-ui-'))
const staged = path.join(temporary, 'evidence')
app.setPath('userData', path.join(temporary, 'electron'))
app.setPath('sessionData', path.join(temporary, 'sessions'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const children = new Set()
const servers = new Set()
const windows = new Set()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const approved = 'http://localhost:19773'
const fixtureOrigin = 'http://localhost:19775'
const gerritOrigin = 'http://127.0.0.1:19776'
const attackerOrigin = 'http://127.0.0.1:19777'
const settings = path.join(temporary, 'settings.json')
let launchUrl = ''
let pointer = [30, 30]
const frames = { width: 1280, height: 900, x: 0, y: 0, frame: false }
const results = []
const run = (win, script) => win.webContents.executeJavaScript(script)
async function until(win, script) {
  const end = Date.now() + 15000
  while (Date.now() < end) {
    if (await run(win, script)) return
    await delay(50)
  }
  throw new Error('Timed out: ' + script)
}
function child(command, args, options = {}) {
  const process = spawn(command, args, options)
  children.add(process)
  process.once('exit', () => children.delete(process))
  return process
}
async function command(executable, args) {
  const process = child(executable, args, { stdio: 'ignore' })
  await new Promise((resolve, reject) => {
    process.once('error', reject)
    process.once('exit', code => code === 0 ? resolve() : reject(new Error(executable + ' exited ' + code)))
  })
}
async function stop(process) {
  if (process.exitCode !== null || process.signalCode !== null) return
  const done = new Promise(resolve => process.once('exit', resolve))
  process.kill('SIGTERM')
  await done
}
function window(partition, visible = true) {
  const win = new BrowserWindow({ ...frames, show: visible, webPreferences: { partition, contextIsolation: true, sandbox: true } })
  windows.add(win)
  win.once('closed', () => windows.delete(win))
  return win
}
async function caption(win, text, href, label) {
  // An annotation and optional navigation link. No feature handler is invoked.
  await run(win, `(() => {
    let el = document.getElementById('evidence-caption');
    if (!el) { el = document.createElement('aside'); el.id = 'evidence-caption';
      el.style = 'position:fixed;bottom:20px;left:20px;right:20px;padding:16px;background:#18344d;color:white;font:18px system-ui;border-radius:8px;z-index:99999';
      document.body.append(el); }
    el.replaceChildren(document.createTextNode(${JSON.stringify(text)}));
    if (${Boolean(href)}) { const link = document.createElement('a'); link.id = 'evidence-next';
      link.href = ${JSON.stringify(href ?? '')}; link.textContent = ${JSON.stringify(label ?? '')};
      link.style = 'display:block;width:fit-content;color:white;text-decoration:underline;margin-top:10px'; el.append(link); }
  })()`)
}
async function click(win, selector) {
  console.log('Native click: ' + selector)
  win.show(); win.focus()
  const box = await run(win, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
    return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) }; })()`)
  const movement = []
  for (let step = 1; step <= 20; step++) {
    movement.push('mousemove', String(Math.round(pointer[0] + (box.x - pointer[0]) * step / 20)),
      String(Math.round(pointer[1] + (box.y - pointer[1]) * step / 20)), 'sleep', '0.05')
  }
  await command('xdotool', movement)
  pointer = [box.x, box.y]
  await delay(2000)
  await command('xdotool', ['click', '1'])
  await delay(300)
}
async function screenshot(win, name) {
  // Wait for the compositor to display caption removal before capturePage.
  await delay(200)
  await fs.writeFile(path.join(staged, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function listen(server, port) {
  servers.add(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
}
async function startWeb() {
  const web = child(process.execPath, [path.join(root, 'scripts/web.mjs')], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WEB_PORT: '19773', API_PORT: '19774', WEB_ORIGIN: approved,
      GERRIT_GUI_WEB_SETTINGS: settings, GERRIT_URL: '', GERRIT_USER: '', GERRIT_PASSWORD: '', GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  web.stdout.on('data', chunk => { logs += chunk })
  web.stderr.on('data', chunk => { logs += chunk })
  const end = Date.now() + 20000
  while (Date.now() < end) {
    const match = logs.match(/http:\/\/localhost:19773\/#browser-key=[a-f0-9]{64}/)
    if (match) {
      try { if ((await fetch(approved)).ok) { launchUrl = match[0]; return web } } catch {}
    }
    if (web.exitCode !== null) break
    await delay(100)
  }
  throw new Error('Browser servers did not start: ' + logs.replace(/[a-f0-9]{64}/g, '[redacted]'))
}
async function record(theme) {
  const recorder = child('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20',
    '-video_size', '1280x900', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-threads', '1', '-preset', 'veryfast',
    '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(staged, `storage-session-${theme}.mp4`)],
    { stdio: ['pipe', 'ignore', 'pipe'] })
  let error = ''
  recorder.stderr.on('data', chunk => { error += chunk })
  await delay(600)
  assert.equal(recorder.exitCode, null, error)
  return async () => {
    const done = new Promise(resolve => recorder.once('exit', resolve))
    recorder.stdin.write('q')
    const code = await done
    assert.equal(code, 0, error)
  }
}
async function cleanup() {
  for (const win of windows) if (!win.isDestroyed()) win.destroy()
  for (const process of [...children]) await stop(process)
  for (const server of servers) await new Promise(resolve => { server.closeAllConnections(); server.close(resolve) })
  await fs.rm(temporary, { recursive: true, force: true })
}
const deadline = setTimeout(async () => {
  console.error('Browser workflow exceeded five minutes')
  await cleanup()
  app.exit(2)
}, 300000)

app.whenReady().then(async () => {
  await fs.mkdir(staged)
  let gerritCalls = 0
  await listen(http.createServer((req, res) => {
    if (req.headers.authorization !== 'Basic ' + Buffer.from('dummy:dummy-old-password').toString('base64')) {
      res.writeHead(401).end('Wrong dummy credentials'); return
    }
    gerritCalls++
    const account = { _account_id: 1, username: 'dummy', name: 'Dummy user', email: 'dummy@example.invalid' }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(")]}'\n" + JSON.stringify(req.url.startsWith('/a/changes/') ? [[], [], []] : account))
  }), 19776)
  await listen(http.createServer((_req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><html><head><style>:root{color-scheme:light dark}body{font:20px system-ui;padding:48px}</style></head><body>
      <h1>Open the isolated test connection</h1><p>The real server generated this one-use startup link. Only dummy credentials are used.</p>
      <a id="launch" href="${launchUrl}&connection=1">Open the authorized connection session</a></body></html>`)
  }), 19775)
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await fs.writeFile(settings, JSON.stringify({ serverUrl: gerritOrigin, username: 'dummy', password: 'dummy-old-password', theme: 'system' }), { mode: 0o644 })
    await fs.chmod(settings, 0o644)
    const before = { mode: '644', data: JSON.parse(await fs.readFile(settings, 'utf8')) }
    let web = await startWeb()
    const afterStartup = JSON.parse(await fs.readFile(settings, 'utf8'))
    for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in afterStartup, false)
    const win = window('storage-' + theme + '-' + Date.now())
    await win.loadURL(fixtureOrigin + '/launch')
    assert.equal(JSON.parse(await fs.readFile(settings, 'utf8')).password, undefined)
    const removeCaption = () => run(win, `document.getElementById('evidence-caption')?.remove()`)
    pointer = [30, 30]
    await command('xdotool', ['mousemove', '30', '30'])
    const finishRecording = await record(theme)
    await caption(win, 'The isolated server already cleaned the old dummy password during startup, before any browser connected. This separate regression checks Connection, reload and restart.')
    await delay(2000)
    await click(win, '#launch')
    await until(win, `document.body.textContent.includes('The current password is kept in memory only')`)
    assert.equal(await run(win, `document.querySelector('input[type=checkbox]') === null`), true)
    const afterLoad = JSON.parse(await fs.readFile(settings, 'utf8'))
    for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in afterLoad, false)
    const afterReadMode = ((await fs.stat(settings)).mode & 0o777).toString(8)
    assert.equal(afterReadMode, '600')
    await removeCaption()
    await screenshot(win, `cleanup-${theme}`)
    await caption(win, 'Cleanup already passed at server startup. No checkbox or confirmation is needed. Test the original dummy account with its bound memory password.')
    await delay(2000)
    await click(win, 'button[type=submit]')
    await until(win, `document.body.textContent.includes('Connected as Dummy user')`)
    assert.equal(JSON.parse(await fs.readFile(settings, 'utf8')).password, undefined)
    await removeCaption()
    await screenshot(win, `session-${theme}`)
    await caption(win, 'The legacy saved fields are already absent. The current session still connects. Press Ctrl+R to reload the tab without restarting the server.')
    await delay(3000)
    let loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve))
    await command('xdotool', ['key', '--clearmodifiers', 'ctrl+r'])
    await loaded
    await until(win, `document.body.textContent.includes('The current password is kept in memory only')`)
    await caption(win, 'Tab reload kept the memory password. Test the same connection again.')
    await click(win, 'button[type=submit]')
    await until(win, `document.body.textContent.includes('Connected as Dummy user')`)
    await caption(win, 'The test now stops and starts the isolated browser servers as separate processes. Then press Ctrl+R. Production session cookies end with the API process.')
    await delay(3000)
    const beforeCalls = gerritCalls
    const afterSave = JSON.parse(await fs.readFile(settings, 'utf8'))
    await stop(web)
    web = await startWeb()
    loaded = new Promise(resolve => win.webContents.once('did-finish-load', resolve))
    await command('xdotool', ['key', '--clearmodifiers', 'ctrl+r'])
    await loaded
    await until(win, `document.body.textContent.includes('Browser session required')`)
    assert.equal(gerritCalls, beforeCalls)
    await caption(win, 'The restarted API rejected the old cookie. Open the trusted local fixture page for its new startup link.', fixtureOrigin + '/launch', 'Open the new startup link page')
    await click(win, '#evidence-next')
    await until(win, `Boolean(document.querySelector('#launch'))`)
    await caption(win, 'Click the newly generated one-use link to authorize this profile. This fixture represents the printed terminal link.')
    await click(win, '#launch')
    await until(win, `Boolean(document.querySelector('input[type=password]'))`)
    assert.equal(await run(win, `document.querySelector('button[type=submit]').disabled`), true)
    assert.equal(await run(win, `document.querySelector('input[type=password]').placeholder`), 'Enter HTTP password')
    assert.equal(gerritCalls, beforeCalls)
    await removeCaption()
    await screenshot(win, `restart-${theme}`)
    await caption(win, 'New process and fresh authorization: the URL and account remain, but the password is absent. Test and save is disabled until you enter it again.')
    await delay(4000)
    await finishRecording()
    const result = { theme, platform: 'Linux Electron Chromium, browser mode, no application preload',
      data: 'Dummy credentials. Simulated Gerrit account/search responses. Production API/session/store and native X11 input.',
      before, afterStartup, afterLoad, afterReadMode, afterSave, afterSaveMode: ((await fs.stat(settings)).mode & 0o777).toString(8),
      sessionHasPassword: true, tabReloadHasPassword: true, restartHasPassword: false, restartedOldCookieRejected: true, newStartupKeyRequired: true }
    results.push(result)
    if (theme === 'light') await fs.writeFile(path.join(staged, 'browser-result.json'), JSON.stringify(result, null, 2))
    win.destroy()
    await stop(web)
    console.log(theme + ': protected API, automatic cleanup on load, real reload, process restart, cookie rejection, fresh bootstrap, no persisted password passed')
  }
  await fs.writeFile(path.join(staged, 'workflow-result.json'), JSON.stringify({ results }, null, 2))
  await fs.mkdir(output, { recursive: true })
  for (const name of await fs.readdir(staged)) await fs.copyFile(path.join(staged, name), path.join(output, name))
}).then(async () => { clearTimeout(deadline); await cleanup(); app.quit() })
  .catch(async error => { console.error(error); clearTimeout(deadline); await cleanup(); app.exit(1) })
