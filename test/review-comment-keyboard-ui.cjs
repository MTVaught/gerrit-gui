// Build first. Run under Xvfb; CAPTURE_COMMENT_KEYS=1 also records both themes.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_PORTED_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-21 12:00:00.000'
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-keys-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()
const capture = process.env.CAPTURE_COMMENT_KEYS === '1'
const evidence = path.resolve(__dirname, '../openspec/changes/comment-editor-enter-shortcuts/evidence')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), capture ? 240000 : 90000)
let recorder
app.on('window-all-closed', () => {})
app.whenReady().then(async () => {
  if (capture) fs.mkdirSync(evidence, { recursive: true })
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 1000, frame: false, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
    const run = script => win.webContents.executeJavaScript(script)
    async function until(script) { for (let i = 0; i < 200; i++) { if (await run(script)) return; await delay(50) } throw new Error('Timed out: ' + script) }
    async function caption(text) {
      if (!capture) return
      await run(`(() => { let el = document.getElementById('evidence-caption'); if (!el) { el = document.createElement('div'); el.id = 'evidence-caption'; el.style.cssText = 'position:fixed;bottom:12px;left:20px;right:20px;z-index:2147483647;background:#12243b;color:white;padding:16px;font:20px sans-serif;border:1px solid #8ea6c1;border-radius:8px;pointer-events:none'; document.querySelector('.local-review').append(el) }; el.textContent = ${JSON.stringify(text)} })()`)
      await delay(1600)
    }
    async function click(expression) {
      const box = await run(`(${expression}).getBoundingClientRect().toJSON()`)
      const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2)
      assert.ok(x > 0 && x < 1440 && y > 0 && y < 1000, 'click target is visible')
      if (capture) {
        const start = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' })
        const sx = Number(start.match(/^X=(\d+)/m)?.[1] ?? 0), sy = Number(start.match(/^Y=(\d+)/m)?.[1] ?? 0)
        for (let i = 1; i <= 15; i++) { execFileSync('xdotool', ['mousemove', String(Math.round(sx + (x - sx) * i / 15)), String(Math.round(sy + (y - sy) * i / 15))]); await delay(40) }
        await delay(2000)
      } else execFileSync('xdotool', ['mousemove', String(x), String(y)])
      execFileSync('xdotool', ['click', '1'])
      await delay(150)
    }
    const button = (label, scope = '.local-review') => click(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b => b.textContent === ${JSON.stringify(label)})`)
    async function key(key) { execFileSync('xdotool', ['key', '--clearmodifiers', key]); await delay(80) }
    async function pressMetaEnter() {
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter', modifiers: ['meta'] })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter', modifiers: ['meta'] })
      await delay(100)
    }
    const value = () => run(`document.querySelector('[aria-label="Draft comment"]')?.value`)
    const settled = () => until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit' && !document.querySelector('.review-comment-compose .primary').disabled`)
    const closed = () => until(`!document.querySelector('.review-comment-compose')`)
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await until(`Boolean(document.querySelector('.review-main'))`)
    win.focus(); win.webContents.focus()
    await click(`document.querySelector('.review-main')`)
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('[data-review-thread-id="published-1"]'))`)
    if (capture) {
      const video = path.join(evidence, `comment-keys-${theme}.mp4`)
      recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x1000', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', video], { stdio: ['pipe', 'ignore', fs.openSync(path.join(userData, `ffmpeg-${theme}.log`), 'w')] })
      await delay(700)
    }
    await caption('Linux Electron with simulated Gerrit data. Open a draft reply.')
    await button('Reply', '[data-review-thread-id="published-1"]')
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
    await click(`document.querySelector('[aria-label="Draft comment"]')`)
    await win.webContents.insertText('Keep the delivery order.')
    await caption('Press Enter to add a new line. The comment stays open.')
    await key('Return')
    assert.equal(await value(), 'Keep the delivery order.\n', `${theme}: Enter inserts a newline inline`)
    assert.equal(await run(`document.activeElement?.getAttribute('aria-label')`), 'Draft comment')
    await win.webContents.insertText('Add a timeout test.')
    await settled()
    await caption('Autosave keeps both lines and leaves the editor open. Press Ctrl+Enter to save and close.')
    await key('ctrl+Return'); await closed()
    let stats = await run('api.fixtureStats()')
    assert.equal(stats.drafts[0].message, 'Keep the delivery order.\nAdd a timeout test.')
    assert.equal(stats.drafts[0].in_reply_to, 'published-1')
    const id = stats.drafts[0].id
    await caption('The reply is saved as a private draft. Open Edit to add another line.')
    await button('Edit', `[data-review-comment-id="${id}"]`)
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
    await click(`document.querySelector('[aria-label="Draft comment"]')`)
    await key('ctrl+End')
    await caption('Press Shift+Enter to add a line while editing the saved draft.')
    await key('shift+Return')
    await win.webContents.insertText('Check the retry limit too.')
    assert.equal(await value(), 'Keep the delivery order.\nAdd a timeout test.\nCheck the retry limit too.')
    await settled()
    await caption('Press Ctrl+Enter to save the edited draft and close the editor.')
    await key('ctrl+Return'); await closed()
    stats = await run('api.fixtureStats()')
    assert.equal(stats.drafts.length, 1)
    assert.equal(stats.drafts[0].id, id)
    assert.equal(stats.drafts[0].message, 'Keep the delivery order.\nAdd a timeout test.\nCheck the retry limit too.')
    assert.equal(stats.requests, 1, 'keyboard actions preserve the file and comparison')
    await caption('Saved. All three lines remain in the same private draft.')
    if (capture) {
      await delay(2000)
      const stopped = new Promise(resolve => recorder.once('exit', resolve))
      recorder.stdin.write('q'); await stopped; recorder = null
      fs.writeFileSync(path.join(evidence, `saved-draft-${theme}.json`), JSON.stringify(stats.drafts[0], null, 2) + '\n')
    }
    // New comment from code focus and Meta+Enter use the same actual event path.
    await key('c')
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
    await key('ctrl+Return')
    assert.equal(await value(), '', 'empty shortcut does not close or save')
    await win.webContents.insertText('New comment')
    await key('Return'); await win.webContents.insertText('Second line')
    await settled()
    const writes = (await run('api.fixtureStats()')).commentWrites.length
    // Simulated composition flag; actual key input above covers the normal path.
    await run(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, isComposing: true, bubbles: true }))`)
    await delay(180)
    assert.ok(await value(), 'composition does not close the editor')
    assert.equal((await run('api.fixtureStats()')).commentWrites.length, writes, 'composition does not explicitly save')
    await run('api.fixtureFailDraft()')
    await key('ctrl+Return')
    await until(`document.querySelector('[role="alert"]')?.textContent.includes('Fixture draft save failed')`)
    assert.equal(await value(), 'New comment\nSecond line', 'failed save retains input')
    await pressMetaEnter(); await closed()
    stats = await run('api.fixtureStats()')
    assert.equal(stats.drafts.length, 2)
    assert.equal(stats.drafts[1].message, 'New comment\nSecond line')
    // Overall comment opened for editing from the overview uses the fallback form.
    await run(`api.saveReviewDraft('telemetry~main~Idemo', 3, { path: '/PATCHSET_LEVEL', side: 'REVISION', message: 'Overall draft' })`)
    await click(`document.querySelector('.review-comments summary')`)
    await button('Refresh comments', '.review-comments')
    await click(`document.querySelector('.review-comments summary')`)
    await click(`Array.from(document.querySelectorAll('.review-comments button')).find(b => b.textContent.startsWith('All comments'))`)
    await until(`Boolean(document.querySelector('dialog[open] [data-review-comment-id="draft-3"]'))`)
    await button('Edit', 'dialog[open] [data-review-comment-id="draft-3"]')
    await until(`Boolean(document.querySelector('.review-send-dialog .review-comment-compose'))`)
    await click(`document.querySelector('[aria-label="Draft comment"]')`)
    await key('ctrl+End'); await key('Return'); await win.webContents.insertText('Fallback second line')
    assert.equal(await value(), 'Overall draft\nFallback second line')
    await settled(); await key('ctrl+Return'); await closed()
    console.log(`${theme}: reply, existing draft, new comment, fallback, Enter, Shift+Enter, Ctrl+Enter, Meta+Enter, autosave, empty input, failure, and composition checks passed`)
    win.destroy()
  }
  clearTimeout(timeout); app.quit()
}).catch(error => { recorder?.kill('SIGINT'); console.error(error); app.exit(1) })
