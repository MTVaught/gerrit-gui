// Build first, then run in a 1440x960 Xvfb display with xdotool installed:
// xvfb-run -a -s '-screen 0 1440x960x24' node_modules/.bin/electron --no-sandbox test/review-wrapping-ui.cjs
// Set REVIEW_WRAP_VIDEO=1 to record the divider workflow in both themes.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
process.env.REVIEW_WRAP_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-21 12:00:00.000'
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-wrap-'))
const output = path.join(__dirname, '../docs/screenshots/diff-wrapping')
const video = process.env.REVIEW_WRAP_VIDEO === '1'
app.setPath('userData', data)
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 180000)
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 960, useContentSize: true, frame: false,
    webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  const bounds = selector => run(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)
  async function until(script) {
    for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) }
    throw new Error('Timed out: ' + script)
  }
  let pointer = { x: 1300, y: 800 }
  async function move(x, y, duration = video ? 700 : 40) {
    for (let i = 1; i <= 20; i++) {
      execFileSync('xdotool', ['mousemove', String(Math.round(pointer.x + (x - pointer.x) * i / 20)), String(Math.round(pointer.y + (y - pointer.y) * i / 20))])
      await delay(duration / 20)
    }
    pointer = { x, y }
  }
  async function click(selector) {
    const b = await bounds(selector)
    await move(b.x + b.width / 2, b.y + b.height / 2)
    await delay(video ? 2000 : 30)
    execFileSync('xdotool', ['click', '1'])
    await delay(150)
  }
  async function press(keyCode, modifiers = []) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await delay(100)
  }
  async function drag(x) {
    const sashes = await run(`Array.from(document.querySelectorAll('.monaco-diff-editor .monaco-sash.vertical')).map(e => e.getBoundingClientRect().toJSON())`)
    const b = sashes.find(rect => rect.height > 500 && rect.width > 0)
    assert.ok(b, 'divider has current rendered bounds: ' + JSON.stringify(sashes))
    const y = Math.round(b.y + 180)
    await move(Math.round(b.x + b.width / 2), y)
    await delay(video ? 2000 : 50)
    const started = Date.now()
    execFileSync('xdotool', ['mousedown', '1'])
    await move(x, y, video ? 1500 : 150)
    execFileSync('xdotool', ['mouseup', '1'])
    await until(`Math.abs(document.querySelector('.original-in-monaco-diff-editor').getBoundingClientRect().right - ${x}) < 3`)
    await delay(200)
    await run('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))')
    return Date.now() - started
  }
  const panes = () => run(`['original','modified'].map(side => {
    const e = document.querySelector('.' + side + '-in-monaco-diff-editor');
    const text = Array.from(e.querySelectorAll('.view-line')).map(l => l.textContent.replaceAll('\\u00a0', ' '));
    return { width: e.getBoundingClientRect().width, text,
      rows: Object.fromEntries(Array.from(e.querySelectorAll('.line-numbers')).filter(l => l.textContent).map(l => [l.textContent, l.getBoundingClientRect().top])) };
  })`)
  const caption = text => run(`(() => {
    let e = document.getElementById('capture-caption');
    if (!e) { e = document.createElement('div'); e.id = 'capture-caption'; e.style.cssText = 'position:fixed;bottom:10px;left:300px;right:12px;z-index:99999;padding:12px;background:#192330;color:#fff;border:1px solid #8da0b5;border-radius:6px;font:16px sans-serif;pointer-events:none'; document.querySelector('.local-review').append(e); }
    e.textContent = ${JSON.stringify(text)};
  })()`)
  function checkSplit(result, narrow) {
    assert.ok(result[narrow].width < 250, 'target pane is narrow')
    assert.ok(result[1 - narrow].width > 900, 'opposite pane has space')
    assert.ok(!result[narrow].text.includes('// Comparing base to patch set 3'), 'narrow pane wraps the first source line')
    assert.ok(result[1 - narrow].text.includes('// Comparing base to patch set 3'), 'wide pane keeps the first source line on one row')
    for (const line of ['2', '4', '5', '6', '7']) {
      if (result[0].rows[line] && result[1].rows[line]) assert.ok(Math.abs(result[0].rows[line] - result[1].rows[line]) < 2, 'matching source row ' + line + ' stays aligned')
    }
  }
  async function preferences(fit) {
    await click('button[data-review-preferences]')
    await click('.review-preference-fields label:has(input[type="checkbox"]) input')
    if (!fit) {
      const selector = '.review-preference-fields input[type="number"]'
      await click(selector)
      await press('a', ['control'])
      await win.webContents.insertText('40')
    }
    await click('.review-preferences button[type="submit"]')
    await until(`!document.querySelector('.review-preferences')`)
  }
  const report = {}
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await until(`Boolean(document.querySelector('.review-main'))`)
    await click('.review-main')
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    await delay(500)
    const outer = await bounds('.monaco-diff-editor')
    if (video) recorder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x960', '-i', process.env.DISPLAY,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'independent-wrap-' + theme + '.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] })
    await caption('Linux Electron with simulated Gerrit data. Fit to screen is enabled.')
    await delay(video ? 3000 : 30)
    await caption('Drag left. The left pane wraps; the wider right pane uses its full width.')
    const leftResizeMs = await drag(Math.round(outer.x + 240))
    checkSplit(await panes(), 0)
    await delay(video ? 3500 : 30)
    fs.writeFileSync(path.join(output, 'independent-wrap-' + theme + '.png'), (await win.webContents.capturePage()).toPNG())
    const nodes = await run(`({ zones: document.querySelectorAll('.review-editor .view-zones > div').length, domNodes: document.querySelectorAll('*').length })`)
    await caption('Drag right. The right pane wraps; the wider left pane uses its full width.')
    const rightResizeMs = await drag(Math.round(outer.right - 240))
    checkSplit(await panes(), 1)
    await delay(video ? 3500 : 30)
    if (recorder) {
      const stopped = new Promise((resolve, reject) => recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('FFmpeg exit ' + code))))
      recorder.stdin.write('q'); await stopped; recorder = null
    }
    await run(`document.getElementById('capture-caption').remove()`)
    // Use real editor focus and keyboard navigation through the full model.
    const focus = await bounds('.modified-in-monaco-diff-editor')
    await move(focus.x + 100, focus.y + 12)
    execFileSync('xdotool', ['click', '1'])
    const started = Date.now()
    await press('End', ['control'])
    await until(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.replaceAll('\\u00a0', ' ').includes('End of delivery fixtures')`)
    const endNavigationMs = Date.now() - started
    await press('Home', ['control'])
    await until(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.includes('Comparing')`)
    // Wheel input must move both panes to matching source positions.
    const b = await bounds('.modified-in-monaco-diff-editor')
    win.webContents.sendInputEvent({ type: 'mouseWheel', x: Math.round(b.x + 100), y: Math.round(b.y + 200), deltaY: -450, deltaX: 0, canScroll: true })
    await delay(300)
    const scrolled = await panes()
    const shared = Object.keys(scrolled[0].rows).filter(line => scrolled[1].rows[line])
    assert.ok(shared.length > 2, 'both panes show matching source lines after scrolling')
    for (const line of shared) assert.ok(Math.abs(scrolled[0].rows[line] - scrolled[1].rows[line]) < 2, 'linked scrolling aligns source line ' + line)
    await press('Home', ['control'])
    await press('c')
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
    assert.equal(await run(`document.querySelector('.review-comment-compose').closest('[role="region"]').getAttribute('aria-label')`), 'Modified comments after line 1', 'comment uses the source line rather than a wrapped visual row')
    const commented = await panes()
    assert.ok(Math.abs(commented[0].rows['2'] - commented[1].rows['2']) < 2, 'comment insertion preserves source row alignment')
    await click('.review-comment-compose > div > button[type="button"]')
    await until(`!document.querySelector('.review-comment-compose')`)
    await drag(Math.round(outer.x + outer.width / 2))
    await preferences(false)
    let fixed = await panes()
    assert.ok(fixed.every(p => !p.text.includes('// Keep queued events bounded while preserving delivery order.')), 'both wide panes use saved column wrapping')
    await drag(Math.round(outer.x + 240))
    fixed = await panes()
    assert.ok(fixed.every(p => p.text.includes('// Comparing base to patch set 3')), 'pane resizing preserves the configured column instead of fitting the viewport')
    await preferences(true)
    checkSplit(await panes(), 0)
    await drag(Math.round(outer.x + outer.width / 2))
    fixed = await panes()
    assert.ok(fixed.every(p => p.text.includes('// Keep queued events bounded while preserving delivery order.')), 'viewport wrapping returns in both panes')
    assert.equal(await run(`JSON.parse(localStorage.getItem('local-review-diff-preferences')).diffWidth`), 40)
    // Window resizing uses the same viewport mode without a custom fit callback.
    win.setContentSize(1000, 960); await delay(400)
    assert.ok((await panes()).every(p => !p.text.includes('// Keep queued events bounded while preserving delivery order.')))
    win.setContentSize(1440, 960); await delay(400)
    assert.ok((await panes()).every(p => p.text.includes('// Keep queued events bounded while preserving delivery order.')))
    report[theme] = { leftResizeMs, rightResizeMs, endNavigationMs, ...nodes, independentWrapping: 'passed', rowAlignment: 'passed', linkedScrolling: 'passed', inlineCommentAnchor: 'passed', savedColumnMode: 'passed', windowResize: 'passed', fullFileNavigation: 'passed' }
    console.log(theme, JSON.stringify(report[theme]))
    assert.ok(leftResizeMs < 5000 && rightResizeMs < 5000 && endNavigationMs < 5000, 'large file responds within five seconds')
  }
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); recorder?.kill('SIGINT'); clearTimeout(timeout); app.exit(1) })
  .finally(() => fs.rmSync(data, { recursive: true, force: true }))
