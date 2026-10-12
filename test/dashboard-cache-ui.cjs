// Build first. Exercises the actual renderer with independently controlled search and detail reads.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-dashboard-cache-')))
app.disableHardwareAcceleration()
app.on('window-all-closed', () => {})
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    const win = new BrowserWindow({ width: 1440, height: 960, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/dashboard-cache-preload.cjs') } })
    const errors = []
    win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
    const run = script => win.webContents.executeJavaScript(script).catch(error => { console.error(script, errors); throw error })
    async function until(script) {
      for (let i = 0; i < 100; i++) { if (await run(`(async () => (${script}))()`)) return; await delay(50) }
      throw new Error('Timed out: ' + script)
    }
    const section = `document.querySelector('.subject')?.closest('section')?.querySelector('h3')?.textContent`
    await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'tab=mine' })
    await until(`Boolean(document.querySelector('.subject'))`)
    assert.match(await run(section), /Iterating/)
    await run('api.fixtureHoldSearch()')
    await run(`document.querySelector('[aria-label="Refresh"]').click()`)
    await until('(await api.fixtureStats()).held')
    await run(`Array.from(document.querySelectorAll('.c-actions button')).find(b => b.textContent.includes('Re-request')).click()`)
    await until(`${section}?.includes('Pass Around')`)
    // Observe every committed render so a brief rollback also fails the test.
    await run(`window.cacheSections = []; window.cacheObserver = new MutationObserver(() => window.cacheSections.push(${section})); window.cacheObserver.observe(document.querySelector('.board'), { subtree: true, childList: true, characterData: true })`)
    await run('api.fixtureReleaseSearch()')
    await until('!(await api.fixtureStats()).held && (await api.fixtureStats()).details >= 2')
    await delay(100)
    const before = (await run('api.fixtureStats()')).searches
    await run(`document.querySelector('[aria-label="Refresh"]').click()`)
    await until(`(await api.fixtureStats()).searches > ${before} && (await api.fixtureStats()).details >= 3`)
    await delay(100)
    assert.match(await run(section), /Pass Around/)
    assert.ok((await run('window.cacheSections')).every(value => value?.includes('Pass Around')), 'no transient rollback')
    assert.equal((await run('api.fixtureStats()')).writes, 1, 'one click is enough')
    assert.ok(await run(`document.querySelector('[role="tab"].active').textContent.includes('1')`), 'tab count keeps the review')
    await run('api.fixtureCatchUp()')
    const details = (await run('api.fixtureStats()')).details
    await run(`document.querySelector('[aria-label="Refresh"]').click()`)
    await delay(100)
    assert.equal((await run('api.fixtureStats()')).details, details, 'matching search settles without another detail read')
    await run('window.cacheObserver.disconnect(); api.fixtureExternalVote()')
    await run(`document.querySelector('[aria-label="Refresh"]').click()`)
    await until(`${section}?.includes('Approved')`)
    assert.deepEqual(errors, [])
    console.log(`${theme}: re-request stays in Pass Around after delayed and stale searches; external vote reaches Approved`)
    win.destroy()
  }
  clearTimeout(timeout)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
