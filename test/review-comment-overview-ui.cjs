// Build first. Uses the real Electron renderer and an in-memory Gerrit fixture.
// Set CAPTURE_REVIEW_OVERVIEW=1 to also record the paired evidence workflow.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-overview-'))
app.setPath('userData', path.join(scratch, 'user-data'))
app.disableHardwareAcceleration()
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-14 12:00:00.000'
process.env.REVIEW_FILE_ACTIVITY_FIXTURE = '1'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 180000)
app.whenReady().then(async () => {
 const win = new BrowserWindow({ x:0,y:0,width:1600,height:1000,frame:false,show:true,webPreferences:{contextIsolation:true,sandbox:false,preload:path.join(__dirname,'fixtures/local-review-preload.cjs')} })
 const errors=[]
 win.webContents.on('console-message', details => { if(details.level === 'error') errors.push(details.message) })
 const run = script => win.webContents.executeJavaScript(script)
 async function until(script, label) { for(let i=0;i<200;i++){if(await run(script))return;await delay(50)} throw new Error(label) }
 await win.loadFile(path.join(__dirname,'../out/renderer/index.html'))
 await until(`Boolean(document.querySelector('.review-main'))`, 'board opens')
 await run(`api.fixtureCommentGaps().then(()=>api.fixtureOtherFileComment())`)
 await run(`document.querySelector('.review-main').click()`)
 await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('.comment-draft'))`, 'review and fixture draft open')
 await require('./review-comment-overview-checks.cjs')(win)
 if(process.env.CAPTURE_REVIEW_OVERVIEW) {
  const dir=path.join(__dirname,'../docs/screenshots/review-comment-overview');fs.mkdirSync(dir,{recursive:true})
  let cursor={x:800,y:500}
  const captionFile=path.join(scratch,'caption.txt')
  function caption(text){fs.writeFileSync(captionFile+'.next',text);fs.renameSync(captionFile+'.next',captionFile)}
  function native(...args){execFileSync('xdotool',args.map(String))}
  async function target(selector) { return run(`(() => {const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`) }
  async function move(p) {
   const from=cursor
   for(let i=1;i<=20;i++){native('mousemove',Math.round(from.x+(p.x-from.x)*i/20),Math.round(from.y+(p.y-from.y)*i/20));await delay(35)}
   cursor=p;await delay(2000)
  }
  async function click(selector){await move(typeof selector==='string'?await target(selector):selector);native('click','1');await delay(800)}
  async function open(){await click('.review-comments summary');await click('.review-comments .review-menu-items button');await until(`Boolean(document.querySelector('.review-comment-overview[open]'))`,'overview opens for capture')}
  for(const theme of ['light','dark']) {
   nativeTheme.themeSource=theme
   await until(`document.documentElement.dataset.theme === '${theme}' && Boolean(document.querySelector('.monaco-editor.${theme==='dark'?'vs-dark':'vs'}'))`, 'theme applied')
   await delay(500)
   caption('Open All comments from the Comments menu')
   recorder=spawn('ffmpeg',['-y','-f','x11grab','-draw_mouse','1','-framerate','20','-video_size','1600x1000','-i',process.env.DISPLAY,'-vf',`drawbox=x=0:y=ih-46:w=iw:h=46:color=black@0.88:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionFile}:reload=1:fontcolor=white:fontsize=20:x=(w-tw)/2:y=h-34`,'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-movflags','+faststart',path.join(dir,`all-comments-workflow-${theme}.mp4`)],{stdio:['pipe','ignore',fs.openSync(path.join(scratch,`ffmpeg-${theme}.log`),'w')]})
   await delay(1000);await open();await delay(1000)
   fs.writeFileSync(path.join(dir,`all-comments-${theme}.png`),(await win.webContents.capturePage()).toPNG())
   caption('Scroll the threads. The title, filters, and return button stay visible')
   await move(await target('.review-comment-overview-list'));native('click','5','click','5','click','5','click','5','click','5');await delay(1800)
   assert.ok(await run(`document.querySelector('.review-comment-overview-list').scrollTop > 0`),'recorded scroll moves list')
   caption('Click Back to review to close the pane');await click('.review-comment-return');await until(`!document.querySelector('.review-comment-overview')`,'recorded return closes')
   caption('Open All comments again');await open()
   caption('Press Escape to close the pane and keep the review open');await delay(2000);native('key','Escape');await delay(1800)
   await until(`!document.querySelector('.review-comment-overview') && Boolean(document.querySelector('.local-review[open]'))`,'recorded Escape closes only overview')
   caption('Open All comments again');await open()
   caption('Click the dimmed background to return to the review');await click({x:35,y:300})
   await until(`!document.querySelector('.review-comment-overview') && Boolean(document.querySelector('.local-review[open]'))`,'recorded background closes only overview')
   caption('The review stays open at the same file and comparison');await delay(2000)
   const stopped=new Promise((resolve,reject)=>recorder.once('exit',code=>code===0?resolve():reject(new Error('ffmpeg exit '+code))))
   recorder.stdin.write('q');await stopped;recorder=null
  }
 }
 assert.deepEqual(errors,[])
 console.log('Review comment overview checks passed'+(process.env.CAPTURE_REVIEW_OVERVIEW?' with paired screenshots and recordings':''))
 clearTimeout(timeout);win.destroy();app.quit()
}).catch(error=>{console.error(error);recorder?.kill('SIGINT');app.exit(1)})
