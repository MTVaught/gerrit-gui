// Capture the original bug or verify the fix with REPRO_EXPECT_FIXED=1.
const { app, BrowserWindow, nativeTheme, clipboard } = require('electron')
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
const root = process.env.REPRO_ROOT ?? path.resolve(__dirname, '../../../../..')
const evidence = process.env.REVIEW_FEATURE_EVIDENCE ?? __dirname
const fixed = process.env.REPRO_EXPECT_FIXED === '1'
const prefix = fixed ? 'fixed-' : ''
const scratch = fs.mkdtempSync('/tmp/gerrit-newline-')
app.setPath('userData', scratch)
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
process.env.REVIEW_PORTED_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-21 12:00:00.000000000'
const delay = ms => new Promise(r => setTimeout(r, ms))
const xd = (...args) => execFileSync('xdotool', args.map(String))
let recorder
const timeout = setTimeout(() => app.exit(2), 180000)
app.whenReady().then(async () => {
 for (const theme of (process.env.REPRO_THEMES ?? 'light,dark').split(',')) {
  nativeTheme.themeSource = theme
  const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 960, frame: false, show: true, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(root, 'test/fixtures/local-review-preload.cjs') } })
  const run = s => win.webContents.executeJavaScript(s)
  async function until(s) { for (let i=0; i<200; i++) { if (await run(s)) return; await delay(75) } throw Error('Timed out: ' + s) }
  async function key(s) { xd('key', '--clearmodifiers', s); await delay(150) }
  async function caption(text) { await run(`(() => { let n=document.getElementById('evidence-caption'); if (!n) { n=document.createElement('div'); n.id='evidence-caption'; n.style.cssText='position:fixed;bottom:0;left:0;right:0;z-index:99999;padding:14px 20px;background:#17202a;color:white;font:17px system-ui;pointer-events:none'; (document.querySelector('.local-review') ?? document.body).append(n) } n.textContent=${JSON.stringify(text)} })()`); await delay(300) }
  async function click(selector, slow=false) {
   const p=await run(`(() => { const n=document.querySelector(${JSON.stringify(selector)}); if (!n) throw Error('Missing target'); const r=n.getBoundingClientRect(); return { x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) } })()`)
   const b=win.getContentBounds()
   const pos=xd('getmouselocation','--shell').toString()
   const sx=Number(/X=(\d+)/.exec(pos)[1]), sy=Number(/Y=(\d+)/.exec(pos)[1])
   for(let i=1;i<=20;i++) { xd('mousemove',Math.round(sx+(p.x+b.x-sx)*i/20),Math.round(sy+(p.y+b.y-sy)*i/20)); await delay(slow?25:0) }
   await delay(slow?2000:150); xd('click',1); await delay(250)
  }
  await win.loadFile(path.join(root,'out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`)
  win.focus(); win.webContents.focus()
  await click('.review-main')
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
  await delay(700)
  await caption('Linux / Electron | Simulated Gerrit data | Control: select line 1 without its newline.')
  recorder=spawn('ffmpeg',['-y','-loglevel','error','-f','x11grab','-draw_mouse','1','-framerate','20','-video_size','1440x960','-i',process.env.DISPLAY,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',path.join(evidence,prefix+'newline-selection-'+theme+'.mp4')],{stdio:['pipe','ignore','inherit']})
  await delay(600)
  await click('.modified-in-monaco-diff-editor .view-line',true)
  await caption('Ctrl+Home: line 1. Shift+End: select text. Ctrl+C: check selection. C: add comment.')
  await key('ctrl+Home'); await key('shift+End'); await key('ctrl+c')
  const controlText=await clipboard.readText()
  assert.equal(controlText,'// Comparing base to patch set 3')
  await delay(1500); await key('c')
  await until(`Boolean(document.querySelector('[aria-label="Draft comment"]'))`)
  const controlZone=await run(`document.querySelector('.review-inline-zone').getAttribute('aria-label')`)
  assert.equal(controlZone,'Modified comments after line 1')
  await caption('Control result: the composer is directly below line 1.')
  await delay(2200)
  await click('.review-comment-compose button:last-child',true)
  await until(`!document.querySelector('.review-comment-compose')`)
  await caption('Select the newline with Ctrl+Home, then Shift+Down. Ctrl+C checks the selection.')
  await click('.modified-in-monaco-diff-editor .view-line',true)
  await key('ctrl+Home'); await key('shift+Down'); await key('ctrl+c')
  const selectedText=await clipboard.readText()
  assert.equal(selectedText,'// Comparing base to patch set 3\n')
  await caption('Line 1 and its newline are selected. Press C to add a comment.')
  await delay(2200); await key('c')
  await until(`Boolean(document.querySelector('[aria-label="Draft comment"]'))`)
  const zone=await run(`document.querySelector('.review-inline-zone').getAttribute('aria-label')`)
  assert.equal(zone,`Modified comments after line ${fixed ? 1 : 2}`)
  await caption(fixed ? 'FIXED: the composer is directly below the selected line 1.' : 'BUG: the composer is below line 2, although only line 1 was selected.')
  await delay(2800)
  fs.writeFileSync(path.join(evidence,prefix+'newline-composer-'+theme+'.png'),(await win.webContents.capturePage()).toPNG())
  await caption('Type a draft and check the saved line and range.')
  xd('type','--clearmodifiers','--delay','65','Comment on line 1 including its newline.')
  await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit'`)
  const stats=await run('api.fixtureStats()')
  assert.equal(stats.drafts.length,1)
  const draft=stats.drafts[0]
  assert.equal(draft.line,fixed ? 1 : 2)
  assert.deepEqual(draft.range,{start_line:1,start_character:0,end_line:fixed ? 1 : 2,end_character:fixed ? controlText.length : 0})
  await caption(fixed ? `Confirmed: the saved draft has line 1 and range 1:0 to 1:${controlText.length}.` : 'Confirmed: the saved draft has line 2 and range 1:0 to 2:0. No fix is applied.')
  await delay(2800)
  fs.writeFileSync(path.join(evidence,prefix+'newline-saved-'+theme+'.png'),(await win.webContents.capturePage()).toPNG())
  fs.writeFileSync(path.join(evidence,prefix+'reproduction-'+theme+'.json'),JSON.stringify({platform:'Linux / Electron',simulated:'Gerrit API and 100000-line source fixture',input:'Native xdotool mouse and keyboard',theme,controlText,controlZone,selectedText,zone,draft},null,2)+'\n')
  recorder.stdin.write('q'); await new Promise(r=>recorder.once('exit',r)); recorder=null
  console.log(JSON.stringify({theme,controlZone,zone,draft}))
  win.destroy()
 }
 clearTimeout(timeout); app.quit()
}).catch(error=>{ console.error(error); if(recorder) recorder.kill('SIGINT'); app.exit(1) })
