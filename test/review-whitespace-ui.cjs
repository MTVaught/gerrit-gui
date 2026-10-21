// Build first, then run with xvfb-run -a -s '-screen 0 1600x1000x24'
// node_modules/.bin/electron --no-sandbox test/review-whitespace-ui.cjs
// Set REVIEW_WHITESPACE_VIDEO=1 for paired recordings of real pointer input.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
process.env.REVIEW_WHITESPACE_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-21 12:00:00.000'
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'review-whitespace-'))
const output = process.env.REVIEW_WHITESPACE_OUTPUT ?? path.join(__dirname, '../docs/screenshots/ignore-whitespace')
const video = process.env.REVIEW_WHITESPACE_VIDEO === '1'
app.setPath('userData', data)
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 180000)
app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true })
  const win = new BrowserWindow({ x: 0, y: 0, width: 1600, height: 1000, useContentSize: true, frame: false,
    webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  const errors = []
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
  async function until(script) {
    for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) }
    fs.writeFileSync(path.join(output, 'failure.png'), (await win.webContents.capturePage()).toPNG())
    throw new Error('Timed out: ' + script)
  }
  let pointer = { x: 1450, y: 900 }
  async function click(expression) {
    const b = await run(`(${expression}).getBoundingClientRect().toJSON()`)
    assert.ok(b.width > 0 && b.height > 0, 'visible mouse target')
    const point = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }
    for (let i = 1; i <= 20; i++) {
      execFileSync('xdotool', ['mousemove', String(Math.round(pointer.x + (point.x - pointer.x) * i / 20)), String(Math.round(pointer.y + (point.y - pointer.y) * i / 20))])
      await delay(video ? 30 : 1)
    }
    pointer = point
    await delay(video ? 2000 : 50)
    execFileSync('xdotool', ['click', '1'])
    await delay(180)
  }
  const query = selector => `document.querySelector(${JSON.stringify(selector)})`
  const field = `Array.from(document.querySelectorAll('.review-preference-fields label')).find(e => e.firstChild.textContent === 'Ignore Whitespace').querySelector('select')`
  const caption = text => run(`(() => {
    let e = document.getElementById('capture-caption');
    if (!e) { e = document.createElement('div'); e.id = 'capture-caption'; e.style.cssText = 'position:fixed;bottom:16px;left:300px;right:24px;z-index:99999;padding:14px;background:#192330;color:white;border:1px solid #8da0b5;border-radius:6px;font:17px sans-serif;pointer-events:none'; document.querySelector('.local-review').append(e) }
    e.textContent = ${JSON.stringify(text)};
  })()`)
  const highlights = () => run(`['original', 'modified'].map(side => {
    const editor = document.querySelector('.' + side + '-in-monaco-diff-editor');
    return Array.from(editor.querySelectorAll('.view-overlays > div')).filter(e => e.querySelector('.line-insert, .line-delete')).map(e => {
      const row = Array.from(editor.querySelectorAll('.view-lines > .view-line')).find(line => Math.abs(line.offsetTop - e.offsetTop) < 1);
      return row?.textContent.replaceAll('\\u00a0', ' ').trim();
    });
  })`)
  async function choose(mode) {
    await click(query('button[data-review-preferences]'))
    await click(field)
    // Native select input, not a DOM value or event mutation.
    execFileSync('xdotool', ['key', 'Home'])
    for (let i = 0; i < mode; i++) execFileSync('xdotool', ['key', 'Down'])
    await delay(video ? 1000 : 50)
    execFileSync('xdotool', ['key', 'Return'])
    await delay(250)
    await click(query('.review-preferences button[type="button"]'))
    await delay(400)
  }
  const report = {}
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await run(`localStorage.removeItem('local-review-diff-preferences')`)
    await win.reload()
    await until(`Boolean(document.querySelector('.review-main'))`)
    await click(query('.review-main'))
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && document.querySelectorAll('.line-insert').length >= 7`)
    await delay(400)
    const before = await highlights()
    assert.equal(before[0].length, 5)
    assert.equal(before[1].length, 7)
    if (video) recorder = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1600x1000', '-i', process.env.DISPLAY,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'loop-indent-' + theme + '.mp4')], { stdio: ['pipe', 'ignore', 'inherit'] })
    await caption('Linux Electron, simulated Gerrit data. Ignore Whitespace is None. The entire body is highlighted.')
    await delay(video ? 3000 : 50)
    await caption('Open Diff preferences. Select All with Home, three Down keys, then Enter.')
    await choose(3)
    await until(`document.querySelectorAll('.original-in-monaco-diff-editor .line-delete').length === 1 && document.querySelectorAll('.modified-in-monaco-diff-editor .line-insert').length === 3`)
    const after = await highlights()
    assert.deepEqual(after, [['const retryLimit = 2;'], ['for (const event of events) {', '}', 'const retryLimit = 3;']])
    await caption('Ignore All: only the new loop, closing brace, and retryLimit edit stay highlighted. The indented body has no highlight.')
    await delay(video ? 4000 : 100)
    fs.writeFileSync(path.join(output, 'loop-indent-' + theme + '.png'), (await win.webContents.capturePage()).toPNG())
    if (recorder) {
      const stopped = new Promise((resolve, reject) => recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('FFmpeg exit ' + code))))
      recorder.stdin.write('q'); await stopped; recorder = null
    }
    await run(`document.getElementById('capture-caption').remove()`)
    await choose(2)
    assert.deepEqual(await highlights(), after, 'Leading and trailing also ignores tab indentation')
    await choose(1)
    assert.deepEqual(await highlights(), before, 'Trailing mode retains leading tab changes')
    await choose(0)
    assert.deepEqual(await highlights(), before, 'None restores all changes')
    assert.equal((await run('api.fixtureStats()')).requests, 1, 'preference changes reuse source content')
    report[theme] = { before, after, modes: 'all four passed', sourceRequests: 1 }
    console.log(theme, JSON.stringify(report[theme]))
  }
  assert.deepEqual(errors, [])
  fs.writeFileSync(path.join(output, 'checks.json'), JSON.stringify(report, null, 2) + '\n')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); recorder?.kill('SIGINT'); clearTimeout(timeout); app.exit(1) })
  .finally(() => fs.rmSync(data, { recursive: true, force: true }))
