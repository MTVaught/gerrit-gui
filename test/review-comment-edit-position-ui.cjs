// Build first. Run with xvfb-run -a -s '-screen 0 1440x1060x24'.
// CAPTURE_COMMENT_EDIT=1 records paired videos with real X11 input.
const { app, BrowserWindow, nativeTheme } = require('electron')
const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const { controls } = require('./review-comment-field-checks.cjs')
process.env.REVIEW_EDIT_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-11-02 12:00:00.000'
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'comment-edit-position-'))
app.setPath('userData', data)
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const capture = process.env.CAPTURE_COMMENT_EDIT === '1'
const evidence = path.resolve(process.env.COMMENT_EDIT_EVIDENCE || 'openspec/changes/archive/2026-11-02-fix-comment-edit-scroll/evidence')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const input = (...args) => execFileSync('xdotool', args.map(String), { encoding: 'utf8' })
const timeout = setTimeout(() => app.exit(2), capture ? 300000 : 180000)
let recorder
app.whenReady().then(async () => {
  const results = []
  fs.mkdirSync(evidence, { recursive: true })
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 1000, frame: false, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
    win.webContents.on('console-message', details => { if (details.level === 'error') console.error('Renderer:', details.message) })
    const { run: evaluate, until, press, button, panes } = controls(win)
    const run = script => evaluate(script).catch(error => { console.error('Failed inspection:', script); throw error })
    // Lines below a comment move when its editor grows. The content transform
    // measures each pane's scroll origin independently of that height change.
    const scrollOrigins = () => run(`[...document.querySelectorAll('.monaco-editor .lines-content')].map(e => ({ transform: e.style.transform, top: e.style.top, left: e.style.left }))`)
    const caption = capture ? new BrowserWindow({ x: 0, y: 1000, width: 1440, height: 60, frame: false, focusable: false, backgroundColor: '#171b22', webPreferences: { sandbox: true } }) : null
    if (caption) await caption.loadURL('data:text/html,' + encodeURIComponent('<body style="margin:0;padding:16px 24px;color:white;background:#171b22;font:18px system-ui"><div id="caption"></div></body>'))
    const say = async text => { if (caption) await caption.webContents.executeJavaScript(`document.querySelector('#caption').textContent = ${JSON.stringify(text)}`) }
    async function click(expression, slow = false) {
      const box = await run(`(${expression}).getBoundingClientRect().toJSON()`)
      const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2)
      assert.ok(x > 0 && x < 1440 && y > 100 && y < 1000, 'click target is visible: ' + expression)
      if (capture && slow) {
        const from = input('getmouselocation', '--shell')
        const sx = Number(from.match(/^X=(\d+)/m)[1]), sy = Number(from.match(/^Y=(\d+)/m)[1])
        for (let i = 1; i <= 20; i++) { input('mousemove', Math.round(sx + (x - sx) * i / 20), Math.round(sy + (y - sy) * i / 20)); await delay(40) }
        await delay(2000)
      } else input('mousemove', x, y)
      input('click', 1)
      await delay(80)
    }
    const clickButton = (label, scope, slow) => click(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b => b.textContent === ${JSON.stringify(label)})`, slow)
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
    await until(`Boolean(document.querySelector('.review-main'))`)
    await click(`document.querySelector('.review-main')`)
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('[data-review-comment-id="edit-single"]'))`)
    win.focus(); win.webContents.focus()
    for (const layout of ['split', 'unified']) {
      if (layout === 'unified') { await button('Go to line'); await press('Escape'); await press('m'); await delay(500) }
      assert.equal(await run(`Boolean(document.querySelector('.review-side-head.unified'))`), layout === 'unified', 'requested diff layout is active')
      for (const [id, line, pane] of [['edit-single', 40, 'modified'], ['edit-original', 60, 'original'], ['edit-reply', 80, 'modified']]) {
        console.log('Checking', theme, layout, id)
        await button('Go to line'); await press('a', ['control']); await win.webContents.insertText(':' + line); await press('Enter'); await delay(500)
        if (layout === 'split' && pane === 'original') { await press('Left', ['shift']); await button('Go to line'); await press('a', ['control']); await win.webContents.insertText(':' + line); await press('Enter'); await delay(500) }
        const article = `[data-review-comment-id="${id}"]`
        const top = () => run(`document.querySelector(${JSON.stringify(article)}).getBoundingClientRect().top`)
        // Scroll with native wheel input until the draft is in the middle of
        // the viewport. For the reply, the tall root then sits above it.
        for (let i = 0; i < 35; i++) {
          const y = await top()
          if (y > 300 && y < 600) break
          const code = layout === 'unified' ? 'modified' : pane
          const box = await run(`document.querySelector('.${code}-in-monaco-diff-editor').getBoundingClientRect().toJSON()`)
          input('mousemove', Math.round(box.x + 80), 250)
          input('click', y > 600 ? 5 : 4)
          await delay(120)
        }
        const beforeTop = await top()
        assert.ok(beforeTop > 300 && beforeTop < 600, 'draft placed away from the top: ' + beforeTop)
        const beforePanes = await panes()
        const beforeScroll = await scrollOrigins()
        const beforeDraft = (await run('api.fixtureStats()')).drafts.find(d => d.id === id)
        const beforeRequests = (await run('api.fixtureStats()')).requests
        if (id === 'edit-reply') {
          const thread = await run(`(() => { const root = document.querySelector('[data-review-thread-id="edit-parent"]'); return { top: root.getBoundingClientRect().top, height: root.getBoundingClientRect().height, editorTop: document.querySelector('.review-editor').getBoundingClientRect().top } })()`)
          console.log('Tall thread:', JSON.stringify(thread))
          assert.ok(thread.top < thread.editorTop, 'tall thread anchor is offscreen')
        }
        const record = capture && layout === 'split' && id === 'edit-single'
        if (record) {
          await say('Linux Electron, simulated Gerrit data. Edit this draft without moving the comment or code.')
          input('mousemove', 40, 150)
          recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x1060', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(evidence, `comment-edit-${theme}.mp4`)], { stdio: ['pipe', 'ignore', fs.openSync(path.join(data, `ffmpeg-${theme}.log`), 'w')] })
          await delay(1000)
        }
        await clickButton('Edit', article, record)
        await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
        await delay(900)
        const afterTop = await run(`document.querySelector('.review-comment-compose').closest('article, section')?.getBoundingClientRect().top ?? document.querySelector('.review-comment-compose').getBoundingClientRect().top`)
        const afterPanes = await panes()
        const afterScroll = await scrollOrigins()
        results.push({ theme, layout, id, beforeTop, afterTop, beforePanes, afterPanes, beforeScroll, afterScroll })
        console.log(JSON.stringify(results.at(-1)))
        assert.ok(Math.abs(afterTop - beforeTop) < 2, 'Edit preserves comment position')
        assert.deepEqual(afterScroll, beforeScroll, 'Edit preserves both code pane scroll origins')
        if (id !== 'edit-reply') assert.deepEqual(afterPanes, beforePanes, 'code above the comment stays fixed')
        assert.equal(await run(`document.querySelector('[aria-label="Draft comment"]').value`), beforeDraft.message)
        if (record) { await say('The draft stays in place and has focus. Press Ctrl+End to append text, then click Save.'); await delay(2000) }
        input('key', '--clearmodifiers', 'ctrl+End')
        input('type', '--clearmodifiers', '--delay', record ? 65 : 0, ' Add a regression test.')
        await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit' && !document.querySelector('.review-comment-compose .primary').disabled`)
        await clickButton('Save', '.review-comment-compose', record)
        await until(`!document.querySelector('.review-comment-compose')`)
        await delay(200)
        assert.ok(Math.abs((await top()) - beforeTop) < 2, 'Save preserves comment position')
        assert.deepEqual(await scrollOrigins(), beforeScroll, 'Save preserves scroll position')
        const afterDraft = (await run('api.fixtureStats()')).drafts.find(d => d.id === id)
        assert.equal(afterDraft.message, beforeDraft.message + ' Add a regression test.')
        for (const key of ['id', 'patch_set', 'path', 'line', 'side', 'in_reply_to', 'range']) assert.deepEqual(afterDraft[key], beforeDraft[key], 'Save retains ' + key)
        assert.equal((await run('api.fixtureStats()')).requests, beforeRequests, 'Edit does not refetch source')
        if (record) {
          await say('Saved on the same draft and code line. The review stays at the same position.')
          await delay(2500)
          const stopped = new Promise((resolve, reject) => { recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('FFmpeg exited ' + code))); recorder.once('error', reject) })
          recorder.stdin.write('q'); await stopped; recorder = null
        }
        // A second edit checks Cancel restores the saved draft too.
        await clickButton('Edit', article)
        await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
        input('key', '--clearmodifiers', 'ctrl+End'); input('type', '--clearmodifiers', '--delay', 0, ' Cancel this.')
        await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit' && !document.querySelector('.review-comment-compose .primary').disabled`)
        await clickButton('Cancel', '.review-comment-compose')
        await until(`!document.querySelector('.review-comment-compose')`)
        assert.equal((await run('api.fixtureStats()')).drafts.find(d => d.id === id).message, afterDraft.message)
      }
    }
    win.destroy(); caption?.destroy()
  }
  fs.writeFileSync(path.join(evidence, 'edit-position-results.json'), JSON.stringify(results, null, 2) + '\n')
  console.log('Edit position, focus, Save, and Cancel passed for 12 theme/layout/draft cases.')
  clearTimeout(timeout); app.quit()
}).catch(error => { console.error(error); if (recorder) recorder.kill('SIGINT'); app.exit(1) })
