// Start Vite with vite.web.config.ts first. Real renderer and input actions,
// simulated Gerrit data. Run with xvfb-run -a electron --no-sandbox on Linux.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-merge-conflict-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1560, height: 1360, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message) })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script) {
    for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(50) }
    throw new Error('Timed out: ' + script)
  }
  async function click(selector) {
    const point = await run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...point })
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...point })
    await delay(100)
  }
  const fixture = `http://localhost:5173/@fs${path.join(__dirname, 'fixtures/count-summary.html')}?variant=conflict#tab=mine`
  await win.loadURL(fixture)
  await until(`document.querySelectorAll('.conflict-mark').length === 4`)
  const row = id => `[data-change-number="${id}"]`
  async function checkIndicators(theme) {
    for (const id of [102, 106, 109, 112]) {
      assert.equal(await run(`document.querySelector('${row(id)} .conflict-mark').title`), '')
      assert.equal(await run(`document.querySelector('${row(id)} .conflict-mark').getAttribute('aria-label')`), 'Merge conflict with main')
    }
    for (const id of [101, 103, 104, 105, 107, 108, 110, 111]) {
      assert.equal(await run(`document.querySelectorAll('${row(id)} .conflict-mark').length`), 0, `no conflict on ${id}`)
    }
    for (const [id, vote] of [[102, 'pos'], [106, 'neg']]) {
      assert.deepEqual(await run(`Array.from(document.querySelector('${row(id)} .patch-set-indicators').children).map(e => e.className)`), ['conflict-mark', `ci-mark ${vote}`])
      assert.equal(await run(`(() => { const warning = document.querySelector('${row(id)} .conflict-mark').getBoundingClientRect(); const ci = document.querySelector('${row(id)} .ci-mark').getBoundingClientRect(); return warning.right <= ci.left && Math.abs((warning.y + warning.height / 2) - (ci.y + ci.height / 2)) < 2 })()`), true)
    }
    assert.equal(await run(`document.querySelectorAll('${row(109)} .ci-mark').length`), 0, 'conflict without a CI vote')
    assert.equal(await run(`getComputedStyle(document.querySelector('.conflict-mark')).color`), theme === 'light' ? 'rgb(161, 98, 7)' : 'rgb(250, 204, 21)')
    assert.equal(await run(`getComputedStyle(document.querySelector('${row(102)} .ci-mark')).color`), theme === 'light' ? 'rgb(21, 128, 61)' : 'rgb(74, 222, 128)')
    assert.equal(await run(`getComputedStyle(document.querySelector('${row(106)} .ci-mark')).color`), theme === 'light' ? 'rgb(185, 28, 28)' : 'rgb(248, 113, 113)')
    assert.equal(await run(`Array.from(document.querySelectorAll('.badge')).some(e => /Merge Conflict/i.test(e.textContent))`), false)
  }
  const presentation = `(() => ({counts: document.querySelector('.tabs:not(.ghost) .tab.active .count').textContent,
    rows: Array.from(document.querySelectorAll('[data-change-number]')).map(row => ({id:row.dataset.changeNumber,
      state: row.className, badge: row.querySelector('.c-state')?.textContent,
      height:(row.matches('tr') ? row : row.querySelector('.c-num')).getBoundingClientRect().height,
      actions: Array.from(row.querySelectorAll('button')).map(b => [b.textContent,b.disabled])}))}))()`
  async function refreshChecks() {
    const before = await run(presentation)
    const stamp = await run(`(() => { const c = countSummaryFixture.changes.find(c => c._number === 102); return [c.updated,c.current_revision] })()`)
    // Simulate branch changes on the server; use actual Refresh clicks to read them.
    await run(`countSummaryFixture.changes.find(c => c._number === 102).mergeable = true`)
    await click('[aria-label="Refresh"]')
    await until(`!document.querySelector('${row(102)} .conflict-mark')`)
    assert.deepEqual(await run(presentation), before, 'conflict removal preserves counts, state, actions, and row height')
    await run(`countSummaryFixture.changes.find(c => c._number === 102).mergeable = false`)
    await click('[aria-label="Refresh"]')
    await until(`Boolean(document.querySelector('${row(102)} .conflict-mark'))`)
    await run(`delete countSummaryFixture.changes.find(c => c._number === 102).mergeable`)
    await click('[aria-label="Refresh"]')
    await until(`!document.querySelector('${row(102)} .conflict-mark')`)
    assert.deepEqual(await run(presentation), before, 'unknown lookup results remove warnings without changing workflow')
    assert.deepEqual(await run(`(() => { const c = countSummaryFixture.changes.find(c => c._number === 102); return [c.updated,c.current_revision] })()`), stamp)
    await run(`countSummaryFixture.changes.find(c => c._number === 102).mergeable = false`)
    await click('[aria-label="Refresh"]')
    await until(`document.querySelectorAll('.conflict-mark').length === 4`)
  }
  const evidence = path.join(__dirname, '../docs/screenshots/merge-conflicts')
  fs.mkdirSync(evidence, { recursive: true })
  for (const layout of ['standard', 'compact']) {
    if (layout === 'compact') {
      await click('[aria-label="Compact window"]')
      win.setContentSize(960, 1240)
      await until(`Boolean(document.querySelector('.ledger'))`)
    }
    await refreshChecks()
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme
      await until(`document.documentElement.dataset.theme === '${theme}'`)
      await checkIndicators(theme)
      await run(`window.scrollTo(0, 0)`)
      await delay(100)
      fs.writeFileSync(path.join(evidence, `merge-conflict-implemented-${layout}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
    }
  }
  assert.deepEqual(errors, [])
  console.log('Merge conflict renderer checks passed: icon order, themes, all CI votes, per-member scope, unchanged heights/actions/counts, and refresh replacement.')
  clearTimeout(timeout)
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
