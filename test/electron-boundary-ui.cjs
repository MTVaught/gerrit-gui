// Build first. Runs the real main, production preload and renderer with dummy credentials.
// External OS dispatch is intercepted. Gerrit and hostile pages use a loopback fixture.
const { app, BrowserWindow, ipcMain, nativeTheme, shell, safeStorage } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')
const theme = process.env.BOUNDARY_THEME || 'light'
const record = process.env.BOUNDARY_RECORD === '1'
const devRenderer = process.env.BOUNDARY_DEV_RENDERER === '1'
const output = path.resolve(process.env.BOUNDARY_ARTIFACTS || 'docs/screenshots/electron-boundary')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-electron-boundary-'))
const entryMode = devRenderer ? 'vite' : 'file'
const artifact = name => path.join(output, `${name}-${entryMode}-${theme}`)
const rendererFile = path.resolve(__dirname, '../out/renderer/index.html')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', profile)
app.disableHardwareAcceleration()
nativeTheme.themeSource = theme
process.env.GERRIT_GUI_USER_DATA = profile
process.env.GERRIT_GUI_TAB = 'settings'
delete process.env.GERRIT_GUI_DEV_UPDATE
delete process.env.ELECTRON_RENDERER_URL
for (const key of ['GERRIT_URL', 'GERRIT_USER', 'GERRIT_PASSWORD']) delete process.env[key]
process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP = '1'
process.env.XDG_CONFIG_HOME = path.join(profile, 'xdg')
process.env.XDG_CACHE_HOME = path.join(profile, 'cache')
const channels = []
const register = ipcMain.handle.bind(ipcMain)
ipcMain.handle = (channel, handler) => { channels.push(channel); register(channel, handler) }
const opened = []
const badgeCounts = []
const setBadgeCount = app.setBadgeCount.bind(app)
app.setBadgeCount = count => { badgeCounts.push(count); return setBadgeCount(count) }
const popupDecisions = []
app.on('web-contents-created', (_event, contents) => {
  const setHandler = contents.setWindowOpenHandler.bind(contents)
  contents.setWindowOpenHandler = handler => setHandler(details => {
    const response = handler(details)
    popupDecisions.push({ contents: contents.id, url: details.url, response })
    return response
  })
})
let slackFails = false
shell.openExternal = async url => {
  opened.push(url)
  if (slackFails && url.startsWith('slack:')) throw new Error('Fixture: Slack not installed')
}
const requests = []
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  if (url.pathname.startsWith('/a/')) {
    requests.push({ method: req.method, path: url.pathname, auth: req.headers.authorization })
    res.setHeader('Content-Type', 'application/json')
    let data
    if (url.pathname === '/a/accounts/self') data = { _account_id: 1, username: 'dummy-security', name: 'Dummy Security', email: 'dummy@example.test' }
    else if (url.pathname === '/a/changes/') data = url.searchParams.getAll('q').map(() => [])
    else if (url.pathname === '/a/accounts/self/capabilities') data = {}
    else { res.statusCode = 404; data = {} }
    res.end(")]}'\n" + JSON.stringify(data))
    return
  }
  if (url.pathname === '/redirect') { res.writeHead(302, { Location: '/hostile.html' }); res.end(); return }
  if (url.pathname === '/hostile.html') { res.end('<!doctype html><h1>Untrusted fixture document</h1>'); return }
  const file = path.resolve(path.dirname(rendererFile), '.' + url.pathname)
  if (file.startsWith(path.dirname(rendererFile) + path.sep) && fs.existsSync(file) && fs.statSync(file).isFile()) {
    res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html')
    fs.createReadStream(file).pipe(res)
  } else { res.statusCode = 404; res.end('Not found') }
})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
async function until(check, label) {
  const deadline = Date.now() + 20000
  while (Date.now() < deadline) { if (await check()) return; await delay(100) }
  throw new Error('Timed out: ' + label)
}
const run = (win, script) => win.webContents.executeJavaScript(script)
let recorder, desktop, vite
async function stopRecording() {
  if (!recorder) return
  const current = recorder
  recorder = null
  if (current.exitCode !== null) { assert.equal(current.exitCode, 0, 'recorder exited early'); return }
  const finished = new Promise(resolve => current.once('exit', resolve))
  current.stdin.write('q')
  assert.equal(await finished, 0, 'video encoder completed')
}
function cleanup() {
  if (recorder) recorder.kill('SIGINT')
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  if (desktop) desktop.kill()
  server.close()
  if (vite) void vite.close()
  fs.rmSync(profile, { recursive: true, force: true })
}
app.on('will-quit', cleanup)
let stage = 'startup'
const timeout = setTimeout(() => { console.error('Boundary test timeout at ' + stage); cleanup(); app.exit(2) }, 180000)

async function panel(win) {
  await run(win, `(() => {
    document.querySelector('#boundary-evidence')?.remove();
    const section = document.createElement('section'); section.id = 'boundary-evidence';
    section.style.cssText = 'position:fixed;z-index:100000;right:24px;top:110px;width:440px;padding:22px;border:2px solid ${theme === 'dark' ? '#7184a0' : '#7b8b9e'};border-radius:12px;background:${theme === 'dark' ? '#182330' : '#f5f8fc'};color:${theme === 'dark' ? '#f1f5fa' : '#172332'};font:16px/1.5 sans-serif;box-shadow:0 8px 30px #0003';
    section.innerHTML = '<strong>Electron boundary fixture · ${theme}</strong><p style="font-size:14px">Linux · dummy credentials · local Gerrit fixture.<br>OS link dispatch is intercepted and checked.</p><p id="boundary-caption" style="min-height:72px;font-weight:600"></p><div style="display:grid;gap:10px"><a id="boundary-protocol" href="slack://channel?team=T123&amp;id=C123" target="_blank">Try a direct slack:// popup</a><a id="boundary-navigation" href="BASE/hostile.html">Try external page navigation</a><button id="boundary-web">Open HTTPS through trusted IPC</button></div><p id="boundary-result" style="min-height:72px;font-size:14px"></p>';
    for (const a of section.querySelectorAll('a,button')) { a.style.color = '${theme === 'dark' ? '#91c8ff' : '#0057a8'}'; a.style.padding = '8px'; a.style.border = '1px solid currentColor'; a.style.borderRadius = '6px'; ${theme === 'dark' ? "a.style.background = '#182330';" : ''} }
    section.querySelector('#boundary-web').onclick = () => { void api.openUrl('https://example.test/review') };
    document.body.append(section);
  })()`.replace('BASE', base))
}
async function caption(win, text) {
  await run(win, `document.querySelector('#boundary-caption').textContent = ${JSON.stringify(text)}`)
  await delay(record ? 1200 : 20)
}
async function result(win, text) {
  await run(win, `document.querySelector('#boundary-result').textContent = ${JSON.stringify(text)}`)
  await delay(record ? 1800 : 20)
}
async function click(win, selector) {
  if (!win.isVisible()) win.show()
  win.focus()
  await until(() => win.isFocused(), 'native window focus')
  await delay(200)
  const point = await run(win, `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el) throw Error('Missing control'); const r = el.getBoundingClientRect(); return { x: r.x + r.width/2, y: r.y + r.height/2 } })()`)
  const bounds = win.getContentBounds()
  const target = { x: Math.round(bounds.x + point.x), y: Math.round(bounds.y + point.y) }
  const pos = Object.fromEntries(execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' }).trim().split('\n').map(row => row.split('=')))
  for (let i = 1; i <= 16; i++) {
    execFileSync('xdotool', ['mousemove', String(Math.round(Number(pos.X) + (target.x - Number(pos.X)) * i / 16)), String(Math.round(Number(pos.Y) + (target.y - Number(pos.Y)) * i / 16))])
    await delay(record ? 45 : 1)
  }
  await until(async () => {
    if (await run(win, `document.querySelector(${JSON.stringify(selector)}).matches(':hover')`)) return true
    // The window manager can finish positioning a window after it becomes visible.
    const latest = await run(win, `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x:r.x+r.width/2, y:r.y+r.height/2 } })()`)
    const content = win.getContentBounds()
    execFileSync('xdotool', ['mousemove', String(Math.round(content.x + latest.x)), String(Math.round(content.y + latest.y))])
    return false
  }, 'native pointer over ' + selector)
  await delay(record ? 2000 : 250)
  execFileSync('xdotool', ['click', '1'])
  await delay(150)
}
let base
;(async () => {
  await new Promise(resolve => server.listen(Number(process.env.BOUNDARY_PORT || 0), '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  if (devRenderer) {
    const { createServer } = await import('vite')
    const react = (await import('@vitejs/plugin-react')).default
    vite = await createServer({ configFile: false, root: path.resolve(__dirname, '../src/renderer'), plugins: [react()], server: { host: '127.0.0.1', port: Number(process.env.BOUNDARY_VITE_PORT || 0) }, clearScreen: false })
    await vite.listen()
    process.env.ELECTRON_RENDERER_URL = vite.resolvedUrls.local[0]
  }
  fs.writeFileSync(path.join(profile, 'settings.json'), JSON.stringify({
    serverUrl: base, username: 'dummy-security', password: 'legacy-dummy-A', passwordEncrypted: false, passwordIdentity: { serverUrl: base, username: 'legacy-account' },
    theme, projects: [], slackWorkspaces: [{ domain: 'fixture', teamId: 'T123' }],
    ui: { compact: false, bounds: { x: 40, y: 50, width: 1200, height: 800 } },
  }))
  desktop = spawn('openbox', [], { stdio: 'ignore' })
  require('../out/main/index.js')
  await app.whenReady()
  let main
  await until(() => {
    main = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('#tab=settings'))
    return main && !main.webContents.isLoading()
  }, 'main renderer')
  main.setMenuBarVisibility(false)
  main.setBounds({ x: 40, y: 50, width: 1200, height: 800 })
  await until(() => run(main, "Boolean(document.querySelector('.conn-link'))"), 'settings loaded through trusted IPC')
  assert.equal((await run(main, 'api.getSettings()')).username, 'dummy-security')
  assert.equal(await run(main, 'typeof process'), 'undefined', 'Node is not exposed')
  const prefs = main.webContents.getLastWebPreferences()
  assert.equal(prefs.sandbox, true)
  assert.equal(prefs.contextIsolation, true)
  assert.equal(prefs.nodeIntegration, false)
  assert.equal(prefs.nodeIntegrationInSubFrames, false)
  assert.equal(prefs.webviewTag, false)
  let connection
  await until(() => {
    connection = BrowserWindow.getAllWindows().find(w => w !== main && w.webContents.getURL().endsWith('#connection'))
    return connection && !connection.webContents.isLoading()
  }, 'connection renderer')
  connection.setMenuBarVisibility(false)
  connection.setBounds({ x: 95, y: 190, width: 520, height: 560 })
  await until(() => run(connection, "Boolean(document.querySelector('input[type=password]'))"), 'connection form')
  await panel(main)
  if (record) {
    recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1280x900', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-threads', '4', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', artifact('electron-boundary') + '.mp4'], { stdio: ['pipe', 'ignore', fs.openSync(artifact('capture') + '.log', 'w')] })
    await delay(500)
  }
  const cleaned = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')))
  assert.equal('password' in cleaned, false, 'startup removed the legacy password for the old account')
  assert.equal((await run(main, 'api.getSettings()')).hasPassword, false, 'old account secret is not rebound')
  assert.equal(requests.length, 0, 'legacy credentials never reach Gerrit')
  await caption(main, 'Startup removed the old account secret. Enter an explicit replacement for the intended dummy account.')
  stage = 'connection'; console.log(stage)
  await click(connection, 'input[type=password]')
  execFileSync('xdotool', ['type', '--clearmodifiers', '--delay', record ? '80' : '1', 'dummy-ui-password'])
  await click(connection, 'button[type=submit]')
  await until(() => run(connection, "document.querySelector('.status.ok')?.textContent.includes('Connected as Dummy Security')"), 'connection test and save')
  const stored = JSON.parse(fs.readFileSync(path.join(profile, 'settings.json')))
  const storage = await run(main, 'api.getSettings()')
  assert.equal(storage.hasPassword, true)
  const trustedKeychain = safeStorage.isEncryptionAvailable() && ['gnome_libsecret','kwallet','kwallet5','kwallet6'].includes(safeStorage.getSelectedStorageBackend())
  assert.equal(storage.passwordStorage, trustedKeychain ? 'secure' : 'session')
  assert.equal(JSON.stringify(stored).includes('dummy-ui-password'), false, 'no plaintext password in JSON')
  if (!trustedKeychain) assert.equal('password' in stored, false, 'memory-only secret stays absent from JSON')
  assert.ok(requests.every(req => req.auth === 'Basic ' + Buffer.from('dummy-security:dummy-ui-password').toString('base64')), 'only the intended account and explicit replacement reach the real service')
  assert.ok(requests.some(req => req.auth === 'Basic ' + Buffer.from('dummy-security:dummy-ui-password').toString('base64')))
  await result(main, 'Connection IPC accepted. Replacement stays out of plain JSON. Only the intended dummy account reached local Gerrit.')
  execFileSync('ffmpeg', ['-y', '-f', 'x11grab', '-video_size', '1280x900', '-i', process.env.DISPLAY, '-frames:v', '1', artifact('connection-success') + '.png'], { stdio: 'ignore' })
  // Both production window-open handlers receive the same hostile URL matrix.
  for (const win of [main, connection]) {
    const before = opened.length
    for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,hostile', 'slack://channel?team=T123&id=C123', 'mailto:dummy@example.test', 'ms-settings:privacy', 'https://user:pass@example.test/']) {
      await run(win, `window.open(${JSON.stringify(url)}, '_blank')`)
    }
    await delay(100)
    assert.equal(opened.length, before, 'hostile popup schemes never reach shell')
    await run(win, "window.open('https://example.test/window', '_blank')")
    await delay(100)
    assert.equal(opened.length, before, 'even web popups cannot dispatch without an authenticated initiator')
    assert.equal(BrowserWindow.getAllWindows().length, 2, 'no Electron popup created')
    assert.ok(popupDecisions.some(item => item.contents === win.webContents.id && item.url === 'https://example.test/window' && item.response.action === 'deny'), 'each window denies a popup at its real Electron handler')
    // Real renderer navigation, not a synthetic Electron event.
    const original = win.webContents.getURL()
    await run(win, `location.href = ${JSON.stringify(base + '/hostile.html')}`)
    await delay(100)
    assert.equal(win.webContents.getURL(), original)
  }
  await caption(main, 'Click Done, then reopen Connection from Settings. The trusted IPC must create a working window.')
  await click(connection, 'button[type=button]')
  await until(() => connection.isDestroyed(), 'connection closed by trusted IPC')
  await click(main, '.conn-link')
  await until(() => {
    connection = BrowserWindow.getAllWindows().find(w => w !== main && w.webContents.getURL().endsWith('#connection'))
    return connection && !connection.webContents.isLoading()
  }, 'connection reopened through IPC')
  connection.setMenuBarVisibility(false)
  connection.setBounds({ x:95, y:190, width:520, height:560 })
  await until(() => run(connection, "Boolean(document.querySelector('input[type=password]'))"), 'reopened form')
  assert.equal((await run(connection, 'api.getSettings()')).hasPassword, true)
  await result(main, 'Connection reopened through trusted IPC. The intended account still has its memory-only replacement.')
  await caption(main, 'Close Connection. Try a direct slack:// popup. Only main-generated Slack links may reach the OS.')
  await click(connection, 'button[type=button]')
  await until(() => connection.isDestroyed(), 'reopened connection closed')
  const beforeFile = opened.length
  const popupBeforeFile = popupDecisions.length
  await click(main, '#boundary-protocol')
  await until(() => popupDecisions.length === popupBeforeFile + 1, 'real custom protocol link reaches window-open handler')
  assert.equal(opened.length, beforeFile)
  assert.equal(BrowserWindow.getAllWindows().length, 1)
  await result(main, 'Blocked direct slack:// popup. No OS dispatch. No Electron child window. Both app windows passed the scheme checks.')
  await caption(main, 'Try to replace the app with an external page. The app must stay on Settings.')
  const initial = main.webContents.getURL()
  let blockedNavigation = false
  for (const name of ['will-frame-navigate', 'will-navigate']) main.webContents.on(name, event => { if (event.url === base + '/hostile.html') blockedNavigation ||= event.defaultPrevented })
  await click(main, '#boundary-navigation')
  assert.equal(main.webContents.getURL(), initial)
  await until(() => blockedNavigation, 'real navigation reaches boundary')
  assert.ok(await run(main, "Boolean(document.querySelector('.conn-link'))"))
  await result(main, 'External page navigation blocked. The trusted Settings document and IPC remain active.')
  await caption(main, 'Open an allowed HTTPS link. The fixture records the OS dispatch without launching a browser.')
  await click(main, '#boundary-web')
  await until(() => opened.at(-1) === 'https://example.test/review', 'HTTPS dispatch')
  await result(main, 'HTTPS accepted for external dispatch. The app stays on Settings. No Electron child window.')
  await run(main, "document.body.append(document.createElement('iframe')); true")
  await until(() => main.webContents.mainFrame.frames.length > 0, 'trusted app child')
  const appChild = main.webContents.mainFrame.frames[0]
  assert.equal(await appChild.executeJavaScript('typeof api'), 'undefined', 'production child has no privileged bridge')
  const beforeChildPopup = opened.length
  await appChild.executeJavaScript("window.open('https://example.test/child', '_blank')")
  await delay(100)
  assert.equal(opened.length, beforeChildPopup, 'trusted parent does not authorize child popup initiators')
  let childNavigationBlocked = false
  const pinnedChildTarget = initial.split('#')[0]
  main.webContents.on('will-frame-navigate', event => { if (!event.isMainFrame && event.url === pinnedChildTarget) childNavigationBlocked = event.defaultPrevented })
  await run(main, `document.querySelector('iframe').src = ${JSON.stringify(pinnedChildTarget)}`)
  await until(() => childNavigationBlocked, 'child navigation denied')
  assert.notEqual(appChild.url, pinnedChildTarget)
  await run(main, "document.querySelector('iframe').remove()")
  await until(() => appChild.detached, 'production child detached')
  let webviewPrevented = false
  main.webContents.emit('will-attach-webview', { preventDefault() { webviewPrevented = true } }, {}, {})
  assert.equal(webviewPrevented, true, 'synthetic defensive webview hook event is canceled')
  // Legitimate named APIs, generated Gerrit links, releases and Slack fallback.
  await run(main, "api.openChange({project:'demo/project',id:12,patchSet:3,basePatchSet:2})")
  assert.equal(opened.at(-1), base + '/c/demo%2Fproject/+/12/2..3')
  await run(main, 'api.openReleaseNotes()')
  assert.match(opened.at(-1), /^https:\/\/github.com\//)
  await run(main, "api.openUrl('https://fixture.slack.com/archives/C123/p1726500000123456')")
  assert.equal(opened.at(-1), 'slack://channel?team=T123&id=C123&message=1726500000.123456')
  slackFails = true
  await run(main, "api.openUrl('https://fixture.slack.com/archives/C123')")
  assert.deepEqual(opened.slice(-2), ['slack://channel?team=T123&id=C123', 'https://fixture.slack.com/archives/C123'])
  for (const url of ['file:///etc/passwd', 'javascript:alert(1)', 'data:text/html,x', 'slack://channel', 'https://user:pass@example.test', 'https://', 'https://example.test\\@evil.test', null]) {
    const before = opened.length
    await assert.rejects(run(main, `api.openUrl(${JSON.stringify(url)})`))
    assert.equal(opened.length, before)
  }
  // Real rogue sender, with the same URL as the trusted app. Every invoke channel must reject it.
  await caption(main, 'Check hostile IPC senders. A separate window with the same app URL must have no authority.')
  await delay(600)
  const settingsBefore = fs.readFileSync(path.join(profile, 'settings.json'), 'utf8')
  const shellBefore = opened.length
  const unauthorizedBadge = { counts:{ review:719,fix:0,ready:0,merge:0 }, menu:{review:[],fix:[],ready:[],merge:[]}, style:'color', showAppBadge:true, showTrayCounts:false }
  stage = 'create rogue window'; console.log(stage)
  const rogue = new BrowserWindow({ show: false, webPreferences: { partition: 'boundary-adversary', sandbox: true, contextIsolation: true, preload: path.join(__dirname, 'fixtures/boundary-probe-preload.cjs'), nodeIntegrationInSubFrames: true } })
  stage = 'load rogue document'; console.log(stage)
  // Serve a small probe document at the exact app URL in this window's isolated session.
  await rogue.webContents.session.protocol.handle(devRenderer ? 'http' : 'file', () => new Response('<!doctype html><h1>Adversarial window fixture</h1>'))
  await rogue.loadURL(initial)
  stage = 'probe rogue channels'; console.log(stage)
  const replies = await run(rogue, `(async () => { const results = []; for (const channel of ${JSON.stringify(channels)}) { try { await boundaryProbe.invoke(channel); results.push({channel, rejected:false}) } catch (e) { results.push({channel, rejected:e.message.includes('Untrusted IPC sender')}) } } boundaryProbe.send('ui:badge', null); boundaryProbe.send('ui:badge', ${JSON.stringify(unauthorizedBadge)}); return results })()`)
  assert.ok(replies.length > 40)
  assert.ok(replies.every(reply => reply.rejected), JSON.stringify(replies.filter(reply => !reply.rejected)))
  stage = 'probe child frame'; console.log(stage)
  // A child frame also sends actual IPC using this adversarial preload.
  await run(rogue, `(() => { const frame = document.createElement('iframe'); frame.src = ${JSON.stringify(base + '/hostile.html')}; document.body.append(frame); return true })()`)
  await until(() => rogue.webContents.mainFrame.frames.length > 0, 'rogue child frame')
  const child = rogue.webContents.mainFrame.frames[0]
  assert.ok(child)
  await until(() => child.url === base + '/hostile.html', 'rogue frame document')
  await until(() => child.executeJavaScript('typeof boundaryProbe === \"object\"'), 'adversarial child preload')
  const childReplies = await child.executeJavaScript(`(async () => { const results=[]; for (const channel of ${JSON.stringify(channels)}) { try { await boundaryProbe.invoke(channel); results.push(false) } catch(e) { results.push(e.message.includes('Untrusted IPC sender')) } } return results })()`)
  assert.equal(childReplies.length, channels.length)
  assert.ok(childReplies.every(Boolean), JSON.stringify(childReplies))
  await child.executeJavaScript(`boundaryProbe.send('ui:badge', null); boundaryProbe.send('ui:badge', ${JSON.stringify(unauthorizedBadge)})`)
  await run(rogue, `document.querySelector('iframe').remove()` )
  await until(() => child.detached, 'detached native child frame')
  rogue.destroy()
  await delay(100)
  assert.equal(fs.readFileSync(path.join(profile, 'settings.json'), 'utf8'), settingsBefore)
  assert.equal(opened.length, shellBefore)
  assert.equal(badgeCounts.includes(719), false, 'send-only unauthorized badge has no effect')
  await result(main, `${replies.length} invoke channels rejected the rogue window. Child-frame IPC rejected. Send-only badge IPC dropped without a side effect.`)
  await delay(record ? 2500 : 50)
  fs.writeFileSync(artifact('boundary-result') + '.png', (await main.webContents.capturePage()).toPNG())
  await stopRecording()
  stage = 'probe navigated app'; console.log(stage)
  // Force a main-process navigation to test sender checks independently of navigation prevention.
  // Electron loadURL deliberately bypasses renderer navigation events.
  await main.loadURL(base + '/hostile.html')
  assert.equal(main.webContents.mainFrame.url, base + '/hostile.html', 'validate the current document even when Electron reuses the frame object')
  assert.equal(await run(main, 'typeof api.getSettings'), 'function')
  await assert.rejects(run(main, 'api.getSettings()'), /Untrusted IPC sender/)
  await assert.rejects(run(main, 'api.saveSettings({})'), /Untrusted IPC sender/)
  const beforeUntrusted = opened.length
  await run(main, "window.open('https://example.test/untrusted', '_blank')")
  await delay(100)
  assert.equal(opened.length, beforeUntrusted, 'navigated app window cannot dispatch popups')
  // The production preload must not expose the bridge in child frames.
  await run(main, "document.body.append(document.createElement('iframe')); true")
  await until(() => main.webContents.mainFrame.frames.length > 0, 'production child frame')
  assert.equal(await main.webContents.mainFrame.frames[0].executeJavaScript('typeof api'), 'undefined')
  const sameOriginSibling = devRenderer ? new URL('hostile.html', initial).href : require('node:url').pathToFileURL(path.join(profile, 'hostile.html')).href
  if (!devRenderer) fs.writeFileSync(path.join(profile, 'hostile.html'), '<!doctype html><h1>Untrusted local sibling</h1>')
  await main.loadURL(sameOriginSibling)
  await assert.rejects(run(main, 'api.getSettings()'), /Untrusted IPC sender/)
  stage = 'probe redirect'; console.log(stage)
  // A server redirect during a main-process load must still be stopped.
  let redirectBlocked = false
  main.webContents.on('will-redirect', event => { redirectBlocked = event.defaultPrevented })
  await main.loadURL(base + '/redirect').catch(() => {})
  assert.equal(redirectBlocked, true)
  await main.loadURL(initial)
  await until(() => run(main, "Boolean(document.querySelector('.conn-link'))"), 'trusted renderer restored')
  assert.equal((await run(main, 'api.getSettings()')).username, 'dummy-security')
  await run(main, "location.hash = 'tab=settings&team=fixture'")
  assert.equal((await run(main, 'api.getUi()')).compact, false, 'hash routing stays trusted')
  stage = 'reload trusted app'; console.log(stage)
  const reloaded = new Promise(resolve => main.webContents.once('did-finish-load', resolve))
  main.webContents.reload()
  await reloaded
  assert.equal((await run(main, 'api.getSettings()')).username, 'dummy-security')
  fs.writeFileSync(artifact('checks') + '.json', JSON.stringify({ platform:process.platform, electron:process.versions.electron, theme, simulatedDomInput: false, keychain:trustedKeychain, storage:storage.passwordStorage, childChannels:childReplies.length, unauthorizedBadgeBlocked:!badgeCounts.includes(719), productionChildBridgeAbsent:true, childPopupDenied:true, sameOriginSiblingRejected:true, childNavigationBlocked, webviewHookSimulated:true, renderer: devRenderer ? 'http' : 'file', channels: channels.length, rejectedSenders: replies, childFrameRejected: true, navigatedAppRejected: true, redirectBlocked, connectionSaved: true, sandbox: prefs.sandbox, externalDispatchIntercepted: true }, null, 2))
  console.log(`${theme} ${devRenderer ? 'HTTP' : 'file'}: ${channels.length} channels reject rogue sender; child-frame and navigated app rejected; navigation and redirects blocked; real connection save, hash routing, reload, web links, Gerrit links, release notes and Slack fallback pass`)
  clearTimeout(timeout)
  cleanup()
  app.exit(0)
})().catch(async error => { console.error(error); await stopRecording(); cleanup(); app.exit(1) })
