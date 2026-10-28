// Record the production desktop with real X11 clicks and delayed simulated Gerrit.
// Run from the repo root under a 1920x1080 Xvfb and separate D-Bus session.
const root = process.cwd()
const req = require('node:module').createRequire(root + '/package.json')
const {app, BrowserWindow, nativeTheme} = req('electron')
const fs = require('node:fs'), path = require('node:path')
const {spawn, execFile} = require('node:child_process')
const {promisify} = require('node:util')
const assert = require('node:assert/strict')
const theme = process.env.REVIEWED_FLAGS_THEME || 'light'
const output = path.join(root, 'docs/evidence/reviewed-flags-fix')
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
  fixture.state.reviewed.set(3,new Set(files))
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
  await until(()=>run(review,"document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelectorAll('.review-status[aria-pressed=true]').length===5"),'review ready')
  await input('windowactivate','--sync',review.getNativeWindowHandle().readUInt32LE());await delay(800)
  await run(review,`window.reproStates=[];let prior='';function observe(){const buttons=[...document.querySelectorAll('.review-status')];const state={at:Math.round(performance.now()),heading:document.querySelector('.review-files-heading')?.textContent,flags:buttons.map(b=>({label:b.getAttribute('aria-label'),checked:b.getAttribute('aria-pressed'),disabled:b.disabled}))};const key=JSON.stringify({...state,at:0});if(key!==prior){prior=key;window.reproStates.push(state)}};new MutationObserver(observe).observe(document.querySelector('.local-review'),{subtree:true,childList:true,attributes:true,characterData:true});observe()`)
  const video=path.join(output,'reviewed-flags-'+theme+'.mp4')
  recorder=spawn('ffmpeg',['-y','-v','error','-f','x11grab','-draw_mouse','1','-framerate','30','-video_size','1920x1080','-i',process.env.DISPLAY,'-c:v','libx264','-preset','veryfast','-crf','19','-pix_fmt','yuv420p','-movflags','+faststart',video],{stdio:['pipe','ignore',fs.openSync(path.join(scratch,'ffmpeg.log'),'w')]})
  started=Date.now()
  await say('Linux Electron. Simulated Gerrit data and latency. All five files start reviewed.')
  await snapshot('initial')
  await say('Click one checkmark. The other four stay visible during the 600 ms status read.')
  fixture.state.reviewedReadDelay=600
  // Locate each status by its full accessible label.
  await move(...await target(review,'[aria-label="Mark unreviewed: '+files[0]+'"]'))
  await input('click',1)
  await delay(200);await snapshot('stable-refresh');await delay(1400)
  await say('One file changed. The other four checkmarks stayed visible throughout the refresh.')
  await delay(1800)
  await say('Reset the first file to reviewed before the rapid-click test.')
  await click(review,'[aria-label="Mark reviewed: '+files[0]+'"]');await delay(1200)
  await say('Click three files with 200 ms pauses to test rapid input. Each save takes 900 ms.')
  fixture.state.reviewedWriteDelay=900
  const points=[];for(const file of files.slice(0,3))points.push(await target(review,'[aria-label="Mark unreviewed: '+file+'"]'))
  await move(...points[0])
  const clickStart=fixture.state.calls.length
  for(const [x,y] of points){await input('mousemove',x,y);await input('click',1);await delay(200)}
  await delay(500);await snapshot('rapid-pending');await until(()=>run(review, `document.querySelectorAll('.review-status:disabled').length===0`), 'all three saves finished');await delay(1000)
  await say('All three clicks were saved. Two files remain reviewed. No status flash occurred.')
  await snapshot('result');await delay(3500)
  const states=await run(review,'window.reproStates')
  const writes=fixture.state.calls.slice(clickStart).filter(c=>/reviewed$/.test(c.route))
  assert.equal(writes.length,3,'all three real clicks reached Gerrit')
  assert.ok(writes.every(w=>w.method==='DELETE'))
  assert.equal(states.some(s=>s.heading?.includes('Loading status')),false,'no status flash')
  assert.deepEqual([...fixture.state.reviewed.get(3)],files.slice(3))
  const result={theme,platform:'Linux X11 / Electron '+process.versions.electron,simulated:'Gerrit data; 600 ms reviewed-list reads; 900 ms writes during rapid sequence',input:'Real xdotool mouse clicks, 200 ms pauses between clicks in rapid sequence. Hover pauses before isolated actions; rapid sequence deliberately omits per-target hover.',states,writes,serverReviewed:[...fixture.state.reviewed.get(3)]}
  fs.writeFileSync(path.join(output,'observations-'+theme+'.json'),JSON.stringify(result,null,2)+'\n')
  console.log(JSON.stringify({writes,serverReviewed:result.serverReviewed,flash:states.some(s=>s.heading?.includes('Loading status'))}))
  recorder.stdin.write('q');await new Promise(r=>recorder.once('exit',r));recorder=null
  // Captions were captured live; preserve the continuous recording.
  fs.writeFileSync(path.join(output,'captions-'+theme+'.json'),JSON.stringify(captions,null,2)+'\n')
  await finish()
})().catch(async e=>{console.error(e.stack);console.error('Diagnostics: '+scratch);if(review)await snapshot('failure');await finish(1)})
