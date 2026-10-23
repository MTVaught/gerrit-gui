// Build first. Run with xvfb-run -a -s '-screen 0 1440x960x24' node_modules/.bin/electron --no-sandbox test/review-divider-ui.cjs
// Set REVIEW_DIVIDER_VIDEO=1 to record the same pointer workflow in both themes.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
process.env.REVIEW_WRAP_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-22 12:00:00.000'
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-divider-'))
const output = process.env.REVIEW_DIVIDER_OUTPUT ?? path.join(__dirname, '../docs/screenshots/review-divider')
const video = process.env.REVIEW_DIVIDER_VIDEO === '1'
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
  const errors = []
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
  win.webContents.on('render-process-gone', (_event, details) => errors.push(JSON.stringify(details)))
  const bounds = selector => run(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)
  async function until(script) {
    for (let i = 0; i < 150; i++) { if (await run(script)) return; await delay(100) }
    console.error(await run(`({ focus: document.activeElement?.outerHTML, text: document.querySelector('.modified-in-monaco-diff-editor .view-lines')?.textContent.slice(0, 2000) })`), errors)
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
  async function click(selector, dwell = recorder ? 2000 : 30) {
    const b = await bounds(selector)
    await move(b.x + b.width / 2, b.y + b.height / 2)
    await delay(dwell)
    execFileSync('xdotool', ['click', '1'])
    await delay(200)
  }
  async function press(keyCode, modifiers = []) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await delay(150)
  }
  const split = () => run(`(() => {
    const outer = document.querySelector('.monaco-diff-editor').getBoundingClientRect();
    const right = document.querySelector('.modified-in-monaco-diff-editor').getBoundingClientRect();
    const width = right.right - outer.x;
    return { left: right.x - outer.x, width, ratio: (right.x - outer.x) / width };
  })()`)
  async function drag(ratio) {
    const outer = await bounds('.monaco-diff-editor')
    const geometry = await split()
    const sash = await run(`Array.from(document.querySelectorAll('.monaco-diff-editor .monaco-sash.vertical')).map(e => e.getBoundingClientRect().toJSON()).find(b => b.height > 500 && b.width > 0)`)
    assert.ok(sash, 'diff divider is visible')
    await move(sash.x + sash.width / 2, sash.y + 180)
    await delay(recorder ? 2000 : 30)
    execFileSync('xdotool', ['mousedown', '1'])
    await move(Math.round(outer.x + geometry.width * ratio), sash.y + 180, recorder ? 1400 : 150)
    execFileSync('xdotool', ['mouseup', '1'])
    await delay(400)
    return split()
  }
  const first = 'src/telemetry/batch-scheduler.ts'
  const second = 'src/telemetry/types.ts'
  async function openFile(file) {
    await click(`[data-review-path="${file}"]`)
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && document.querySelector('.review-side-head').textContent.includes(${JSON.stringify(file)})`)
    await delay(300)
  }
  function sameRatio(actual, expected, message) {
    assert.ok(Math.abs(actual.ratio - expected.ratio) < 0.002, message + ': ' + JSON.stringify({ actual, expected }))
  }
  const caption = text => run(`(() => {
    let e = document.getElementById('capture-caption');
    if (!e) { e = document.createElement('div'); e.id = 'capture-caption'; e.style.cssText = 'position:fixed;bottom:10px;left:300px;right:12px;z-index:99999;padding:12px;background:#192330;color:#fff;border:1px solid #8da0b5;border-radius:6px;font:16px sans-serif;pointer-events:none'; document.querySelector('.local-review').append(e); }
    e.textContent = ${JSON.stringify(text)};
  })()`)
  const report = {}
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await run(`window.addEventListener('unhandledrejection', event => console.error(event.reason?.stack ?? event.reason))`)
    await until(`Boolean(document.querySelector('.review-main'))`)
    await click('.review-main')
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    await delay(400)
    if (video) recorder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x960', '-i', process.env.DISPLAY,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'shared-divider-' + theme + '.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] })
    await caption('Linux Electron with simulated Gerrit data. Drag the code divider to the left.')
    await delay(recorder ? 2500 : 30)
    const left = await drag(0.32)
    assert.ok(Math.abs(left.ratio - 0.32) < 0.003, 'first drag changes the ratio')
    await delay(recorder ? 1500 : 30)
    await caption('Open types.ts. The divider keeps the position set in batch-scheduler.ts.')
    await openFile(second)
    sameRatio(await split(), left, 'new file keeps divider')
    await delay(recorder ? 3000 : 30)
    await caption('Drag the divider to the right. This becomes the shared position.')
    const right = await drag(0.66)
    assert.ok(Math.abs(right.ratio - 0.66) < 0.003, 'second drag changes the ratio')
    await delay(recorder ? 1500 : 30)
    await caption('Return to batch-scheduler.ts. The cached file uses the latest divider position.')
    await openFile(first)
    sameRatio(await split(), right, 'cached file uses latest divider')
    await delay(recorder ? 3500 : 30)
    if (recorder) {
      const stopped = new Promise((resolve, reject) => recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('FFmpeg exit ' + code))))
      recorder.stdin.write('q'); await stopped; recorder = null
    }
    await run(`document.getElementById('capture-caption').remove()`)

    // Each file still has its own cursor and scroll position.
    win.focus()
    win.webContents.focus()
    const code = await bounds('.modified-in-monaco-diff-editor')
    await move(code.x + 100, code.y + 80)
    execFileSync('xdotool', ['click', '1'])
    await press('End', ['control'])
    await until(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.replaceAll('\\u00a0', ' ').includes('End of delivery fixtures')`)
    const cursorLine = await run(`Number(document.querySelector('.modified-in-monaco-diff-editor .line-numbers.active-line-number')?.textContent)`)
    assert.ok(cursorLine > 99000, 'cursor reaches the end of the complete file')
    await openFile(second)
    assert.ok(await run(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.includes('Comparing')`), 'second file restores its top position')
    await openFile(first)
    await until(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.replaceAll('\\u00a0', ' ').includes('End of delivery fixtures')`)
    assert.equal(await run(`Number(document.querySelector('.modified-in-monaco-diff-editor .line-numbers.active-line-number')?.textContent)`), cursorLine, 'cached file restores its cursor')
    await press('Home', ['control'])
    await until(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.includes('Comparing')`)

    // Full native drag range, including ratios outside splitViewDefaultRatio limits.
    const minimum = await drag(0)
    assert.equal(minimum.left, 100, 'original pane reaches Monaco minimum width')
    await openFile(second)
    sameRatio(await split(), minimum, 'minimum original width survives navigation')
    const maximum = await drag(1)
    assert.equal(maximum.width - maximum.left, 100, 'modified pane reaches Monaco minimum width')
    await openFile(first)
    sameRatio(await split(), maximum, 'minimum modified width survives navigation')
    const beforeResize = await drag(0.37)
    win.setContentSize(1100, 960); await delay(400)
    sameRatio(await split(), beforeResize, 'window resize retains ratio')
    await openFile(second)
    sameRatio(await split(), beforeResize, 'switching at a new size retains ratio')
    win.setContentSize(1440, 960); await delay(400)
    sameRatio(await split(), beforeResize, 'restoring size retains ratio')
    await click('select[aria-label="Compared patch set"]')
    await press('Up'); await press('Return')
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent.replaceAll('\\u00a0', ' ').includes('patch set 2')`)
    sameRatio(await split(), beforeResize, 'comparison change retains ratio')
    await click('.local-review-header > button:last-child')
    await until(`!document.querySelector('.local-review')`)
    await click('.review-main')
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    assert.ok(Math.abs((await split()).ratio - 0.5) < 0.002, 'reopened review starts with a fresh editor')
    report[theme] = { firstRatio: left.ratio, latestRatio: right.ratio, newFile: 'passed', cachedFile: 'passed', perFileScrollAndCursor: 'passed', extremePositions: 'passed', windowResize: 'passed', comparisonChange: 'passed', closeAndReopen: 'passed' }
    console.log(theme, JSON.stringify(report[theme]))
  }
  assert.deepEqual(errors, [], 'no renderer errors')
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); recorder?.kill('SIGINT'); clearTimeout(timeout); app.exit(1) })
  .finally(() => fs.rmSync(data, { recursive: true, force: true }))
