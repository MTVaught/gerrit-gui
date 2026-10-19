// Real browser-mode renderer, HTTP session flow, file settings, and input actions.
// Gerrit account responses are synthetic. No production credentials are read.
// xvfb-run -a -s '-screen 0 1280x900x24' node_modules/.bin/electron --no-sandbox test/browser-api-ui.cjs
const { app, BrowserWindow, session, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const http = require('node:http')
const { spawn } = require('node:child_process')
const root = path.resolve(__dirname, '..')
const output = path.join(root, 'docs/screenshots/browser-api')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const children = []
const servers = []
let temporary
const deadline = setTimeout(async () => {
  console.error('Browser security check timed out')
  for (const child of children) child.kill('SIGTERM')
  app.exit(2)
}, 900000)
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const listen = server => new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const run = (win, script) => win.webContents.executeJavaScript(script)
async function until(win, script) {
  for (let i = 0; i < 160; i++) { if (await run(win, script)) return; await delay(50) }
  throw new Error('Timed out: ' + script)
}
async function caption(win, text) {
  await run(win, `(() => { let el = document.getElementById('evidence-caption'); if (!el) { el=document.createElement('div'); el.id='evidence-caption'; el.style='position:fixed;bottom:20px;left:20px;right:20px;padding:16px;background:#18344d;color:white;font:18px system-ui;border-radius:8px;z-index:99999;pointer-events:none';document.body.append(el) } el.textContent=${JSON.stringify(text)} })()`)
}
async function click(win, selector) {
  console.log('Input: ' + selector)
  const box = await run(win, `(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  // OS pointer movement is visible in X11 recordings. Mouse events remain real input.
  const [startX, startY] = click.pointer ?? [30, 30]
  const movements = []
  for (let i = 1; i <= 20; i++) {
    const x = Math.round(startX + (box.x - startX) * i / 20)
    const y = Math.round(startY + (box.y - startY) * i / 20)
    movements.push('mousemove', String(x), String(y), 'sleep', '0.03')
  }
  await new Promise(resolve => { const p=spawn('xdotool',movements);p.on('exit',resolve) })
  click.pointer = [box.x, box.y]
  await delay(2000)
  win.webContents.sendInputEvent({ type: 'mouseDown', x:box.x,y:box.y,button:'left',clickCount:1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', x:box.x,y:box.y,button:'left',clickCount:1 })
  await delay(300)
}
async function screenshot(win, name) {
  await fs.writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function stopChild(child, signal = 'SIGTERM') {
  if (child.exitCode !== null) return
  await new Promise(resolve => { child.once('exit', resolve); child.kill(signal) })
}
app.whenReady().then(async () => {
  console.log('Browser ready')
  temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-browser-ui-'))
  app.setPath('userData', path.join(temporary, 'electron'))
  await fs.mkdir(output, { recursive: true })
  let gerritCalls = 0
  const mock = http.createServer((req, res) => {
    gerritCalls++
    assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('audit-dummy:audit-dummy-password').toString('base64'))
    res.setHeader('Content-Type', 'application/json')
    res.end(")]}'\n" + JSON.stringify({ _account_id: 1, username: 'audit-dummy', name: 'Audit Dummy', email: 'dummy@example.invalid' }))
  })
  servers.push(mock)
  const mockPort = await listen(mock)
  const webPort = 19673, apiPort = 19674
  const approved = `http://localhost:${webPort}`
  const settings = path.join(temporary, 'settings.json')
  const web = spawn(process.execPath, [path.join(root, 'scripts/web.mjs')], {
    cwd: root,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WEB_PORT: String(webPort), API_PORT: String(apiPort), WEB_ORIGIN: approved, GERRIT_GUI_WEB_SETTINGS: settings, GERRIT_URL: '', GERRIT_USER: '', GERRIT_PASSWORD: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  children.push(web)
  let logs = ''
  web.stdout.on('data', chunk => { logs += chunk })
  web.stderr.on('data', chunk => { logs += chunk })
  for (let i=0;i<160 && !logs.includes('#browser-key=');i++) await delay(50)
  const launchUrl = logs.match(/http:\/\/localhost:\d+\/#browser-key=[a-f0-9]+/)?.[0]
  assert.ok(launchUrl, logs)
  for (let i=0;i<160;i++) { try { const response=await fetch(approved);if(response.ok)break } catch {} await delay(50) }
  const attackPage = http.createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html')
    res.end(`<!doctype html><html><head><title>Foreign-origin security check</title><style>
      :root{color-scheme:light dark}body{font:20px system-ui;padding:48px}button{font:inherit;padding:14px}pre{white-space:pre-wrap;line-height:1.8}
      </style></head><body><h1>Foreign-origin security check</h1><p>Separate website on another port. Dummy credentials only.</p>
      <p>Attempt to replace the saved server, then request a connection.</p><button id="attack">Send foreign-origin requests</button><pre id="result">Ready</pre>
      <script>document.getElementById('attack').onclick=async()=>{for(const [method,args] of [
      ['saveSettings',[{serverUrl:'http://attacker.invalid',username:'audit-dummy',projects:[],teams:[]}]],['testConnection',[]]]){
      try {await fetch('${approved}/api/'+method,{method:'POST',mode:'no-cors',credentials:'include',headers:{'Content-Type':'text/plain'},body:JSON.stringify(args)})}catch{}}
      document.body.dataset.sent='true'}</script></body></html>`)
  })
  servers.push(attackPage)
  const attackPort = await listen(attackPage)
  const partition = 'security-' + Date.now()
  const browserSession = session.fromPartition(partition)
  const statuses = []
  browserSession.webRequest.onCompleted({urls:[approved+'/api/*']}, details => { statuses.push({url:details.url,status:details.statusCode}) })
  let login = launchUrl
  for (const theme of ['light','dark']) {
    console.log('Start ' + theme)
    await fs.rm(settings, { force: true })
    nativeTheme.themeSource=theme
    const win = new BrowserWindow({width:1280,height:900,x:0,y:0,frame:false,webPreferences:{partition,contextIsolation:true,sandbox:true}})
    await win.loadURL(login + (theme==='light' ? '&connection' : '#connection'))
    await until(win, `Boolean(document.querySelector('input[type=password]'))`)
    assert.equal(await run(win, `new URLSearchParams(location.hash.slice(1)).has('browser-key')`), false, 'bootstrap key is removed from history')
    assert.equal(await run(win, 'document.cookie'), '', 'session cookie is HttpOnly')
    const cookies = await browserSession.cookies.get({url:approved+'/api/'})
    assert.ok(cookies.some(cookie => cookie.name.startsWith('gerrit_session_') && cookie.httpOnly && cookie.sameSite === 'strict'))
    const recorder=spawn('ffmpeg',['-y','-f','x11grab','-draw_mouse','1','-framerate','10','-video_size','1280x900','-i',process.env.DISPLAY,'-c:v','libx264','-threads','1','-preset','ultrafast','-crf','23','-pix_fmt','yuv420p','-movflags','+faststart',path.join(output,`browser-session-${theme}.mp4`)],{stdio:['pipe','ignore','ignore']})
    children.push(recorder)
    await delay(600)
    await caption(win,'Linux Chromium browser mode. Use Ctrl+A to replace each field with dummy credentials, then click Test and save.')
    for (const [selector,value] of [['input:not([type])',`http://127.0.0.1:${mockPort}`],['label:nth-of-type(2) input','audit-dummy'],['input[type=password]','audit-dummy-password']]) {
      await click(win,selector)
      // Select all is a real key input; this prepares the fixture fields.
      win.webContents.sendInputEvent({type:'keyDown',keyCode:'A',modifiers:['control']})
      win.webContents.sendInputEvent({type:'keyUp',keyCode:'A',modifiers:['control']})
      await win.webContents.insertText(value)
    }
    await click(win,'button[type=submit]')
    await until(win, `document.body.textContent.includes('Connected as Audit Dummy')`)
    await caption(win,'Authorized session: settings saved. Gerrit fixture confirms the dummy account.')
    await delay(1800)
    await screenshot(win,`connected-${theme}`)
    const before = await fs.readFile(settings,'utf8')
    const beforeCalls = gerritCalls
    const start = statuses.length
    await win.loadURL(`http://localhost:${attackPort}`)
    await caption(win,'Separate website: send text/plain saveSettings and testConnection requests with browser cookies.')
    await click(win,'#attack')
    await until(win, `document.body.dataset.sent === 'true'`)
    await delay(400)
    const rejected = statuses.slice(start).filter(s=>s.url.includes('/api/'))
    assert.deepEqual(rejected.map(s=>s.status),[403,403])
    assert.equal(await fs.readFile(settings,'utf8'),before)
    assert.equal(gerritCalls,beforeCalls)
    await run(win, `document.getElementById('result').textContent='Network responses observed by Chromium:\\nPOST saveSettings  → HTTP 403\\nPOST testConnection → HTTP 403\\n\\nIsolated settings file unchanged.\\nNo request reached the Gerrit fixture.'`)
    await caption(win,'Both foreign-origin requests return HTTP 403. Saved settings and dummy credentials stay at the approved server.')
    await delay(2200)
    await screenshot(win,`foreign-origin-${theme}`)
    await win.loadURL(approved+'/#connection')
    await until(win, `document.querySelector('input')?.value === 'http://127.0.0.1:${mockPort}'`)
    await caption(win,'Reload: the same browser session still opens the connection form. The approved server URL is unchanged.')
    await delay(1800)
    const second = new BrowserWindow({show:false,webPreferences:{partition,contextIsolation:true,sandbox:true}})
    await second.loadURL(approved+'/#connection')
    await until(second, `Boolean(document.querySelector('input[type=password]'))`)
    second.destroy()
    // A fresh browser profile gets no session even with the same Origin and Host.
    const locked = new BrowserWindow({width:1280,height:900,x:0,y:0,frame:false,webPreferences:{partition:'unauthorized-'+theme,contextIsolation:true,sandbox:true}})
    const unauthorizedResponses = []
    locked.webContents.session.webRequest.onCompleted({urls:[approved+'/api/*']}, details => { unauthorizedResponses.push(details.statusCode) })
    await locked.loadURL(approved+'/#connection')
    await until(locked, `document.body.textContent.includes('Browser session required')`)
    assert.deepEqual(unauthorizedResponses, [401])
    await caption(locked,'Fresh browser profile, without the one-use key: access fails with HTTP 401.')
    await delay(2200)
    await screenshot(locked,`unauthenticated-${theme}`)
    recorder.stdin.write('q')
    await new Promise(resolve=>recorder.once('exit',resolve))
    locked.destroy();win.destroy()
    login=approved+'/'
    console.log(`${theme}: real save/test input, HTTP 403 foreign-origin attacks, unchanged file and Gerrit call count, reload and second-tab success, HTTP 401 fresh profile`)
  }
  // Record only safe checks, never the live startup key or session cookie.
  await fs.writeFile(path.join(output,'verification.json'),JSON.stringify({platform:'Linux Electron Chromium, browser mode without preload',gerrit:'synthetic dummy account HTTP fixture',checks:statuses.map(s=>({method:s.url.split('/').pop(),status:s.status})),gerritCalls},null,2)+'\n')
}).then(async()=>{
  for(const child of children)await stopChild(child)
  for(const server of servers)server.close()
  if(temporary)await fs.rm(temporary,{recursive:true,force:true})
  clearTimeout(deadline);app.quit()
}).catch(async error=>{console.error(error);for(const child of children)await stopChild(child);for(const server of servers)server.close();if(temporary)await fs.rm(temporary,{recursive:true,force:true});app.exit(1)})
