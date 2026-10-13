// Build first. Keep the selected code line fixed while inline comments resize.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
process.env.REVIEW_COMMENTS_FIXTURE = '1'
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-comment-scroll-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light'
  const win = new BrowserWindow({ width: 1440, height: 960, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script) { for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) } throw new Error('Timed out: ' + script) }
  async function press(keyCode, modifiers = []) { win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await delay(80) }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`Array.from(document.querySelectorAll('.section-nav button')).find(b => b.textContent === 'Beta').click()`)
  await delay(100)
  await run(`document.querySelector('.section-body input[type="checkbox"]').click()`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`document.querySelector('.review-main').click()`)
  await until(`Boolean(document.querySelector('.review-editor .review-comment-thread'))`)
  win.focus(); win.webContents.focus()
  async function goToLine() {
    await run(`Array.from(document.querySelectorAll('.local-review button')).find(b => b.textContent === 'Go to line').click()`)
    await until(`Boolean(document.querySelector('.quick-input-widget input'))`)
    await press('a', ['control']); await win.webContents.insertText(':40'); await press('Enter'); await delay(200)
  }
  for (const mode of ['modified', 'original', 'unified']) {
    await goToLine()
    if (mode === 'original') { await press('Left', ['shift']); await goToLine() }
    if (mode === 'unified') { await press('Right', ['shift']); await press('m'); await goToLine() }
    const pane = mode === 'original' ? 'original' : 'modified'
    // Move the selection away from the center so a recentering jump is visible.
    for (let i = 0; i < 2; i++) await press('Down')
    const top = () => run(`Array.from(document.querySelectorAll('.${pane}-in-monaco-diff-editor .line-numbers')).find(e => e.textContent === '42')?.getBoundingClientRect().top`)
    const before = await top()
    assert.ok(before > 120 && before < 900, 'selected line is visible before toggling')
    await press('h'); await until(`!document.querySelector('.review-editor .review-comment-thread')`); await delay(250)
    assert.ok(Math.abs((await top()) - before) < 2, `${mode}: hiding comments preserves selected line position`)
    await run(`document.querySelector('.review-comments summary').click()`)
    await run(`Array.from(document.querySelectorAll('.review-comments button')).find(b => b.textContent === 'Show comments').click()`)
    await until(`Boolean(document.querySelector('.review-editor .review-comment-thread'))`); await delay(350)
    assert.ok(Math.abs((await top()) - before) < 2, `${mode}: showing comments preserves selected line position`)
    await press('c')
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`); await delay(350)
    assert.ok(Math.abs((await top()) - before) < 2, `${mode}: opening a comment preserves selected line position`)
    assert.equal(await run(`document.querySelector('.review-comment-compose').closest('[role="region"]').getAttribute('aria-label')`), `${pane === 'original' ? 'Original' : 'Modified'} comments after line 42`)
    await win.webContents.insertText('A comment at the selected line.'); await delay(250)
    assert.ok(Math.abs((await top()) - before) < 2, `${mode}: typing preserves selected line position`)
    await press('Enter', ['control'])
    await until(`!document.querySelector('.review-comment-compose')`); await delay(350)
    assert.ok(Math.abs((await top()) - before) < 2, `${mode}: saving preserves selected line position`)
    await press('c')
    await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
    await run(`Array.from(document.querySelectorAll('.review-comment-compose button')).find(b => b.textContent === 'Cancel').click()`)
    await until(`!document.querySelector('.review-comment-compose')`); await delay(350)
    assert.ok(Math.abs((await top()) - before) < 2, `${mode}: cancelling preserves selected line position`)
    await run(`Array.from(document.querySelectorAll('.review-editor .comment-draft button')).find(b => b.textContent === 'Discard draft').click()`)
    await until(`!document.querySelector('.review-editor .comment-draft')`)
  }
  assert.equal((await run('api.fixtureStats()')).requests, 1, 'toggling comments does not refetch source')
  console.log(JSON.stringify({ selectedLineAnchoring: 'passed', originalPane: 'passed', unified: 'passed', keyboardAndMenu: 'passed', noExtraFetch: 'passed' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
