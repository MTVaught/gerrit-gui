// Build first. Real Electron renderer and input; Gerrit data is simulated.
// CAPTURE_PATCH_SET_FILTER=1 records both themes on an isolated Xvfb desktop.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawn, execFileSync } = require('node:child_process')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-patch-set-'))
const evidence = path.join(__dirname, '../openspec/changes/archive/2026-11-02-add-comment-patch-set-filter/evidence')
app.setPath('userData', path.join(scratch, 'user-data'))
app.disableHardwareAcceleration()
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_FILE_ACTIVITY_FIXTURE = '1'
process.env.REVIEW_PATCH_SET_FILTER_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-11-02 12:00:00.000'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 360000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 900, frame: false, show: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  const errors = []
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
  async function until(script, label) {
    for (let i = 0; i < 200; i++) { if (await run(script)) return; await delay(50) }
    throw new Error(label)
  }
  const patch = '[aria-label="Filter comment patch set"]'
  const show = '[aria-label="Filter comments"]'
  const author = '[aria-label="Filter comment author"]'
  async function point(selector) {
    return run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2)} })()`)
  }
  async function click(selector) {
    const p = await point(selector)
    for (const type of ['mouseMove', 'mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, ...p, button: 'left', clickCount: 1 })
    await delay(100)
  }
  async function key(keyCode) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await delay(60)
  }
  async function select(selector, index) {
    await click(selector); await key('Home')
    for (let i = 0; i < index; i++) await key('Down')
    await key('Return'); await delay(150)
  }
  async function open() {
    await click('.review-comments summary'); await click('.review-comments .review-menu-items button')
    await until(`Boolean(document.querySelector('.review-comment-overview[open]'))`, 'overview opens')
  }
  const ids = () => run(`[...document.querySelectorAll('.review-comment-overview [data-review-thread-id]')].map(el => el.dataset.reviewThreadId).sort()`)
  const snapshot = () => run(`(async () => ({file: document.querySelector('[data-review-path][aria-current="true"]')?.dataset.reviewPath, base: document.querySelector('[aria-label="Base patch set"]')?.value, patch: document.querySelector('[aria-label="Compared patch set"]')?.value, code: [...document.querySelectorAll('.review-editor .view-lines')].map(el => ({text: el.innerText, top: el.getBoundingClientRect().top})), stats: await api.fixtureStats()}))()`)
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`, 'board opens')
  await click('.review-main')
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`, 'review opens')
  win.focus(); win.webContents.focus()
  const results = []
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await until(`document.documentElement.dataset.theme === '${theme}'`, 'theme applied')
    await delay(400)
    const before = await snapshot()
    await open()
    assert.equal(await run(`document.querySelector('${patch}').value`), 'all')
    const options = await run(`[...document.querySelector('${patch}').options].map(o => o.value)`)
    assert.deepEqual(options, ['all', '10', '3', '2', '1'], 'options include draft-only patch sets and sort numerically')
    const all = await ids()
    await select(patch, 3)
    assert.deepEqual(await ids(), ['filter-old', 'filter-resolved'])
    assert.ok(await run(`document.querySelector('.review-comment-overview').textContent.includes('This reply stays with its original thread.')`), 'complete cross-patch-set thread remains')
    await select(patch, 4)
    assert.deepEqual(await ids(), ['filter-old'], 'saved PS 1 matches despite mapped PS 3 location')
    await select(patch, 1)
    assert.deepEqual(await ids(), ['filter-draft'], 'draft-only patch set matches')
    await select(show, 3)
    assert.deepEqual(await ids(), ['filter-draft'], 'draft status combines with patch set')
    await select(patch, 3)
    assert.deepEqual(await ids(), [])
    assert.ok(await run(`document.querySelector('.review-comment-overview-list').textContent.includes('No comments match these filters.')`))
    assert.deepEqual(await run(`[...document.querySelector('${patch}').options].map(o => o.value)`), options, 'other filters do not remove patch set options')
    await select(show, 1)
    assert.deepEqual(await ids(), ['filter-old'], 'unresolved status combines with patch set')
    await select(show, 2)
    assert.deepEqual(await ids(), ['filter-resolved'], 'resolved status combines with patch set')
    // Author options use first occurrence order: Everyone, Sam, Alex.
    await select(author, 2)
    assert.deepEqual(await ids(), [], 'author, status, and patch set combine')
    await select(show, 0)
    assert.deepEqual(await ids(), ['filter-old'], 'reply author matches full thread')
    await select(patch, 0)
    assert.ok((await ids()).includes('filter-draft'), 'clearing patch set restores other matching threads')
    assert.equal(await run(`document.querySelector('${author}').value`), '1', 'clearing patch set keeps author selection')
    await select(author, 0)
    assert.deepEqual(await ids(), all)
    await select(patch, 3)
    await click('.review-comment-return'); await open()
    assert.equal(await run(`document.querySelector('${patch}').value`), '2', 'selection survives closing overview')
    for (const size of [[1440, 900], [420, 760]]) {
      win.setSize(...size); await delay(350)
      const overflow = await run(`['.review-comment-overview', '.review-comment-filters', '.review-comment-overview-list'].some(s => { const el=document.querySelector(s); return el.scrollWidth > el.clientWidth })`)
      assert.equal(overflow, false, theme + ' layout at ' + size)
    }
    win.setSize(1440, 900); await delay(350)
    await select(patch, 0); await click('.review-comment-return')
    assert.deepEqual(await snapshot(), before, 'filters preserve file, comparison, code, drafts, and writes')
    results.push({ theme, options, checks: 'defaults, numeric order, drafts, original patch set, whole threads, combined filters, empty result, reset, retained selection, continuity, desktop and narrow layout passed' })
    console.log(theme + ' filter checks passed')
  }
  if (process.env.CAPTURE_PATCH_SET_FILTER) {
    fs.mkdirSync(evidence, { recursive: true })
    const captionFile = path.join(scratch, 'caption.txt')
    function caption(value) { fs.writeFileSync(captionFile + '.next', value); fs.renameSync(captionFile + '.next', captionFile) }
    const native = (...args) => execFileSync('xdotool', args.map(String))
    let cursor = { x: 720, y: 450 }
    async function nativeClick(selector) {
      const p = await point(selector), start = cursor
      for (let i = 1; i <= 20; i++) { native('mousemove', Math.round(start.x + (p.x-start.x)*i/20), Math.round(start.y + (p.y-start.y)*i/20)); await delay(35) }
      cursor = p; await delay(2000); native('click', '1'); await delay(700)
    }
    async function nativeSelect(selector, index, text) {
      caption(text + ' Use Home, arrow keys, then Enter.'); await nativeClick(selector)
      native('key', 'Home'); await delay(250)
      for (let i = 0; i < index; i++) { native('key', 'Down'); await delay(250) }
      await delay(800); native('key', 'Return'); await delay(1800)
    }
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme
      await until(`document.documentElement.dataset.theme === '${theme}'`, 'capture theme')
      await delay(500)
      caption('Filter All comments by patch set. Gerrit data is simulated.')
      const output = path.join(evidence, `patch-set-filter-${theme}.mp4`)
      recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1440x900', '-i', process.env.DISPLAY, '-vf', `drawbox=x=0:y=ih-50:w=iw:h=50:color=black@0.9:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionFile}:reload=1:fontcolor=white:fontsize=18:x=(w-tw)/2:y=h-34`, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, `ffmpeg-${theme}.log`), 'w')] })
      await delay(700)
      caption('Open All comments from the Comments menu.')
      await nativeClick('.review-comments summary'); await nativeClick('.review-comments .review-menu-items button')
      await until(`Boolean(document.querySelector('.review-comment-overview[open]'))`, 'recorded overview opens')
      await delay(1200)
      await nativeSelect(patch, 3, 'Select PS 2. Keep the full matching threads.')
      assert.deepEqual(await ids(), ['filter-old', 'filter-resolved'])
      fs.writeFileSync(path.join(evidence, `patch-set-filter-${theme}.png`), (await win.webContents.capturePage()).toPNG())
      await nativeSelect(show, 2, 'Show resolved threads on PS 2.')
      assert.deepEqual(await ids(), ['filter-resolved'])
      await nativeSelect(author, 2, 'Select Alex. No resolved PS 2 threads match.')
      assert.deepEqual(await ids(), [])
      caption('No comments match these filters. All filter controls remain available.'); await delay(2000)
      await nativeSelect(author, 0, 'Restore Everyone.')
      await nativeSelect(show, 0, 'Restore All comments.')
      await nativeSelect(patch, 0, 'Restore All patch sets.')
      caption('All threads return. The code comparison stays on patch set 3.'); await delay(2500)
      await nativeClick('.review-comment-return'); await delay(1200)
      const stopped = new Promise((resolve, reject) => recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('ffmpeg exit ' + code))))
      recorder.stdin.write('q'); await stopped; recorder = null
      console.log(theme + ' native recording saved')
    }
    fs.writeFileSync(path.join(evidence, 'checks.json'), JSON.stringify(results, null, 2) + '\n')
  }
  assert.deepEqual(errors, [])
  console.log('Patch set filter checks passed in both themes')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); recorder?.kill('SIGINT'); app.exit(1) })
