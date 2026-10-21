// Build first. Run under Xvfb. RECORD_ESCAPE=1 records the reply workflow.
// Gerrit data and writes are simulated; the renderer and input actions are real.
const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'comment-escape-ui-')))
app.disableHardwareAcceleration()
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_PORTED_FIXTURE = '1'
process.env.REVIEW_NATIVE_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-21 12:00:00.000'
const mode = process.env.ESCAPE_THEME || 'light'
const recording = process.env.RECORD_ESCAPE === '1'
const evidence = path.resolve(__dirname, '../openspec/changes/cancel-comment-on-escape/evidence')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let recorder, win, releaseWrite, holdWrite = false
ipcMain.handle('fixture:saveDraft', async () => {
  if (holdWrite) { holdWrite = false; await new Promise(resolve => { releaseWrite = resolve }) }
})
const timeout = setTimeout(() => { console.error('Escape UI checks timed out'); app.exit(2) }, 120000)

app.whenReady().then(async () => {
  nativeTheme.themeSource = mode
  win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 960, frame: false, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(expression, label = expression) {
    for (let i = 0; i < 200; i++) { if (await run(`(async () => (${expression}))()`)) return; await delay(50) }
    throw new Error('Timed out: ' + label)
  }
  async function press(keyCode, modifiers = []) {
    if (recording) execFileSync('xdotool', ['key', '--clearmodifiers', [...modifiers.map(m => m === 'control' ? 'ctrl' : m), keyCode].join('+')])
    else {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    }
    await delay(80)
  }
  async function click(expression) {
    await until(`(() => { const el = (${expression}); if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.y > 0 && r.y + r.height < 960 })()`, 'click target becomes visible: ' + expression)
    const rect = await run(`(${expression}).getBoundingClientRect().toJSON()`)
    const x = Math.round(rect.x + rect.width / 2), y = Math.round(rect.y + rect.height / 2)
    assert.ok(rect.width && rect.height && y > 0 && y < 960, 'click target is visible')
    if (recording) {
      const location = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' })
      const sx = Number(location.match(/^X=(\d+)/m)[1]), sy = Number(location.match(/^Y=(\d+)/m)[1])
      for (let step = 1; step <= 20; step++) {
        execFileSync('xdotool', ['mousemove', String(Math.round(sx + (x - sx) * step / 20)), String(Math.round(sy + (y - sy) * step / 20))])
        await delay(40)
      }
      await delay(2000)
      execFileSync('xdotool', ['click', '1'])
    } else {
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
    }
    await delay(100)
  }
  const button = (text, scope = '.local-review') => click(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b => b.textContent === ${JSON.stringify(text)})`)
  const stats = () => run('api.fixtureStats()')
  async function type(text, field = '[aria-label="Draft comment"]') {
    await until(`document.querySelector('${field}')?.getBoundingClientRect().height > 0`)
    await click(`document.querySelector('${field}')`)
    if (recording) execFileSync('xdotool', ['type', '--clearmodifiers', '--delay', '45', text])
    else await win.webContents.insertText(text)
  }
  const saved = () => until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit' && !document.querySelector('.review-comment-compose button').disabled`, 'draft autosaved')
  const cancelled = () => until(`!document.querySelector('.review-comment-compose') && document.querySelector('.local-review')?.open`, 'comment cancelled while review remains open')
  async function caption(text) {
    await run(`(() => { let c = document.getElementById('escape-caption'); if (!c) { c = document.createElement('div'); c.id = 'escape-caption'; c.style.cssText = 'position:fixed;bottom:18px;left:220px;right:20px;padding:16px 22px;background:#111827;color:#fff;border:1px solid #64748b;border-radius:10px;font:20px/1.5 sans-serif;z-index:2147483647;pointer-events:none'; document.querySelector('.local-review').append(c) }; c.textContent = ${JSON.stringify(text)} })()`)
  }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`)
  await click(`document.querySelector('.review-main')`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('[data-review-thread-id="published-1"]'))`)
  win.focus(); win.webContents.focus()
  const originalView = await run(`({ path: document.querySelector('[data-review-path][aria-current="true"]').dataset.reviewPath, patchSet: document.querySelector('[aria-label="Compared patch set"]').value })`)
  const replyScope = '[data-review-thread-id="published-1"]'
  if (recording) {
    fs.mkdirSync(evidence, { recursive: true })
    recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x960', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(evidence, `comment-escape-${mode}.mp4`)], { stdio: ['pipe', 'ignore', 'pipe'] })
    let encoderErrors = ''; recorder.stderr.on('data', data => { encoderErrors += data })
    await caption('Linux Electron with simulated Gerrit data. Click Reply to write a comment.')
    await delay(1800)
    await button('Reply', replyScope)
    await caption('Write a reply. The draft saves automatically.')
    await type('Cancel this reply with Escape.')
    await saved()
    assert.equal((await stats()).drafts.length, 1)
    await caption('Saved to Gerrit. Press Escape to cancel this comment.')
    await delay(2500)
    await press('Escape')
    await cancelled()
    assert.equal((await stats()).drafts.length, 0)
    assert.ok(await run(`Boolean(document.querySelector('[data-review-comment-id="published-1"]'))`))
    assert.deepEqual(await run(`({ path: document.querySelector('[data-review-path][aria-current="true"]').dataset.reviewPath, patchSet: document.querySelector('[aria-label="Compared patch set"]').value })`), originalView)
    await caption('Comment cancelled. Draft removed. The review stays open on the same file and patch set.')
    await delay(4500)
    recorder.stdin.write('q')
    const code = await new Promise(resolve => recorder.once('exit', resolve)); recorder = null
    assert.equal(code, 0, encoderErrors)
    fs.writeFileSync(path.join(evidence, `capture-${mode}.json`), JSON.stringify({ platform: 'Linux Electron', gerrit: 'simulated', originalView, draftsAfterEscape: 0, reviewOpen: true }, null, 2) + '\n')
  } else {
    // Empty inline composer and unsaved text both cancel without a server draft.
    await press('Home', ['control']); await press('c')
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
    await press('Escape'); await cancelled()
    assert.equal((await stats()).drafts.length, 0)

    await button('Reply', replyScope); await type('Unsaved reply')
    await press('Escape'); await cancelled(); await delay(800)
    assert.equal((await stats()).drafts.length, 0, 'no delayed autosave after cancellation')

    // A held autosave must consume Escape without dismissing either editor.
    await button('Reply', replyScope); holdWrite = true
    await type('Autosaved reply to cancel')
    await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saving…'`)
    assert.equal(typeof releaseWrite, 'function')
    await press('Escape')
    assert.ok(await run(`document.querySelector('.local-review').open && Boolean(document.querySelector('.review-comment-compose'))`))
    releaseWrite(); releaseWrite = null
    await saved(); assert.equal((await stats()).drafts.length, 1)
    await press('Escape'); await cancelled()
    assert.equal((await stats()).drafts.length, 0, 'Escape deletes autosaved new reply')

    // File comments use a nested fallback dialog and the same form.
    await click(`document.querySelector('.review-comments summary')`)
    await button('File comment', '.review-comments')
    await type('Cancel this file comment'); await saved()
    await press('Escape'); await cancelled()
    assert.equal((await stats()).drafts.length, 0)

    // Create a selected-range draft with a suggestion, then restore its saved state.
    await click(`document.querySelector('.modified-in-monaco-diff-editor .view-line')`)
    await press('Home', ['control']); await press('End', ['shift']); await press('c')
    await type('Keep the original draft')
    await button('Suggest replacement for selected range', '.review-comment-compose')
    await type('// Original replacement', '[aria-label="Suggested replacement"]')
    await saved(); await press('Enter', ['control'])
    await until(`!document.querySelector('.review-comment-compose')`)
    const originalDraft = (await stats()).drafts[0]
    assert.ok(originalDraft.fix_suggestions?.length)
    await button('Edit', '.comment-draft'); await type(' edited')
    await click(`document.querySelector('.review-comment-compose input[type="checkbox"]')`)
    await type(' changed', '[aria-label="Suggested replacement"]')
    await saved()
    await press('Escape'); await cancelled()
    const restored = (await stats()).drafts[0]
    for (const key of ['id', 'patch_set', 'path', 'side', 'line', 'range', 'message', 'unresolved', 'fix_suggestions']) assert.deepEqual(restored[key], originalDraft[key], key + ' restored')

    // A failed restore keeps the composer open. Escape can retry the Cancel action.
    await button('Edit', '.comment-draft'); await type(' second edit'); await saved()
    await run('api.fixtureFailDraft()'); await press('Escape')
    await until(`document.querySelector('.review-comment-notice [role="alert"]')?.textContent.includes('Fixture draft save failed')`)
    assert.ok(await run(`document.querySelector('.local-review').open && Boolean(document.querySelector('.review-comment-compose'))`))
    await press('Escape'); await cancelled()
    assert.equal((await stats()).drafts[0].message, originalDraft.message)
    await button('Discard draft', '.comment-draft')
    await until(`(await api.fixtureStats()).drafts.length === 0`)

    // Ctrl+S still saves; Escape outside composition still closes the review.
    await button('Reply', replyScope); await type('Save shortcut remains active'); await saved(); await press('s', ['control'])
    await until(`!document.querySelector('.review-comment-compose')`)
    assert.equal((await stats()).drafts[0].message, 'Save shortcut remains active')
    assert.deepEqual(await run(`({ path: document.querySelector('[data-review-path][aria-current="true"]').dataset.reviewPath, patchSet: document.querySelector('[aria-label="Compared patch set"]').value })`), originalView)
    await click(`document.querySelector('.local-review-header h2')`); await press('Escape')
    await until(`!document.querySelector('.local-review') && Boolean(document.querySelector('.review-main'))`)
  }
  console.log(JSON.stringify({ theme: mode, recording, escapeCancellation: 'passed', reviewPreserved: 'passed', draftLifecycle: 'passed' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(async error => {
  console.error(error)
  if (win && !win.isDestroyed()) { fs.mkdirSync(evidence, { recursive: true }); fs.writeFileSync(path.join(evidence, `failure-${mode}.png`), (await win.webContents.capturePage()).toPNG()) }
  if (recorder) { recorder.stdin.write('q'); await new Promise(resolve => recorder.once('exit', resolve)) }
  app.exit(1)
})
