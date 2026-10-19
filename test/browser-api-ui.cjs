// Actual browser mode, process sessions, file settings and OS input under Xvfb.
// Only Gerrit's account/search responses and the launch/attack pages are fixtures.
// xvfb-run -a -s '-screen 0 1280x900x24' node_modules/.bin/electron --no-sandbox test/browser-api-ui.cjs
const { app, BrowserWindow, session, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const { mkdtempSync } = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'docs/screenshots/browser-api')
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
const approved = 'http://localhost:19673'
const fixtureOrigin = 'http://localhost:19675'
const gerritOrigin = 'http://127.0.0.1:19676'
const attackerOrigin = 'http://127.0.0.1:19677'
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
  await fs.writeFile(path.join(staged, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function listen(server, port) {
  servers.add(server)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
}
async function startWeb() {
  const web = child(process.execPath, [path.join(root, 'scripts/web.mjs')], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WEB_PORT: '19673', API_PORT: '19674', WEB_ORIGIN: approved,
      GERRIT_GUI_WEB_SETTINGS: settings, GERRIT_URL: '', GERRIT_USER: '', GERRIT_PASSWORD: '', GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let logs = ''
  web.stdout.on('data', chunk => { logs += chunk })
  web.stderr.on('data', chunk => { logs += chunk })
  const end = Date.now() + 20000
  while (Date.now() < end) {
    const match = logs.match(/http:\/\/localhost:19673\/#browser-key=[a-f0-9]{64}/)
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
    '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(staged, `browser-session-${theme}.mp4`)],
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
  let gerritCalls = 0, attackerCalls = 0
  await listen(http.createServer((req, res) => {
    gerritCalls++
    if (req.headers.authorization !== 'Basic ' + Buffer.from('audit-dummy:audit-dummy-password').toString('base64')) {
      res.writeHead(401).end('Wrong dummy credentials'); return
    }
    const account = { _account_id: 1, username: 'audit-dummy', name: 'Audit Dummy', email: 'dummy@example.invalid' }
    const data = req.url.startsWith('/a/changes/') ? [[], [], []] : account
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(")]}'\n" + JSON.stringify(data))
  }), 19676)
  await listen(http.createServer((req, res) => { attackerCalls++; res.writeHead(500).end('The fixture must never receive credentials') }), 19677)
  await listen(http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Cache-Control', 'no-store')
    const style = `<style>:root{color-scheme:light dark}body{font:20px system-ui;padding:48px}button,a{font:inherit}button{padding:14px}pre{white-space:pre-wrap;line-height:1.8}</style>`
    if (req.url === '/launch') {
      res.end(`<!doctype html><html><head><title>Browser session launch fixture</title>${style}</head><body>
        <h1>Start an authorized browser session</h1><p>This test link represents the one-use link printed by pnpm web.</p>
        <p>Dummy credentials. Isolated settings. Local HTTP fixture enabled by process opt-in.</p>
        <a id="launch" href="${launchUrl}">Open the one-use browser link</a></body></html>`)
      return
    }
    res.end(`<!doctype html><html><head><title>Foreign-origin security check</title>${style}</head><body>
      <h1>Foreign-origin security check</h1><p>Separate website on another port. Dummy credentials only.</p>
      <p>Attempt to replace the saved server, then request a connection.</p>
      <button id="attack">Send foreign-origin requests</button><pre id="result">Ready</pre>
      <script>document.getElementById('attack').onclick=async()=>{
        for(const [method,args] of [['saveSettings',[{serverUrl:'${attackerOrigin}',username:'audit-dummy',password:'audit-dummy-password',projects:[],teams:[]}]],['testConnection',[]]]){
          try{await fetch('${approved}/api/'+method,{method:'POST',mode:'no-cors',credentials:'include',headers:{'Content-Type':'text/plain'},body:JSON.stringify(args)})}catch{}}
        document.body.dataset.sent='true';
      }</script></body></html>`)
  }), 19675)

  for (const theme of ['light', 'dark']) {
    console.log('Start ' + theme)
    await fs.rm(settings, { force: true })
    const web = await startWeb()
    const partition = 'browser-security-' + theme + '-' + Date.now()
    const browserSession = session.fromPartition(partition)
    const statuses = [], sent = []
    browserSession.webRequest.onBeforeSendHeaders({ urls: [approved + '/api/*'] }, (details, callback) => {
      sent.push({ path: new URL(details.url).pathname, hasSessionCookie: Object.keys(details.requestHeaders).some(name => name.toLowerCase() === 'cookie') })
      callback({ requestHeaders: details.requestHeaders })
    })
    browserSession.webRequest.onCompleted({ urls: [approved + '/api/*'] }, details => {
      statuses.push({ path: new URL(details.url).pathname, status: details.statusCode })
    })
    nativeTheme.themeSource = theme
    const board = window(partition)
    board.webContents.setWindowOpenHandler(() => ({ action: 'allow', overrideBrowserWindowOptions: { ...frames, webPreferences: { contextIsolation: true, sandbox: true } } }))
    board.webContents.on('did-create-window', win => { windows.add(win); win.once('closed', () => windows.delete(win)) })
    await board.loadURL(fixtureOrigin + '/launch')
    pointer = [30, 30]
    await command('xdotool', ['mousemove', '30', '30'])
    await caption(board, 'Open the one-use startup link. The key is removed from the URL and exchanged for a session cookie.')
    const finishRecording = await record(theme)
    await delay(1500)
    await click(board, '#launch')
    await until(board, `Boolean(document.querySelector('.panel.empty button'))`)
    assert.equal(new URL(await run(board, 'location.href')).hash, '')
    assert.ok(statuses.some(response => response.path === '/api/session' && response.status === 200))
    const cookies = await browserSession.cookies.get({ url: approved + '/api/' })
    assert.ok(cookies.some(cookie => cookie.name.startsWith('gerrit_session_') && cookie.httpOnly && cookie.sameSite === 'strict'))
    await caption(board, 'Startup accepted. Open the app connection form in a second tab. No new startup key is needed.')
    await delay(1500)
    const opened = new Promise(resolve => board.webContents.once('did-create-window', resolve))
    await click(board, '.panel.empty button')
    const connection = await opened
    assert.equal(connection.webContents.session, browserSession)
    await until(connection, `Boolean(document.querySelector('input[type=password]'))`)
    board.hide()
    await caption(connection, 'Use Ctrl+A to replace each field with dummy data. Local HTTP is enabled only for this loopback test process.')
    for (const [selector, value] of [['form > label:nth-of-type(1) input', gerritOrigin], ['form > label:nth-of-type(2) input', 'audit-dummy'], ['input[type=password]', 'audit-dummy-password']]) {
      await click(connection, selector)
      await command('xdotool', ['key', '--clearmodifiers', 'ctrl+a'])
      await command('xdotool', ['type', '--clearmodifiers', '--delay', '40', value])
    }
    await click(connection, 'button[type=submit]')
    await until(connection, `document.body.textContent.includes('Connected as Audit Dummy')`)
    const saved = JSON.parse(await fs.readFile(settings, 'utf8'))
    assert.equal(saved.serverUrl, gerritOrigin)
    assert.equal(saved.username, 'audit-dummy')
    assert.equal(saved.password, undefined, 'browser passwords must not enter JSON')
    await caption(connection, 'Authorized session: saved settings and tested the dummy account through the protected API.', fixtureOrigin + '/attack', 'Open the separate foreign-origin website')
    await delay(2000)
    await screenshot(connection, `connected-${theme}`)
    const before = await fs.readFile(settings, 'utf8'), beforeCalls = gerritCalls, beforeAttackerCalls = attackerCalls
    await click(connection, '#evidence-next')
    await until(connection, `Boolean(document.getElementById('attack'))`)
    await caption(connection, 'Send the two foreign-origin text/plain requests with the browser session cookie included.')
    const requestStart = sent.length, responseStart = statuses.length
    await click(connection, '#attack')
    await until(connection, `document.body.dataset.sent === 'true'`)
    await delay(500)
    assert.deepEqual(statuses.slice(responseStart).map(response => response.status), [403, 403])
    assert.deepEqual(sent.slice(requestStart).map(request => request.hasSessionCookie), [true, true])
    assert.equal(await fs.readFile(settings, 'utf8'), before)
    assert.equal(gerritCalls, beforeCalls)
    assert.equal(attackerCalls, beforeAttackerCalls)
    await run(connection, `document.getElementById('result').textContent = 'Chromium network responses:\\nPOST saveSettings  → HTTP 403\\nPOST testConnection → HTTP 403\\n\\nBoth requests included the session cookie.\\nIsolated settings file unchanged.\\nNo request or credential reached the attacker fixture.\\nNo new request reached the Gerrit fixture.'`)
    await caption(connection, 'Both requests were rejected before settings or Gerrit were used.', approved + '/#connection', 'Check the saved connection')
    await delay(2500)
    await screenshot(connection, `foreign-origin-${theme}`)
    await click(connection, '#evidence-next')
    await until(connection, `document.querySelector('input')?.value === '${gerritOrigin}'`)
    await caption(connection, 'The saved server is unchanged. Press Ctrl+R to reload this connection tab with the existing session.')
    await delay(2000)
    const reload = new Promise(resolve => connection.webContents.once('did-finish-load', resolve))
    await command('xdotool', ['key', '--clearmodifiers', 'ctrl+r'])
    await reload
    await until(connection, `document.querySelector('input')?.value === '${gerritOrigin}'`)
    await caption(connection, 'Reload passed. The existing session still reads the saved connection without a startup key.')
    await delay(2000)
    board.show(); board.focus()
    await until(board, `Boolean(document.querySelector('[aria-label="Refresh"]:not(:disabled)'))`)
    await caption(board, 'The original board rereads the saved connection. Open Settings, then Connection to open another authorized tab.')
    await click(board, '[aria-label="Settings"]')
    await until(board, `Boolean(document.querySelector('.conn-link'))`)
    const secondOpened = new Promise(resolve => board.webContents.once('did-create-window', resolve))
    await click(board, '.conn-link')
    const second = await secondOpened
    assert.equal(second.webContents.session, browserSession)
    await until(second, `document.querySelector('input')?.value === '${gerritOrigin}'`)
    await caption(second, 'Second-tab check passed. The app opens the saved connection in the same authorized session.')
    await delay(2500)
    // A fresh browser profile is environment setup, with no injected API or cookie.
    const locked = window('unauthorized-' + theme + '-' + Date.now())
    const unauthorized = []
    locked.webContents.session.webRequest.onCompleted({ urls: [approved + '/api/*'] }, details => unauthorized.push(details.statusCode))
    await locked.loadURL(approved + '/#connection')
    await until(locked, `document.body.textContent.includes('Browser session required')`)
    assert.deepEqual(unauthorized, [401])
    await caption(locked, 'Fresh browser profile: HTTP 401. Authorized bootstrap, save/test, reload and second tab passed; both foreign requests were blocked.')
    await delay(3500)
    await screenshot(locked, `unauthenticated-${theme}`)
    await finishRecording()
    results.push({ theme, bootstrap: 200, saveAndTest: 200, foreignRequests: [403, 403], foreignRequestsIncludedCookie: true,
      settingsUnchanged: true, attackerRequests: attackerCalls - beforeAttackerCalls, reload: true, secondTab: true, unauthenticated: 401,
      responses: statuses })
    for (const win of [...windows]) win.destroy()
    await stop(web)
    console.log(theme + ': bootstrap, native save/test, foreign-origin 403 with cookies, unchanged settings, no credential send, reload, real second tab and unauthenticated 401 passed')
  }
  await fs.writeFile(path.join(staged, 'verification.json'), JSON.stringify({ platform: 'Linux Electron Chromium, browser mode without application preload',
    localHttpFixtureOptIn: true, gerrit: 'synthetic account and empty search responses', input: 'native X11 pointer, clicks and keyboard via xdotool', results }, null, 2) + '\n')
  await fs.mkdir(output, { recursive: true })
  for (const name of await fs.readdir(staged)) await fs.copyFile(path.join(staged, name), path.join(output, name))
}).then(async () => { clearTimeout(deadline); await cleanup(); app.quit() })
  .catch(async error => { console.error(error); clearTimeout(deadline); await cleanup(); app.exit(1) })
