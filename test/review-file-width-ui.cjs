// Build first. Run in an isolated 1440x960 Xvfb display:
// node_modules/.bin/electron --no-sandbox test/review-file-width-ui.cjs
// Set REVIEW_WIDTH_VIDEO=1 to record the pointer workflow with FFmpeg.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
process.env.REVIEW_FILE_WIDTH_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-20 12:00:00.000'
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-file-width-'))
const output = path.join(__dirname, '../docs/screenshots/review-file-pane')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', userData)
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const longPath = 'src/telemetry/delivery-pipeline/retry-policies/region-failover/batch-scheduler-with-region-aware-delivery-and-retry-policy.ts'
const nameSelector = `[data-review-path="${longPath}"]`
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 180000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 960, useContentSize: true, frame: false,
    webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script).catch(error => { console.error('Renderer check failed:', script); throw error })
  const bounds = selector => run(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)
  async function until(script) {
    for (let i = 0; i < 150; i++) { if (await run(script)) return; await delay(100) }
    throw new Error('Timed out: ' + script)
  }
  // X11 pointer input also makes the pointer visible in desktop recordings.
  let pointer = { x: 700, y: 850 }
  async function move(x, y, duration = 300) {
    for (let step = 1; step <= 20; step++) {
      execFileSync('xdotool', ['mousemove', String(Math.round(pointer.x + (x - pointer.x) * step / 20)), String(Math.round(pointer.y + (y - pointer.y) * step / 20))])
      await delay(duration / 20)
    }
    pointer = { x, y }
  }
  async function click(selector, dwell = 0) {
    const b = await bounds(selector)
    await move(Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2), dwell ? 700 : 100)
    await delay(dwell)
    execFileSync('xdotool', ['click', '1'])
    await delay(250)
  }
  async function dragTo(width, dwell = 0) {
    const b = await bounds('.review-file-resize')
    const y = Math.round(b.y + 120)
    await move(Math.round(b.x + b.width / 2), y, dwell ? 700 : 100)
    await delay(dwell)
    execFileSync('xdotool', ['mousedown', '1'])
    await move(width + 2, y, dwell ? 1400 : 300)
    execFileSync('xdotool', ['mouseup', '1'])
    await delay(350)
  }
  async function press(keyCode) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(150)
  }
  async function open() {
    await click('.review-main')
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    await delay(350)
  }
  async function checkLayout() {
    const result = await run(`(() => {
      const pane = document.querySelector('.review-files'), separator = document.querySelector('.review-file-resize')
      const labels = [...document.querySelectorAll('.review-directory, .review-file-name')]
      return {
        width: pane.getBoundingClientRect().width, max: pane.parentElement.clientWidth / 2,
        value: Number(separator.getAttribute('aria-valuenow')), limit: Number(separator.getAttribute('aria-valuemax')),
        overflow: labels.filter(e => e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1).map(e => e.textContent),
        listOverflow: document.querySelector('.review-files-list').scrollWidth > pane.clientWidth,
        rowsOverflow: [...document.querySelectorAll('.review-file-row')].some(e => e.scrollWidth > e.clientWidth + 1),
        clipped: labels.some(e => getComputedStyle(e).textOverflow === 'ellipsis'),
        diffWidth: document.querySelector('.review-file').getBoundingClientRect().width
      }
    })()`)
    assert.ok(result.width <= result.max + 1, JSON.stringify(result))
    assert.ok(Math.abs(result.value - result.width) <= 1 && Math.abs(result.limit - result.max) <= 1, 'separator reports rendered dimensions')
    assert.deepEqual(result.overflow, [], 'labels fit their boxes')
    assert.ok(!result.listOverflow && !result.rowsOverflow && !result.clipped, JSON.stringify(result))
    assert.ok(result.diffWidth >= result.max - 6, 'diff remains accessible')
    return result.width
  }
  const shot = async name => fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
  const report = {}
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await until(`Boolean(document.querySelector('.review-main'))`)
    await open()
    const initialWidth = await checkLayout()
    assert.ok(initialWidth > 360 && initialWidth < 720, 'automatic width fits long labels beyond the old cap')
    assert.equal(await run(`document.querySelector(${JSON.stringify(nameSelector)}).clientHeight`), 24, 'long file name fits on one line')
    await move(1100, 850)
    await shot('automatic-' + theme)

    // Filter changes must update the intrinsic width without losing selection.
    const before = await run(`document.querySelector('[data-review-path][aria-current=true]').dataset.reviewPath`)
    await click(`[aria-label="Mark reviewed: ${longPath}"]`)
    await click('.review-files-filter input')
    await until(`document.querySelectorAll('[data-review-path]').length === 1`)
    assert.ok(await checkLayout() < initialWidth, 'filter recomputes automatic width')
    assert.equal(await run(`document.querySelector('[data-review-path][aria-current=true]').dataset.reviewPath`), before)
    await click('.review-files-filter input')
    assert.ok(Math.abs(await checkLayout() - initialWidth) < 1)
    await click(`[aria-label="Mark unreviewed: ${longPath}"]`)

    win.setContentSize(800, 960)
    await delay(500)
    await checkLayout()
    assert.ok(await run(`document.querySelector(${JSON.stringify(nameSelector)}).clientHeight > 24`), 'automatic mode wraps at the window limit')
    win.setContentSize(1440, 960)
    await delay(500)
    assert.ok(Math.abs(await checkLayout() - initialWidth) < 1)

    await dragTo(640)
    assert.ok(Math.abs(await checkLayout() - 640) < 2, 'pointer can expand beyond 360px')
    await run(`document.querySelector('.review-file-resize').focus()`)
    await press('Left')
    assert.ok(Math.abs(await checkLayout() - 630) < 2, 'Left resizes from the measured width')
    await press('Right')
    assert.ok(Math.abs(await checkLayout() - 640) < 2, 'Right expands beyond 360px')
    await dragTo(900)
    assert.equal(await checkLayout(), 720, 'pointer clamps to the available width')
    await press('Right')
    assert.equal(await checkLayout(), 720)
    win.setContentSize(800, 960)
    await delay(500)
    assert.equal(await checkLayout(), 400, 'manual mode clamps on window resize')
    await run(`document.querySelector('.review-file-resize').focus()`)
    await press('Left')
    assert.equal(await checkLayout(), 390, 'keyboard starts from actual width after a window resize')
    win.setContentSize(1440, 960)
    await delay(500)

    // Load a new comparison with an unbroken label wider than the window.
    await run(`window.api.fixtureWideFile(true)`)
    await click('select[aria-label="Compared patch set"]')
    await press('Up')
    await press('Return')
    await until(`document.querySelectorAll('[data-review-path]').length === 3 && document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    await checkLayout()
    assert.ok(await run(`Array.from(document.querySelectorAll('[data-review-path]')).find(e => e.textContent.length > 150).clientHeight > 24`), 'unbroken label wraps')
    await click('.local-review-header > button:last-child')
    await until(`!document.querySelector('.local-review')`)
    await open()
    assert.equal(await checkLayout(), 720, 'reopen restores automatic sizing for new data')
    await run(`window.api.fixtureWideFile(false)`)
    await click('.local-review-header > button:last-child')
    await until(`!document.querySelector('.local-review')`)
    await open()
    assert.ok(Math.abs(await checkLayout() - initialWidth) < 1, 'reopen resets manual width')

    // Matching, continuous demonstration in both themes.
    if (process.env.REVIEW_WIDTH_VIDEO) {
      recorder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x960', '-i', process.env.DISPLAY,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'resize-' + theme + '.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] })
      await delay(500)
    }
    const caption = text => run(`(() => { let e = document.getElementById('capture-caption'); if (!e) { e = document.createElement('div'); e.id = 'capture-caption'; e.style.cssText = 'position:fixed;bottom:12px;left:30%;right:12px;z-index:99999;padding:12px 16px;background:#192330;color:#fff;border:1px solid #8da0b5;border-radius:6px;font:16px sans-serif;pointer-events:none'; document.querySelector('.local-review').append(e); } e.textContent = ${JSON.stringify(text)}; })()`)
    await caption('The file pane opens wide enough for full names. Linux Electron with fixture data.')
    await delay(3000)
    await caption('Drag the divider left. Long folder paths and file names wrap in full.')
    await dragTo(240, 2000)
    await delay(3000)
    await checkLayout()
    await caption('Click the long file name to open its diff. The full name remains visible.')
    await click(nameSelector, 2000)
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && document.querySelector(${JSON.stringify(nameSelector)}).getAttribute('aria-current') === 'true'`)
    await delay(2000)
    await run(`document.getElementById('capture-caption').remove()`)
    await move(1100, 850)
    await shot('wrapped-' + theme)
    await caption('Drag the divider right past 360 px. The names return to one line.')
    await dragTo(640, 2000)
    await delay(3000)
    await checkLayout()
    if (recorder) {
      const stopped = new Promise((resolve, reject) => recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('FFmpeg exit ' + code))))
      recorder.stdin.write('q')
      await stopped
      recorder = null
    }
    report[theme] = { automaticWidth: initialWidth, pointerWidth: 640, windowLimit: 720, wrappedWidth: 240, checks: 'passed' }
  }
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
  console.log(JSON.stringify(report))
  clearTimeout(timeout)
  win.destroy()
  app.quit()
}).catch(error => { console.error(error); recorder?.kill('SIGINT'); clearTimeout(timeout); app.exit(1) })
  .finally(() => fs.rmSync(userData, { recursive: true, force: true }))
