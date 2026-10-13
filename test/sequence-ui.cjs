// Build first, then run under Xvfb with xdotool and ffmpeg available.
// Uses real native input with simulated Gerrit data; captures both appearances.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-sequence-ui-')))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const evidence = path.join(__dirname, '../docs/screenshots/sequence-sections')
fs.mkdirSync(evidence, { recursive: true })
const timeout = setTimeout(() => app.exit(2), 240000)
let recorder
app.whenReady().then(async () => {
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    const win = new BrowserWindow({ width: 1440, height: 900, x: 0, y: 0, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/sequence-preload.cjs') } })
    const errors = []
    win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
    const run = script => win.webContents.executeJavaScript(script)
    async function until(script) {
      for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) }
      throw new Error('Timed out: ' + script + '\n' + errors.join('\n'))
    }
    const tab = name => `Array.from(document.querySelectorAll('[role="tab"]')).find(b => b.textContent.startsWith(${JSON.stringify(name)}))`
    const button = name => `Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(name)})`
    let pointer = { x: 30, y: 700 }
    execFileSync('xdotool', ['mousemove', String(pointer.x), String(pointer.y)])
    async function click(element) {
      await until(`Boolean(${element}) && !(${element}).disabled`)
      const bounds = await run(`(() => {const r = (${element}).getBoundingClientRect(); return {x:r.x+r.width/2, y:r.y+r.height/2}})()`)
      assert.ok(bounds.x >= 0 && bounds.x < 1440 && bounds.y >= 0 && bounds.y < 900, 'input target is on screen')
      for (let step = 1; step <= 12; step++) {
        execFileSync('xdotool', ['mousemove', String(Math.round(pointer.x + (bounds.x - pointer.x) * step / 12)), String(Math.round(pointer.y + (bounds.y - pointer.y) * step / 12))])
        await delay(60)
      }
      pointer = bounds
      await delay(2000)
      execFileSync('xdotool', ['click', '1'])
      await delay(500)
    }
    async function screenshot(name) {
      await delay(300)
      fs.writeFileSync(path.join(evidence, `${name}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
    }
    async function caption(text) {
      await run(`(() => {let e=document.getElementById('evidence-caption'); if(!e){e=document.createElement('div');e.id='evidence-caption';e.style.cssText='position:fixed;bottom:12px;left:24px;right:24px;z-index:100000;background:#18212c;color:white;border:1px solid #788899;border-radius:6px;padding:12px 16px;font:16px sans-serif;pointer-events:none';document.body.append(e)}e.textContent=${JSON.stringify(text)}})()`)
    }
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'tab=reviewing' })
    win.focus()
    await until(`document.querySelector('.group h3')?.textContent === 'Sequences 1'`)
    await until(`matchMedia('(prefers-color-scheme: dark)').matches === ${theme === 'dark'}`)
    assert.ok(await run(`document.querySelector('.chain').textContent.includes('2 need your review')`))
    assert.ok(await run(`!document.querySelector('.chain').className.includes('state-')`), 'sequence has no aggregate state styling')
    await screenshot('reviewing')
    await click(tab('My Changes'))
    await until(`document.querySelector('.group h3')?.textContent === 'Sequences 1'`)
    assert.ok(await run(`document.querySelector('.chain').textContent.includes('In Progress') && document.querySelector('.chain').textContent.includes('Approved')`))
    await screenshot('mine')
    if (!process.env.SEQUENCE_SCREENSHOTS_ONLY) {
      await click(tab('Needs Review'))
      await until(`document.querySelector('.group h3')?.textContent === 'Pass Around 1'`)
      await caption('Two changes need your review. The sequence counts once. Gerrit data is simulated.')
      recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x900', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(evidence, `review-workflow-${theme}.mp4`)], { stdio: ['pipe', 'ignore', 'ignore'] })
      await delay(2500)
      for (const id of [101, 102]) {
        await caption(`Review #${id} and publish a +1 vote.`)
        await click(`document.querySelector('[data-change-number="${id}"] .review-main')`)
        await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
        await click(button('Reply'))
        await click(`document.querySelector('[aria-label="Code-Review +1"]')`)
        await click(button('Send review'))
        await until(`document.body.textContent.includes('Review published to Gerrit.')`)
        await click(button('Close review'))
        if (id === 101) {
          assert.ok(await run(`document.querySelector('.chain').textContent.includes('1 needs your review')`))
          assert.ok(await run(`document.querySelector('.next-hint').textContent.includes('#102')`))
          await caption('One review remains. The sequence stays in Needs Review; #102 is next.')
        } else {
          await until(`document.body.textContent.includes('Nothing needs your review')`)
          await caption('Both requested reviews are answered. The sequence leaves Needs Review.')
        }
        await delay(3000)
      }
      await click(tab('Reviewing'))
      await until(`document.querySelector('.group h3')?.textContent === 'Sequences 1'`)
      assert.ok(await run(`document.querySelector('.chain').textContent.includes('2 waiting on others')`))
      await caption('Reviewing keeps the sequence in Sequences while other reviewers are pending.')
      await delay(3500)
      recorder.stdin.write('q\n')
      await new Promise(resolve => recorder.on('exit', resolve))
      recorder = null
      await run(`document.getElementById('evidence-caption').remove()`)
      assert.deepEqual(errors, [])
      console.log(`${theme}: owner and reviewer sections, counts, and two real review submissions passed`)
    }
    win.destroy()
    // Compact layout uses the same renderer with the normal initial-layout fixture.
    process.env.SEQUENCE_COMPACT = '1'
    const compact = new BrowserWindow({ width: 440, height: 700, x: 0, y: 0, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/sequence-preload.cjs') } })
    await compact.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'tab=reviewing' })
    for (let i = 0; i < 100; i++) { if (await compact.webContents.executeJavaScript(`Boolean(document.querySelector('.ledger'))`)) break; await delay(100) }
    assert.ok(await compact.webContents.executeJavaScript(`document.body.textContent.includes('2 need your review')`))
    fs.writeFileSync(path.join(evidence, `reviewing-compact-${theme}.png`), (await compact.webContents.capturePage()).toPNG())
    const mineBounds = await compact.webContents.executeJavaScript(`(() => {const r=Array.from(document.querySelectorAll('[role="tab"]')).find(b=>b.textContent.startsWith('Mine')).getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
    execFileSync('xdotool', ['mousemove', String(Math.round(mineBounds.x)), String(Math.round(mineBounds.y))])
    execFileSync('xdotool', ['click', '1'])
    await delay(500)
    assert.ok(await compact.webContents.executeJavaScript(`document.querySelector('.ledger').textContent.includes('Settings migration') && document.querySelector('.ledger').textContent.includes('1 in progress')`))
    fs.writeFileSync(path.join(evidence, `mine-compact-${theme}.png`), (await compact.webContents.capturePage()).toPNG())
    compact.destroy()
    delete process.env.SEQUENCE_COMPACT
  }
  clearTimeout(timeout)
  app.quit()
}).catch(error => { console.error(error); recorder?.stdin.write('q\n'); app.exit(1) })
