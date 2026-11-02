// Build first, then run under xvfb-run -a -s '-screen 0 1440x960x24'.
// REVIEW_PANE_VIDEO=1 records matching separate-window workflows in both themes.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path'), os = require('node:os')
const { spawn, execFileSync } = require('node:child_process')
process.env.REVIEW_WRAP_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-11-02 12:00:00.000'
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'review-pane-'))
const output = path.resolve('openspec/changes/archive/2026-11-02-add-review-pane-hotkey/evidence')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', data)
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(r => setTimeout(r, ms))
const input = (...args) => execFileSync('xdotool', args.map(String))
let recorder, win
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 240000)
app.whenReady().then(async () => {
  const report = {}
  for (const separate of [false, true]) for (const theme of ['light', 'dark']) {
    if (separate) process.env.REVIEW_PANE_SEPARATE = '1'
    else delete process.env.REVIEW_PANE_SEPARATE
    nativeTheme.themeSource = theme
    win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 960, frame: false, useContentSize: true,
      webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
    const run = script => win.webContents.executeJavaScript(script)
    const errors = []
    win.webContents.on('console-message', details => { if (details.level === 'error') console.error(details.message) })
    win.webContents.on('render-process-gone', (_e, details) => errors.push(details))
    async function until(script) {
      for (let i = 0; i < 200; i++) { if (await run(script)) return; await delay(75) }
      console.error(await run(`document.body.innerText.slice(-3000)`))
      throw Error('Timed out: ' + script)
    }
    const bounds = sel => run(`document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect().toJSON()`)
    let pointer = { x: 1200, y: 850 }
    async function move(x, y, hover = 0) {
      for (let i = 1; i <= 15; i++) {
        input('mousemove', Math.round(pointer.x + (x-pointer.x)*i/15), Math.round(pointer.y + (y-pointer.y)*i/15))
        await delay(recorder ? 35 : 2)
      }
      pointer = { x, y }; await delay(hover)
    }
    async function click(sel) {
      const b = await bounds(sel)
      await move(b.x+b.width/2, b.y+b.height/2, recorder ? 2000 : 20)
      input('click', 1); await delay(250)
    }
    async function key(value) { input('key', '--clearmodifiers', value); await delay(400) }
    const ready = () => until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    const geometry = () => run(`(() => { const d=document.querySelector('.monaco-diff-editor').getBoundingClientRect(), m=document.querySelector('.modified-in-monaco-diff-editor').getBoundingClientRect(), o=document.querySelector('.original-in-monaco-diff-editor'); return {left:m.x-d.x,width:d.width,modified:m.width,hidden:o.inert,focus:!!document.activeElement.closest('.modified-in-monaco-diff-editor')}; })()`)
    const hidden = async () => { await until(`(() => { const lines=[...document.querySelectorAll('.modified-in-monaco-diff-editor .view-lines .view-line')]; return lines.length>2 && lines[1].getBoundingClientRect().top-lines[0].getBoundingClientRect().top<50 })()`); const g=await geometry(); assert.equal(g.left,0,JSON.stringify(g)); assert.ok(g.modified>g.width-40,JSON.stringify(g)); assert.ok(g.hidden); assert.equal(await run(`!!document.querySelector('[aria-label="File comments on original"]')`),false); return g }
    const visible = async ratio => { const g=await geometry(); assert.ok(!g.hidden); assert.ok(Math.abs(g.left/g.width-ratio)<0.003,JSON.stringify(g)); return g }
    const caption = text => run(`(() => { let e=document.getElementById('capture-caption'); if(!e){e=document.createElement('div');e.id='capture-caption';e.style.cssText='position:fixed;bottom:12px;left:320px;right:14px;z-index:99999;padding:12px;background:#142439;color:white;border:1px solid #9eafc6;border-radius:6px;font:16px sans-serif;pointer-events:none';document.querySelector('.local-review').append(e)}e.textContent=${JSON.stringify(text)} })()`)
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    if (!separate) { await until(`!!document.querySelector('.review-main')`); await click('.review-main') }
    await ready(); await delay(500)
    win.focus(); win.webContents.focus()
    // Give the split a non-default ratio so restoration cannot pass by reset.
    const sash = await bounds('.monaco-diff-editor > .monaco-sash.vertical')
    const outer = await bounds('.monaco-diff-editor')
    await move(sash.x+sash.width/2,sash.y+150)
    input('mousedown',1); await move(outer.x+outer.width*0.37,sash.y+150); input('mouseup',1); await delay(350)
    const initial = await geometry(), ratio=initial.left/initial.width
    assert.ok(Math.abs(ratio-0.37)<0.005)
    await key('shift+Left')
    if (separate && process.env.REVIEW_PANE_VIDEO === '1') {
      recorder=spawn('ffmpeg',['-y','-loglevel','error','-f','x11grab','-draw_mouse','1','-framerate','25','-video_size','1440x960','-i',process.env.DISPLAY,'-c:v','libx264','-preset','veryfast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',path.join(output,'shift-a-'+theme+'.mp4')],{stdio:['pipe','ignore','inherit']})
      await delay(500)
    }
    await caption('Linux Electron. Simulated Gerrit data. Press Shift+A to hide the original diff pane.')
    await delay(recorder ? 2500 : 20)
    await key('shift+a'); const collapsed=await hidden()
    assert.ok(collapsed.focus,'focus moves to modified editor')
    await delay(recorder ? 3000 : 20)
    if (separate) fs.writeFileSync(path.join(output,'hidden-'+theme+'.png'),(await win.webContents.capturePage()).toPNG())
    await caption('Open types.ts. The original pane stays hidden while the file list remains available.')
    await click('[data-review-path="src/telemetry/types.ts"]'); await ready(); await hidden()
    await delay(recorder ? 2500 : 20)
    await caption('Press Shift+A again. The original pane returns at the saved divider position.')
    await key('shift+a'); await visible(ratio)
    await delay(recorder ? 3000 : 20)
    if (separate) fs.writeFileSync(path.join(output,'restored-'+theme+'.png'),(await win.webContents.capturePage()).toPNG())
    if (recorder) { const done=new Promise((resolve,reject)=>recorder.once('exit',code=>code===0?resolve():reject(Error('ffmpeg '+code))));recorder.stdin.write('q');await done;recorder=null }
    await run(`document.getElementById('capture-caption').remove()`)
    // Real keyboard input through Monaco's editable search widget must stay guarded.
    await key('ctrl+f'); await until(`!!document.querySelector('.find-widget.visible')`)
    await key('shift+a'); await visible(ratio)
    await key('Escape')
    await key('shift+a'); await hidden()
    win.setContentSize(1100,960); await delay(400); await hidden()
    win.setContentSize(1440,960); await delay(400); await hidden()
    await key('shift+Left'); await visible(ratio)
    await key('shift+a'); await hidden()
    await key('m'); assert.equal(await run(`!!document.querySelector('.review-original-hidden')`),false)
    await key('shift+a'); assert.equal(await run(`!!document.querySelector('.review-original-hidden')`),false)
    await key('m'); await visible(ratio)
    await key('shift+question'); await until(`!!document.querySelector('.review-shortcuts')`)
    assert.ok(await run(`document.querySelector('.review-shortcuts').textContent.includes('Shift+A')`))
    await key('Escape')
    assert.deepEqual(errors,[])
    report[(separate?'separate':'embedded')+'-'+theme]={ratio,initial,collapsed,checks:'passed',searchGuard:true,windowResize:true,originalNavigation:true,unifiedMode:true,fileSwitch:true,help:true}
    console.log((separate?'separate':'embedded')+'-'+theme+' passed')
    win.destroy();win=null
  }
  fs.writeFileSync(path.join(output,'checks.json'),JSON.stringify(report,null,2)+'\n')
  clearTimeout(timeout);app.quit()
}).catch(error=>{console.error(error);recorder?.kill('SIGINT');clearTimeout(timeout);app.exit(1)})
  .finally(()=>fs.rmSync(data,{recursive:true,force:true}))
