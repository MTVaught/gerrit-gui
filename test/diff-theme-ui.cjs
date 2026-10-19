// Build first. Real UI input, isolated desktop settings, simulated Gerrit data.
// BROWSER_THEME_FIXTURE=1 uses the HTTP browser API instead of the preload.
const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const scratch = process.env.DIFF_THEME_TEST_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'diff-theme-ui-'))
app.setPath('userData', path.join(scratch, 'user-data'))
app.disableHardwareAcceleration()
process.env.REVIEW_THEME_FIXTURE = '1'
process.env.REVIEW_FILE_ACTIVITY_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-19 12:00:00.000'
const browser = Boolean(process.env.BROWSER_THEME_FIXTURE)
const capture = Boolean(process.env.CAPTURE_DIFF_THEME)
const delay = ms => new Promise(r => setTimeout(r, ms))
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 300000)
app.whenReady().then(async () => {
 const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }))
 const storePath = path.join(scratch, 'settings.cjs')
 esbuild.buildSync({ entryPoints: [path.join(__dirname, '../src/main/settings.ts')], outfile: storePath, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
 const store = require(storePath)
 if(!process.env.DIFF_THEME_REOPEN)await store.save({ ...await store.getStatus(), serverUrl:'https://gerrit.example.com', username:'alex', password:'fixture', projects:[], teams:[], primaryTeam:'', mergers:[], slackWorkspaces:[], localReview:true, theme:'system', diffTheme:'application' })
 const writes = []
 let failSettings = false, failGerrit = false
 ipcMain.handle('fixture:getSettings', () => store.getStatus())
 ipcMain.handle('fixture:saveSettings', async (_event, input) => { writes.push({kind:'settings',input}); if(failSettings){ failSettings=false;throw new Error('Fixture settings write failed') } await store.save(input) })
 ipcMain.handle('fixture:saveGerrit', async (_event, input) => { writes.push({kind:'gerrit',input}); if(failGerrit){failGerrit=false;throw new Error('Fixture Gerrit write failed')} return input })
 const win = new BrowserWindow({ x:0,y:0,width:1600,height:1000,frame:false,show:true,webPreferences: browser ? {} : { contextIsolation:true,sandbox:false,preload:path.join(__dirname,'fixtures/local-review-preload.cjs') } })
 const errors=[]
 win.webContents.on('console-message', details => { if(details.level === 'error') errors.push(details.message) })
 const run = script => win.webContents.executeJavaScript(script)
 async function until(script,label){for(let i=0;i<160;i++){if(await run(script))return;await delay(75)}console.error(await run(`document.body.innerText.slice(0,2500)`));fs.writeFileSync(path.join(scratch,'failure.png'),(await win.webContents.capturePage()).toPNG());throw new Error(label)}
 const native = (...args) => execFileSync('xdotool',args.map(String))
 let cursor={x:800,y:500}
 async function target(selector){return run(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('Missing '+${JSON.stringify(selector)});const r=e.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`)}
 async function move(p){if(capture){const from=cursor;for(let i=1;i<=20;i++){native('mousemove',Math.round(from.x+(p.x-from.x)*i/20),Math.round(from.y+(p.y-from.y)*i/20));await delay(30)}await delay(2000)}else native('mousemove',p.x,p.y);cursor=p}
 async function click(selector){await move(typeof selector==='string'?await target(selector):selector);native('click',1);await delay(capture?650:150)}
 async function key(key){native('key',key);await delay(180)}
 const oppositeMode = value => value==='light'?'dark':'light'
 const select='.review-preferences label:first-child select'
 const save='.review-preferences button[type=submit]'
 const cancel='.review-preferences button[type=button]'
 const pref='[data-review-preferences]'
 const close='.local-review-header > button:last-child'
 async function choose(value){await click(select);await key('Home');if(value==='dark')await key('Down');if(value==='application'){await key('Down');await key('Down')}await key('Return')}
 async function openReview(){await click('.review-main');await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`,'review ready')}
 async function openPreferences(){await click(pref);await until(`Boolean(document.querySelector('.review-preferences[open]'))`,'preferences open')}
 async function theme(value){await until(`document.querySelector('.local-review')?.dataset.reviewTheme === '${value}' && Boolean(document.querySelector('.monaco-editor.${value==='dark'?'vs-dark':'vs'}'))`,'review and Monaco theme '+value)}
 const dir=path.join(__dirname,'../docs/screenshots/diff-theme'+(browser?'/browser':''));fs.mkdirSync(dir,{recursive:true})
 const captionFile=path.join(scratch,'caption.txt')
 function caption(text){fs.writeFileSync(captionFile+'.next',text);fs.renameSync(captionFile+'.next',captionFile)}
 async function screenshot(name){fs.writeFileSync(path.join(dir,name+'.png'),(await win.webContents.capturePage()).toPNG())}
 if(browser)await win.loadURL('http://127.0.0.1:5183/');else await win.loadFile(path.join(__dirname,'../out/renderer/index.html'))
 await until(`Boolean(document.querySelector('.review-main'))`,'board ready')
 if(process.env.DIFF_THEME_REOPEN){await click('button[aria-label="Settings"]');await click('.section-nav button:first-child');assert.equal(await run(`document.querySelector('input[name="diff-theme"]:checked').value`),(await store.getStatus()).diffTheme);console.log('Desktop theme survives application restart');clearTimeout(timeout);win.destroy();app.quit();return}
 win.focus();win.webContents.focus()
 if(process.env.COMPACT_THEME_ONLY){
  for(const mode of ['light','dark']){
   nativeTheme.themeSource=mode
   await click('button[aria-label="Settings"]');await click('.section-nav button:first-child');await click('input[name="diff-theme"][value="application"]')
   await until(`!document.querySelector('input[name="diff-theme"][value="application"]').disabled`,'compact setting saved')
   await click('button[aria-label="Settings"]');await openReview();await theme(mode)
   win.setSize(640,1000);await delay(300);await openPreferences()
   assert.ok(await run(`document.querySelector(${JSON.stringify(select)}).clientWidth >= 185`),'compact control fits Follow application')
   await screenshot('preferences-compact-'+mode);await click(cancel);await click(close);win.setSize(1600,1000);await delay(300)
  }
  console.log('Compact theme labels fit in both modes');clearTimeout(timeout);win.destroy();app.quit();return
 }
 for(const mode of ['light','dark']) {
  nativeTheme.themeSource=mode
  // Establish an identical starting state through the settings UI.
  await click('button[aria-label="Settings"]')
  await click('.section-nav button:first-child')
  await click('input[name="theme"][value="system"]')
  await click('input[name="diff-theme"][value="application"]')
  await until(`document.querySelector('input[name="diff-theme"][value="application"]').checked`,'follow application selected')
  await until(`!document.querySelector('input[name="diff-theme"][value="application"]').disabled`,'initial radio save settled');await click('input[name="diff-theme"][value="application"]')
  await key('Left');await until(`document.querySelector('input[name="diff-theme"][value="dark"]').checked`,'radio arrow saves Dark')
  await until(`!document.querySelector('input[name="diff-theme"][value="dark"]').disabled`,'radio save settled');await click('input[name="diff-theme"][value="dark"]')
  await key('Left');await until(`document.querySelector('input[name="diff-theme"][value="light"]').checked`,'radio arrow saves Light')
  await until(`!document.querySelector('input[name="diff-theme"][value="light"]').disabled`,'radio save settled');await click('input[name="diff-theme"][value="application"]')
  await screenshot('appearance-'+mode)
  await click('button[aria-label="Settings"]')
  await openReview();await theme(mode)
  const opposite=mode==='light'?'dark':'light'
  if(!capture){nativeTheme.themeSource=oppositeMode(mode);await theme(oppositeMode(mode));nativeTheme.themeSource=mode;await theme(mode)}
  if(!capture){await move(await target('.modified-in-monaco-diff-editor'));native('click',5);native('click',5);await delay(300)}
  let beforeView=await run(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent`)
  let beforeDraft=await run(`document.querySelector('.comment-draft')?.textContent`)
  const editorToken=await run(`(()=>{const e=document.querySelector('.review-editor');e.dataset.themeTestToken='same-editor';return e.dataset.themeTestToken})()`)
  if(capture){
   caption('Open Diff Preferences. The theme uses the same dropdown style as other fields.')
   recorder=spawn('ffmpeg',['-y','-f','x11grab','-draw_mouse','1','-framerate','20','-video_size','1600x1000','-i',process.env.DISPLAY,'-vf',`drawbox=x=0:y=ih-46:w=iw:h=46:color=black@0.88:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionFile}:reload=1:fontcolor=white:fontsize=20:x=(w-tw)/2:y=h-34`,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,'workflow-'+mode+'.mp4')],{stdio:['pipe','ignore',fs.openSync(path.join(scratch,'ffmpeg-'+mode+'.log'),'w')]})
   await delay(1000)
  }
  await openPreferences();await screenshot('preferences-'+mode)
  if(!capture){win.setSize(640,1000);await delay(300);assert.equal(await run(`document.querySelector('.review-preferences').scrollWidth <= document.querySelector('.review-preferences').clientWidth`),true,'compact preferences fit');await screenshot('preferences-compact-'+mode);win.setSize(1600,1000);await delay(300)}
  caption('Select the other theme. It stays a draft until Save. Home and arrow keys select the dropdown option.')
  await choose(opposite);await theme(mode)
  assert.equal(await run(`document.querySelector(${JSON.stringify(select)}).value`),opposite)
  caption('Cancel discards the draft theme.');await click(cancel);await theme(mode)
  caption('Open preferences again. Follow application is still saved.');await openPreferences()
  assert.equal(await run(`document.querySelector(${JSON.stringify(select)}).value`),'application')
  caption('Select the other theme again, then Save to apply it. Home and arrows select the option.');await choose(opposite)
  beforeView=await run(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent`)
  beforeDraft=await run(`document.querySelector('.comment-draft')?.textContent`)
  assert.ok(beforeDraft?.includes('I will add that explanation.'),'fixture draft is present before saving')
  const before=writes.filter(x=>x.kind==='gerrit').length
  await click(save);await theme(opposite)
  if(!browser)assert.equal(writes.filter(x=>x.kind==='gerrit').length,before,'theme-only Save skips Gerrit')
  assert.equal(await run(`document.querySelector('.review-editor').dataset.themeTestToken`),editorToken,'editor stays mounted')
  assert.equal(await run(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent`),beforeView,'visible code position stays unchanged')
  assert.equal(await run(`document.querySelector('.comment-draft')?.textContent`),beforeDraft,'draft remains unchanged')
  await screenshot('override-'+mode)
  if(!capture){
   nativeTheme.themeSource=opposite;await theme(opposite);nativeTheme.themeSource=mode;await theme(opposite)
   await click('.review-comments summary');await click('.review-comments .review-menu-items button');await until(`Boolean(document.querySelector('.review-comment-overview[open]'))`,'All comments opens')
   assert.equal(await run(`getComputedStyle(document.querySelector('.review-comment-overview')).colorScheme`),opposite)
   await key('Escape')
  }
  caption('The review changes theme. Close it to check Appearance settings.');await delay(capture?1800:100);await click(close)
  await until(`!document.querySelector('.local-review')`,'review closed')
  assert.equal(await run(`document.documentElement.dataset.theme`),mode,'application theme stays unchanged')
  await click('button[aria-label="Settings"]');await click('.section-nav button:first-child')
  await until(`document.querySelector('input[name="diff-theme"][value="${opposite}"]').checked`,'Appearance shares saved diff theme')
  caption('Appearance shows the same saved diff theme. It remains after reload.');await delay(capture?1800:100)
  win.webContents.reload();await until(`Boolean(document.querySelector('.review-main'))`,'board after reload');await click('button[aria-label="Settings"]')
  await click('.section-nav button:first-child')
  await until(`document.querySelector('input[name="diff-theme"][value="${opposite}"]').checked`,'saved theme survives reopening')
  await delay(capture?2000:100)
  if(capture){const stopped=new Promise((resolve,reject)=>recorder.once('exit',code=>code===0?resolve():reject(new Error('ffmpeg '+code))));recorder.stdin.write('q');await stopped;recorder=null}
  await click('button[aria-label="Settings"]')
 }
 // Failure handling and Escape are checked with actual UI input on desktop.
 if(!browser){
  await openReview();await openPreferences();const prior=(await store.getStatus()).diffTheme
  await choose(prior==='light'?'dark':'light');await key('Escape');await theme(prior)
  await openPreferences();await choose(prior==='light'?'dark':'light')
  failSettings=true;await click(save)
  await until(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture settings write failed')`,'theme write error visible')
  await theme(prior);await click(save);await theme(prior==='light'?'dark':'light')
  await openPreferences();await choose(prior)
  // Change Context using the select's own keyboard interaction.
  await click('.review-preferences label:nth-child(2) select');await key('End');await key('Return')
  failGerrit=true;await click(save)
  await until(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture Gerrit write failed')`,'Gerrit failure keeps draft open')
  await theme(prior==='light'?'dark':'light')
  failSettings=true;await click(save)
  await until(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture settings write failed')`,'later settings failure visible')
  const confirmed=writes.filter(x=>x.kind==='gerrit').length
  await click(save);await theme(prior)
  assert.equal(writes.filter(x=>x.kind==='gerrit').length,confirmed,'retry skips confirmed Gerrit write')
  assert.ok(writes.filter(x=>x.kind==='gerrit').every(x=>!('diffTheme' in x.input)))
 }
 assert.deepEqual(errors,[])
 fs.writeFileSync(path.join(dir,browser?'browser-results.json':'desktop-results.json'),JSON.stringify({platform:process.platform,mode:browser?'browser HTTP API':'Electron desktop settings',capture,checks:'Save, Cancel, theme sync, opposing themes, editor continuity, persistence'+(!capture?', system changes, All comments, compact layout':'')+(!browser?', Escape, write failures and retry':''),writes},null,2))
 console.log((browser?'Browser':'Desktop')+' diff theme checks passed. Isolated data: '+scratch)
 clearTimeout(timeout);win.destroy();app.quit()
}).catch(error=>{console.error(error);recorder?.kill('SIGINT');app.exit(1)})
