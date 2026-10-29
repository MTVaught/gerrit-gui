// Record the production desktop with real X11 clicks and delayed simulated Gerrit.
// Run from the repo root under a 1920x1080 Xvfb and separate D-Bus session.
const root = process.cwd()
const req = require('node:module').createRequire(root + '/package.json')
const {app, BrowserWindow, nativeTheme} = req('electron')
const fs = require('node:fs'), path = require('node:path')
const {spawn, execFile} = require('node:child_process')
const {promisify} = require('node:util')
const assert = require('node:assert/strict')
const theme = process.env.RESET_REVIEWED_THEME || 'light'
const output = path.join(root, 'openspec/changes/archive/2026-10-29-mark-all-files-unreviewed/evidence')
fs.mkdirSync(output, { recursive: true })
const scratch = fs.mkdtempSync('/tmp/review-flags-app-')
app.setPath('userData', scratch); app.disableHardwareAcceleration(); nativeTheme.themeSource = theme
process.env.GERRIT_GUI_USER_DATA = scratch
process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP = '1'
const delay = ms => new Promise(r=>setTimeout(r,ms))
const input = (...args) => promisify(execFile)('xdotool', args.map(String))
const run = (w,s) => w.webContents.executeJavaScript(s)
const files = ['src/telemetry/batch-scheduler.ts','src/telemetry/clock.ts','src/telemetry/queue.ts','src/telemetry/transport.ts','src/telemetry/types.ts']
let caption, recorder, wm, fixture, board, review, started
const captions = []
async function until(check,label) {for(let i=0;i<300;i++){if(await check())return;await delay(60)}throw Error('Timed out: '+label)}
async function say(text){console.log(text);captions.push({seconds:(Date.now()-started)/1000,text});await run(caption,`document.querySelector('p').textContent=${JSON.stringify(text)}`);await delay(900)}
async function target(w,selector){const r=await run(w,`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);const b=w.getContentBounds();return [Math.round(b.x+r.x+r.width/2),Math.round(b.y+r.y+r.height/2)]}
async function move(x,y,hover=2000){const p=(await input('getmouselocation','--shell')).stdout;const sx=+p.match(/^X=(\d+)/m)[1],sy=+p.match(/^Y=(\d+)/m)[1];for(let i=1;i<=12;i++){await input('mousemove',Math.round(sx+(x-sx)*i/12),Math.round(sy+(y-sy)*i/12));await delay(45)}await delay(hover)}
async function click(w,sel){await move(...await target(w,sel));await input('click',1);await delay(300)}
async function snapshot(name){fs.writeFileSync(path.join(output,name+'-'+theme+'.png'),(await review.webContents.capturePage()).toPNG())}
async function finish(code=0){if(recorder){recorder.stdin.write('q');await new Promise(r=>recorder.once('exit',r));recorder=null}fixture?.server.close();wm?.kill();app.exit(code)}
setTimeout(()=>{console.error('timeout');finish(2)},150000).unref()
;(async()=>{
  fixture = await req(root+'/test/fixtures/review-windows-server.cjs').startReviewServer()
  fixture.state.files = Object.fromEntries(files.map(file=>[file,{lines_inserted:3,lines_deleted:2}]))
  fixture.state.reviewed.set(3,new Set(files.slice(0,3)))
  fs.writeFileSync(path.join(scratch,'settings.json'),JSON.stringify({serverUrl:fixture.url,username:'alex',password:'simulated-only',localReview:true,separateReviewWindows:true,theme,diffTheme:'application',showAppBadge:false,showTrayCounts:false}))
  wm=spawn('openbox',[],{stdio:'ignore'});await delay(500);await app.whenReady()
  caption=new BrowserWindow({x:0,y:980,width:1920,height:100,frame:false,focusable:false,alwaysOnTop:true,skipTaskbar:true,webPreferences:{sandbox:true}})
  await caption.loadURL('data:text/html,'+encodeURIComponent('<body style="margin:0;background:#132135;color:white;font:23px sans-serif;padding:20px 28px"><p style="margin:0"></p></body>'))
  app.on('browser-window-created',(_e,w)=>w.once('ready-to-show',()=>w.setBounds({x:90,y:35,width:1740,height:925})))
  req(root+'/out/main/index.js')
  await until(()=>BrowserWindow.getAllWindows().some(w=>w!==caption),'board')
  board=BrowserWindow.getAllWindows().find(w=>w!==caption)
  await until(()=>run(board,"Boolean(document.querySelector('.review-main'))"),'review button')
  await click(board,'.review-main')
  await until(()=>BrowserWindow.getAllWindows().length===3,'review window')
  review=BrowserWindow.getAllWindows().find(w=>w!==caption&&w!==board)
  await until(()=>run(review,"document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelectorAll('.review-status[aria-pressed=true]').length===3"),'review ready')
  await input('windowactivate','--sync',review.getNativeWindowHandle().readUInt32LE());await delay(800)
  const video=path.join(output,'mark-all-unreviewed-'+theme+'.mp4')
  recorder=spawn('ffmpeg',['-y','-v','error','-f','x11grab','-draw_mouse','1','-framerate','30','-video_size','1920x1080','-i',process.env.DISPLAY,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',video],{stdio:['pipe','ignore',fs.openSync(path.join(scratch,'ffmpeg.log'),'w')]})
  started=Date.now()
  await say('Linux Electron with simulated Gerrit data. Three of five files are reviewed.')
  await snapshot('reset-initial')
  await delay(1800)
  await say('Enable Unreviewed only. The three reviewed files will be hidden.')
  await click(review,'.review-files-filter input')
  assert.equal(await run(review,"document.querySelectorAll('.review-status').length"),2)
  await delay(1500)
  await say('Use the reset glyph beside the reviewed count to clear hidden files too.')
  fixture.state.reviewedWriteDelay=650
  fixture.state.reviewedReadDelay=400
  const clickStart=fixture.state.calls.length
  await click(review,'.review-reset')
  await until(()=>run(review, "document.querySelector('.review-reset').getAttribute('aria-busy')==='false'"),'reset finished')
  assert.equal(await run(review,"document.querySelector('.review-files-heading span').textContent"),'0/5 reviewed')
  assert.equal(await run(review,"document.querySelectorAll('.review-status').length"),5)
  assert.equal(await run(review,"document.querySelector('.review-files-filter input').checked"),true)
  assert.equal(await run(review,"document.querySelector('[data-review-path][aria-current=true]').dataset.reviewPath"),files[0])
  await say('All five files are unreviewed. The filter and selected file stay the same.')
  await snapshot('reset-result')
  await delay(3000)
  await say('Close and reopen this review to check the saved flags.')
  const previous=review
  await click(review,'.local-review-header > button:last-child')
  await until(()=>previous.isDestroyed(),'review closed')
  await input('windowactivate','--sync',board.getNativeWindowHandle().readUInt32LE())
  await click(board,'.review-main')
  await until(()=>BrowserWindow.getAllWindows().length===3,'review reopened')
  review=BrowserWindow.getAllWindows().find(w=>w!==caption&&w!==board)
  await until(()=>run(review,"document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelector('.review-files-heading span')?.textContent==='0/5 reviewed'"),'saved flags loaded')
  await input('windowactivate','--sync',review.getNativeWindowHandle().readUInt32LE())
  await say('The reopened review still has zero reviewed files. The reset was saved.')
  await delay(3500)
  const writes=fixture.state.calls.slice(clickStart).filter(c=>/reviewed$/.test(c.route))
  assert.equal(writes.length,3,'one delete per reviewed file')
  assert.ok(writes.every(w=>w.method==='DELETE'))
  assert.equal(fixture.state.reviewed.get(3).size,0)
  const result={theme,platform:'Linux X11 / Electron '+process.versions.electron,simulated:'Gerrit data; 400 ms reviewed-list reads; 650 ms reviewed-file writes',input:'Real xdotool mouse clicks with two-second hover pauses.',writes,serverReviewed:[...fixture.state.reviewed.get(3)],persistedAfterReopen:true}
  fs.writeFileSync(path.join(output,'reset-observations-'+theme+'.json'),JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify(result))
  recorder.stdin.write('q');await new Promise(r=>recorder.once('exit',r));recorder=null
  // Captions were captured live; preserve the continuous recording.
  fs.writeFileSync(path.join(output,'reset-captions-'+theme+'.json'),JSON.stringify(captions,null,2)+'\n')
  await finish()
})().catch(async e=>{console.error(e.stack);console.error('Diagnostics: '+scratch);if(review)await snapshot('failure');await finish(1)})
