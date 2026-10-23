// Isolated Linux desktop, production app/preload, simulated Gerrit, real X11 input.
// Run once per theme under a 1920x1080 Xvfb display and a separate D-Bus session.
const { app, BrowserWindow, nativeTheme } = require('electron')
const { spawn, execFile } = require('node:child_process')
const { promisify } = require('node:util')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { startReviewServer } = require('./fixtures/review-windows-server.cjs')
const theme = process.env.REVIEW_WINDOWS_THEME || 'light'
const output = path.resolve(__dirname, '../docs/screenshots/review-windows')
fs.mkdirSync(output, { recursive: true })
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'review-windows-record-'))
app.setPath('userData', scratch)
app.disableHardwareAcceleration()
nativeTheme.themeSource = theme
process.env.GERRIT_GUI_USER_DATA = scratch
process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP = '1'
process.env.GERRIT_GUI_TAB = 'settings'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const input = (...args) => promisify(execFile)('xdotool', args.map(String)).then(result => result.stdout)
const run = (win, script) => win.webContents.executeJavaScript(script)
async function until(check, label) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await delay(80) }
  throw new Error('Timed out: ' + label)
}
async function focus(win) {
  const id = win.getNativeWindowHandle().readUInt32LE()
  await input('windowactivate', '--sync', id)
  await delay(250)
}
async function move(x, y) {
  const current = await input('getmouselocation', '--shell')
  const sx = Number(current.match(/^X=(\d+)/m)[1]), sy = Number(current.match(/^Y=(\d+)/m)[1])
  for (let step = 1; step <= 16; step++) {
    await input('mousemove', Math.round(sx + (x - sx) * step / 16), Math.round(sy + (y - sy) * step / 16))
    await delay(50)
  }
  await delay(2000)
}
async function click(win, expression) {
  await focus(win)
  const rect = await run(win, `(${expression})?.getBoundingClientRect().toJSON()`)
  assert.ok(rect?.width && rect?.height, 'visible target ' + expression)
  const content = win.getContentBounds()
  await move(content.x + Math.round(rect.x + rect.width / 2), content.y + Math.round(rect.y + rect.height / 2))
  await input('click', 1)
  await delay(400)
}
const button = (win, text) => click(win, `Array.from(document.querySelectorAll('button')).find(el=>el.textContent.trim()===${JSON.stringify(text)})`)
const selector = (win, css) => click(win, `document.querySelector(${JSON.stringify(css)})`)
async function type(win, expression, text) {
  await click(win, expression)
  await input('key', '--clearmodifiers', 'ctrl+a')
  await input('type', '--clearmodifiers', '--delay', 25, text)
}
const field = `document.querySelector('[aria-label="Draft comment"]')`
let fixture, caption, recorder, openbox
const captions = []
const started = Date.now()
async function say(text) {
  console.log(theme + ': ' + text)
  captions.push({ seconds: (Date.now() - started) / 1000, text })
  await run(caption, `document.querySelector('p').textContent=${JSON.stringify(text)}`)
  await delay(1200)
}
async function settled(win) {
  await until(() => run(win, `document.querySelector('.review-comment-compose [role="status"]')?.textContent==='Saved to Gerrit' && !document.querySelector('.review-comment-compose .primary').disabled`), 'draft saved')
}
const timeout = setTimeout(() => { recorder?.stdin.write('q'); openbox?.kill(); app.exit(2) }, 360000)

;(async () => {
  openbox = spawn('openbox', [], { stdio: ['ignore', 'ignore', fs.openSync(path.join(scratch, 'openbox.log'), 'w')] })
  await delay(600)
  fixture = await startReviewServer(Number(process.env.REVIEW_WINDOWS_PORT || 0))
  fs.writeFileSync(path.join(scratch, 'settings.json'), JSON.stringify({ serverUrl: fixture.url, username: 'alex', password: 'simulated-only', localReview: true, theme, diffTheme: 'application', showAppBadge: false, showTrayCounts: false }))
  await app.whenReady()
  caption = new BrowserWindow({ title: 'Evidence caption', x: 0, y: 980, width: 1920, height: 100, frame: false, focusable: false, alwaysOnTop: true, skipTaskbar: true, webPreferences: { sandbox: true } })
  await caption.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;background:#132135;color:#fff;font:23px/1.4 sans-serif;padding:18px 28px"><p style="margin:0"></p></body>'))
  let reviewCount = 0
  app.on('browser-window-created', (_event, win) => {
    const review = win.getTitle().startsWith('#')
    const index = review ? reviewCount++ : 0
    win.once('ready-to-show', () => win.setBounds(review
      ? { x: index % 2 ? 964 : 4, y: 64, width: 952, height: 900 }
      : { x: 150, y: 64, width: 1500, height: 900 }))
  })
  require('../out/main/index.js')
  await until(() => BrowserWindow.getAllWindows().some(w => w !== caption), 'board created')
  const board = BrowserWindow.getAllWindows().find(w => w !== caption)
  await until(() => run(board, `Boolean(document.querySelector('.settings-page'))`), 'settings ready')
  await focus(board)
  const video = path.join(output, `review-windows-${theme}.mp4`)
  recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1920x1080', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, 'ffmpeg.log'), 'w')] })
  const recorded = new Promise((resolve, reject) => { recorder.on('error', reject); recorder.on('exit', code => code === 0 ? resolve() : reject(new Error('FFmpeg exited ' + code))) })
  await say('Linux Electron with simulated Gerrit data. Enable separate review windows in Settings > Window.')
  await button(board, 'Window')
  await click(board, `Array.from(document.querySelectorAll('label')).find(el=>el.textContent.includes('Open reviews in separate windows')).querySelector('input')`)
  await until(() => run(board, 'api.getSettings().then(s=>s.separateReviewWindows)'), 'setting saved')
  fs.writeFileSync(path.join(output, `review-window-setting-${theme}.png`), (await board.webContents.capturePage()).toPNG())
  await say('Open a review from the board, then open the same review again.')
  await selector(board, '[aria-label="Settings"]')
  await selector(board, '.review-main')
  const reviews = () => BrowserWindow.getAllWindows().filter(w => w !== board && w !== caption)
  await until(() => reviews().length === 1, 'first window')
  const a = reviews()[0]
  await selector(board, '.review-main')
  await until(() => reviews().length === 2, 'second window')
  const b = reviews().find(w => w !== a)
  for (const win of [a,b]) await until(() => run(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true'`), 'editor ready')
  await focus(a); await focus(b)
  await say('Two instances of the same review coexist. Change the file in the right window.')
  await selector(b, '[data-review-path="src/telemetry/types.ts"]')
  assert.equal(await run(a, `document.querySelector('[data-review-path][aria-current="true"]').dataset.reviewPath`), 'src/telemetry/batch-scheduler.ts')
  await delay(1600)
  await say('Saved diff preferences apply to both windows. Set font size to 16 in the left window.')
  await button(a, 'Diff preferences'); await button(b, 'Diff preferences')
  await type(a, `Array.from(document.querySelectorAll('label')).find(el=>el.textContent.startsWith('Font size')).querySelector('input')`, '16')
  await until(() => run(b, `Array.from(document.querySelectorAll('label')).find(el=>el.textContent.startsWith('Font size')).querySelector('input').value==='16'`), 'shared font')
  await delay(1800)
  await button(b, 'Close'); await button(a, 'Close')
  await selector(b, '[data-review-path="src/telemetry/batch-scheduler.ts"]')
  await say('Save a comment in the left window. The right window updates without input.')
  await selector(a, '.review-comments .review-menu summary')
  await button(a, 'File comment')
  await type(a, field, 'Keep delivery order when a batch is full.')
  await settled(a)
  await until(() => run(b, `document.body.innerText.includes('Keep delivery order when a batch is full.')`), 'shared draft')
  await button(a, 'Save')
  await delay(1800)
  await say('Open the same saved draft in both windows. Save a new version on the left.')
  await button(a, 'Edit'); await button(b, 'Edit')
  await type(a, field, 'Keep delivery order and test the retry limit.')
  await settled(a)
  await until(() => run(b, `Boolean(document.querySelector('.review-draft-conflict'))`), 'conflict visible')
  await say('The right window keeps its text and pauses autosave. Keep its edit as a new draft.')
  await type(b, field, 'Check timeout behavior in a separate draft.')
  await button(b, 'Keep as new draft')
  await settled(b)
  await button(b, 'Save'); await button(a, 'Save')
  assert.equal(fixture.state.drafts.length, 2)
  await say('Simulate a slow Gerrit save. Alt+F4 must leave the window open while the write is pending.')
  fixture.state.draftDelay = 8000
  await selector(a, '.review-comments .review-menu summary'); await button(a, 'File comment')
  await type(a, field, 'A slow saved draft.')
  await until(() => run(a, `document.querySelector('.review-comment-compose [role="status"]')?.textContent==='Saving…'`), 'pending save')
  await focus(a)
  await input('key', '--clearmodifiers', 'alt+F4')
  await delay(1400)
  assert.equal(a.isDestroyed(), false)
  await settled(a); fixture.state.draftDelay = 0
  await say('The save finished. The window stayed open and the saved draft reached the other view.')
  await button(a, 'Save')
  await say('Type a new comment, then press Alt+F4. Escape on the discard prompt keeps the unsaved text.')
  await selector(b, '.review-comments .review-menu summary'); await button(b, 'File comment')
  await click(b, field)
  await input('type', '--clearmodifiers', '--delay', 20, 'Keep this text.')
  const dismiss = spawn('bash', ['-c', 'sleep 2; xdotool key --clearmodifiers Escape'], { stdio: 'ignore' })
  await input('key', '--clearmodifiers', 'alt+F4')
  await new Promise(resolve => { if (dismiss.exitCode !== null) resolve(); else dismiss.once('exit', resolve) })
  assert.equal(b.isDestroyed(), false)
  assert.equal(await run(b, `${field}.value`), 'Keep this text.')
  await settled(b); await button(b, 'Save')
  await say('Press U in the left review. App navigation keeps this review window open.')
  await selector(a, '[data-review-path="src/telemetry/batch-scheduler.ts"]')
  await input('key', '--clearmodifiers', 'u'); await delay(1600)
  assert.equal(a.isDestroyed(), false)
  await say('Escape dismisses Diff preferences and leaves the review window open.')
  await button(a, 'Diff preferences')
  await input('key', '--clearmodifiers', 'Escape'); await delay(1400)
  assert.equal(await run(a, `Boolean(document.querySelector('.review-preferences'))`), false)
  await say('Alt+F4 closes the focused review. The second review and board keep running.')
  await focus(a); await input('key', '--clearmodifiers', 'alt+F4')
  await until(() => a.isDestroyed(), 'normal system close')
  assert.equal(b.isDestroyed(), false)
  assert.equal(board.isDestroyed(), false)
  await delay(2800)
  recorder.stdin.write('q'); await recorded
  require('./fixtures/review-window-captions.cjs').finishCaptions(video, captions)
  fs.writeFileSync(path.join(output, `recording-${theme}.json`), JSON.stringify({ theme, platform: 'Linux X11', electron: process.versions.electron, data: 'Simulated Gerrit service. Production app, service, preload and renderer.', input: 'xdotool pointer, clicks, typing, U, Escape and Alt+F4', captions }, null, 2) + '\n')
  console.log('Recorded ' + video)
  clearTimeout(timeout)
  fixture.server.close(); openbox.kill(); app.exit(0)
})().catch(async error => {
  console.error(error.stack)
  recorder?.stdin.write('q')
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) fs.writeFileSync(path.join(scratch, `failure-${win.id}.png`), (await win.webContents.capturePage()).toPNG())
  console.error('Recording diagnostics: ' + scratch)
  fixture?.server.close(); openbox?.kill(); clearTimeout(timeout); app.exit(1)
})
