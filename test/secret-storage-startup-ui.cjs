// PRIMARY cleanup proof. Real production startup, observed files and native fixture controls.
// No Connection/save/Test action causes cleanup. Only dummy Gerrit responses are simulated.
const { app, BrowserWindow, ipcMain, nativeTheme } = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const http = require('node:http')
const { spawn, execFileSync } = require('node:child_process')
const assert = require('node:assert/strict')
const root = path.resolve(__dirname, '..')
const scratch = fsSync.mkdtempSync(path.join(os.tmpdir(), 'gerrit-startup-proof-'))
const staged = path.join(scratch, 'evidence')
const output = path.join(root, 'docs/screenshots/secret-storage')
app.setPath('userData', path.join(scratch, 'observer-profile'))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let observer, product, current, recorder, fixture, action
let pointer = [30, 30]
let gerritRequests = 0
const processes = new Set()
const run = (win, code) => win.webContents.executeJavaScript(code)
async function wait(check, description) {
  const end = Date.now() + 20000
  while (Date.now() < end) { if (await check()) return; await delay(50) }
  throw Error('Timed out: ' + description)
}
const noSecret = value => { for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in value, false, key) }
const disk = async file => JSON.parse(await fs.readFile(file, 'utf8'))
async function click(selector) {
  const point = await run(observer, `(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)
  const bounds = observer.getBounds(); point.x += bounds.x; point.y += bounds.y
  const args = []
  for (let step = 1; step <= 20; step++) args.push('mousemove', String(Math.round(pointer[0]+(point.x-pointer[0])*step/20)), String(Math.round(pointer[1]+(point.y-pointer[1])*step/20)), 'sleep', '0.05')
  execFileSync('xdotool', args); pointer = [point.x, point.y]
  await delay(2000); execFileSync('xdotool', ['click', '1']); await delay(200)
}
async function update(data) { await run(observer, `window.showEvidence(${JSON.stringify(data)})`); await delay(250) }
async function capture(name) { fsSync.writeFileSync(path.join(staged, name + '.png'), (await observer.webContents.capturePage()).toPNG()) }
async function record(name) {
  recorder = spawn('ffmpeg', ['-y','-loglevel','error','-f','x11grab','-draw_mouse','1','-framerate','20','-video_size','1600x1000','-i',process.env.DISPLAY,'-c:v','libx264','-threads','1','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(staged, name+'.mp4')], {stdio:['pipe','ignore','pipe']})
  let error='';recorder.stderr.on('data',d=>{error+=d});await delay(600);assert.equal(recorder.exitCode,null,error)
  return async()=>{const done=new Promise(resolve=>recorder.once('exit',resolve));recorder.stdin.write('q');assert.equal(await done,0,error);recorder=null}
}
async function stop(child) { if (child) await child.stop() }
async function cleanup() {
  if(recorder&&recorder.exitCode===null){const done=new Promise(resolve=>recorder.once('exit',resolve));recorder.kill('SIGINT');await done}
  for (const child of processes) await stop(child)
  for (const win of [product, observer]) if(win&&!win.isDestroyed())win.destroy()
  if(fixture)await new Promise(resolve=>{fixture.closeAllConnections();fixture.close(resolve)})
  for(const dir of await fs.readdir(scratch)) if(dir.startsWith('desktop-'))await fs.chmod(path.join(scratch,dir),0o700)
  await fs.rm(scratch,{recursive:true,force:true})
  clearTimeout(deadline)
}
const deadline=setTimeout(async()=>{console.error('Startup evidence timeout');await cleanup();app.exit(2)},300000)
app.whenReady().then(async()=>{
  const { startBrowser, audit, identity, legacy }=await import('./fixtures/secret-startup.mjs')
  await fs.mkdir(staged)
  fixture=http.createServer((req,res)=>{
    assert.equal(req.headers.authorization,'Basic '+Buffer.from('dummy:dummy-startup-password').toString('base64'))
    gerritRequests++
    res.setHeader('Content-Type','application/json')
    res.end(JSON.stringify(req.url.startsWith('/a/changes/')?[[],[],[]]:{_account_id:1,username:'dummy',name:'Dummy user',email:'dummy@example.invalid'}))
  })
  await new Promise(resolve=>fixture.listen(19786,'127.0.0.1',resolve))
  async function desktop(profile,mode,failure=false){
    const auditFile=path.join(scratch,'desktop-audit.jsonl');await fs.writeFile(auditFile,'')
    const env={...process.env,GERRIT_GUI_USER_DATA:profile,GERRIT_SECRET_STARTUP_AUDIT:auditFile,GERRIT_SECRET_THEME:mode,GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP:'1',GERRIT_SECRET_FAIL_STARTUP:failure?'1':''}
    for(const key of ['ELECTRON_RUN_AS_NODE','GERRIT_GUI_SCREENSHOT','GERRIT_GUI_TAB','GERRIT_GUI_DEV_UPDATE','NODE_OPTIONS'])delete env[key]
    const child=spawn(process.execPath,['--no-sandbox','--password-store=basic',path.join(root,'test/fixtures/secret-startup-desktop.cjs')],{cwd:root,env,stdio:['ignore','pipe','pipe']})
    let logs='';child.stdout.on('data',d=>{logs+=d});child.stderr.on('data',d=>{logs+=d})
    const exited=new Promise(resolve=>child.once('exit',(code,signal)=>resolve({code,signal})))
    const result={startedAt:Date.now(),auditFile,exited,events:()=>audit(auditFile),get logs(){return logs},async stop(){if(child.exitCode===null&&child.signalCode===null)child.kill('SIGTERM');await exited},async ready(){await wait(async()=>{if(child.exitCode!==null)throw Error(logs);return(await audit(auditFile)).some(e=>e.event==='window-created')},'desktop normal startup');return{at:Date.now(),events:await audit(auditFile)}}}
    processes.add(result);return result
  }
  // Real production failure: lock is acquired normally, then only this fixture directory denies writes.
  const failedProfile=path.join(scratch,'desktop-failed');await fs.mkdir(failedProfile)
  const failedFile=path.join(failedProfile,'settings.json');const failedBefore=JSON.stringify(legacy)
  await fs.writeFile(failedFile,failedBefore)
  const failed=await desktop(failedProfile,'light',true)
  const failure=await Promise.race([failed.exited,delay(15000).then(()=>{throw Error('desktop failure did not exit')})])
  assert.equal(failure.code,1);assert.match(failed.logs,/Desktop startup failed/);assert.equal(await fs.readFile(failedFile,'utf8'),failedBefore);assert.deepEqual(await failed.events(),[])
  await fs.chmod(failedProfile,0o700)
  const results=[]
  const preload=path.join(scratch,'observer-preload.cjs')
  await fs.writeFile(preload,`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('proof',{action:name=>ipcRenderer.invoke('proof:action',name)})`)
  ipcMain.handle('proof:action',(_event,name)=>action(name))
  for(const mode of ['light','dark'])for(const kind of ['browser','desktop']){
    nativeTheme.themeSource=mode
    const profile=path.join(scratch,`${kind}-${mode}`);await fs.mkdir(profile)
    const file=path.join(profile,'settings.json');await fs.writeFile(file,JSON.stringify(legacy,null,2),{mode:0o644});await fs.chmod(file,0o644)
    const before={at:Date.now(),mode:'644',snapshot:await disk(file)}
    product=undefined;current=undefined
    observer=new BrowserWindow({x:900,y:0,width:700,height:1000,frame:false,webPreferences:{contextIsolation:true,sandbox:false,preload}})
    await observer.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(`<!doctype html><style>:root{color-scheme:light dark}body{font:16px/1.4 system-ui;padding:20px;margin:0}h1{font-size:24px}pre{font:13px/1.45 monospace;white-space:pre-wrap;background:light-dark(#f2f4f7,#1c2430);padding:12px;border-radius:6px}button{font:inherit;padding:10px;margin:5px 8px 5px 0}#note{font-size:18px;min-height:72px}#counts{font-weight:bold;color:light-dark(#075a24,#83e6a2)}</style><h1>${kind==='desktop'?'Desktop':'Browser server'} startup evidence</h1><p>Test observer. Actual isolated JSON. Dummy data only.</p><p id="note"></p><button id="start">Start isolated ${kind==='desktop'?'desktop app':'browser servers'}</button><button id="use" disabled>Observe normal board</button><button id="restart" disabled>Restart process</button><p id="counts">No process started. No save actions.</p><b>BEFORE startup</b><pre id="before"></pre><b>AFTER startup</b><pre id="after">Not started</pre><p id="phase">before</p><script>window.showEvidence=data=>{for(const key of ['note','counts','phase'])if(data[key]!==undefined)document.getElementById(key).textContent=data[key];for(const key of ['before','after'])if(data[key]!==undefined)document.getElementById(key).textContent=JSON.stringify(data[key],null,2)};for(const name of ['start','use','restart'])document.getElementById(name).onclick=async()=>{document.getElementById(name).disabled=true;try{await window.proof.action(name)}catch(e){document.getElementById('phase').textContent='ERROR '+e.message}}</script>`))
    let firstEvents,after,startupReadyAt,useRequests=0,restartEvents
    const countSaves=events=>events.filter(e=>e.event==='saveSettings'||e.path==='/api/saveSettings').length
    async function launch(){
      const p=kind==='browser'?await startBrowser(file,{WEB_PORT:'19783',API_PORT:'19784'},true):await desktop(profile,mode)
      processes.add(p);current=p;return p
    }
    action=async name=>{
      if(name==='start'){
        const p=await launch();const ready=await p.ready();startupReadyAt=ready.at;firstEvents=ready.events
        after=await disk(file);noSecret(after)
        const observed=firstEvents.find(e=>e.event===(kind==='browser'?'before-listen':'window-created'))
        noSecret(observed.snapshot);assert.equal(observed.mode,'600');assert.equal(countSaves(firstEvents),0)
        assert.equal(firstEvents.some(e=>e.event==='request'),false,'browser cleanup completed before any client')
        await update({after:observed.snapshot,phase:'cleaned',counts:'Legacy fields absent. saveSettings calls: 0. Connection/save/test actions: 0.',note:'Normal startup removed all four legacy saved fields. No Connection window or save action caused cleanup.'})
        await run(observer,`document.getElementById('use').disabled=false`)
      }else if(name==='use'){
        if(kind==='browser'){
          product=new BrowserWindow({x:0,y:0,width:900,height:1000,frame:false,webPreferences:{partition:`startup-${mode}`,contextIsolation:true,sandbox:true}})
          await product.loadURL(current.launchUrl)
          await wait(()=>run(product,`document.body.innerText.includes('Nothing needs your review')`),'browser normal authenticated board')
          firstEvents=await audit(current.auditFile)
        }else{
          await wait(async()=>(await current.events()).some(e=>e.event==='board-ready'),'desktop automatic dashboard')
          firstEvents=await current.events()
          assert.equal(firstEvents.some(e=>e.event==='renderer-loaded'&&e.connection),false,'normal initial startup opens no Connection window')
        }
        assert.equal(countSaves(firstEvents),0);assert.ok(gerritRequests>=2)
        useRequests=gerritRequests
        await update({phase:'usable',note:'The normal board loaded with the original bound memory password. Gerrit responses are simulated; the client and authentication are real.',counts:'Authenticated use passed. saveSettings calls: 0. Connection/save/test actions: 0.'})
        await run(observer,`document.getElementById('restart').disabled=false`)
      }else if(name==='restart'){
        await stop(current);const p=await launch();await p.ready()
        if(kind==='browser'){
          await product.loadURL(p.launchUrl)
          await wait(()=>run(product,`document.body.innerText.includes('Not connected to Gerrit yet')`),'browser re-entry after restart')
          restartEvents=await audit(p.auditFile)
        }else{
          await wait(async()=>(await p.events()).some(e=>e.event==='requires-reentry'),'desktop re-entry after restart')
          restartEvents=await p.events()
        }
        noSecret(await disk(file));assert.equal(countSaves(restartEvents),0);assert.equal(gerritRequests,useRequests,'new process cannot send old credentials')
        await update({phase:'reentry',note:'A NEW process has no password. The browser board needs setup; desktop opens Connection for re-entry automatically. No user save was performed.',counts:'Restart needs re-entry. New Gerrit requests: 0. saveSettings calls: 0.'})
      }
    }
    await update({before:before.snapshot,phase:'before',note:'BEFORE normal startup, this isolated file contains a dummy legacy password. Start the application. Do not open Connection or save.'})
    await capture(`startup-${kind}-before-${mode}`)
    pointer=[30,30];execFileSync('xdotool',['mousemove','30','30'])
    const finish=await record(`startup-${kind}-${mode}`)
    await delay(2500);await click('#start')
    await wait(()=>run(observer,`document.getElementById('phase').textContent==='cleaned'`),'automatic startup cleanup')
    await capture(`startup-${kind}-after-${mode}`);await delay(4000)
    await click('#use');await wait(()=>run(observer,`document.getElementById('phase').textContent==='usable'`),'normal memory use');await delay(3500)
    await click('#restart');await wait(()=>run(observer,`document.getElementById('phase').textContent==='reentry'`),'restart re-entry');await delay(4500)
    await finish()
    results.push({kind,mode,before,startupReadyAt,after,firstEvents,restartEvents,saveSettingsCalls:0,userConnectionSaveTestActions:0,normalAuthenticatedUse:true,restartNeedsReentry:true,restartNewGerritRequests:0})
    await stop(current);current=null
    if(product&&!product.isDestroyed())product.destroy();observer.destroy();gerritRequests=0
    console.log(`${kind} ${mode}: actual startup removed legacy fields before UI/client use; zero saves; normal memory authentication; new process needs re-entry`)
  }
  await fs.writeFile(path.join(staged,'startup-result.json'),JSON.stringify({desktopFailure:{exitCode:1,oldBytesIntact:true,windowsCreated:0,readinessClaimed:false,permissions:'Actual isolated directory denied writes after normal instance lock'},results},null,2)+'\n')
  for(const file of await fs.readdir(staged))await fs.copyFile(path.join(staged,file),path.join(output,file))
}).then(async()=>{await cleanup();app.quit()}).catch(async error=>{console.error(error);await cleanup();app.exit(1)})
