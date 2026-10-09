// Native My Changes screenshots and owned-review interactions. Build first.
const { app, BrowserWindow, nativeTheme } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
process.env.REVIEW_OWNED_FIXTURE = '1'
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-owned-review-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script) { for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) } throw new Error('Timed out: ' + script) }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'tab=mine' })
  await until(`Boolean(document.querySelector('.subject'))`)
  const phase = process.env.OWNED_REVIEW_BEFORE ? 'before' : 'after'
  assert.equal(await run(`Boolean(document.querySelector('.review-main'))`), phase === 'after')
  const dir = path.join(__dirname, '../docs/screenshots/local-review')
  fs.mkdirSync(dir, { recursive: true })
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await until(`matchMedia('(prefers-color-scheme: dark)').matches === ${theme === 'dark'}`)
    await delay(300)
    fs.writeFileSync(path.join(dir, 'owned-review-' + phase + '-' + theme + '.png'), (await win.webContents.capturePage()).toPNG())
  }
  if (phase === 'before') { clearTimeout(timeout); win.destroy(); app.quit(); return }
  await run(`document.querySelector('button.subject').click()`)
  assert.deepEqual((await run('api.fixtureStats()')).openedChanges, [{ id: 2481, project: 'telemetry' }], 'title opens the Gerrit change page')
  await run(`document.querySelector('.review-main').click()`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
  const comparison = (await run('api.fixtureStats()')).comparisons[0].link
  assert.equal(comparison.patchSet, 3)
  assert.equal(comparison.basePatchSet, undefined, 'owned reviews default to base against latest patch set')
  await run(`Array.from(document.querySelectorAll('.local-review button')).find(b => b.textContent === 'Close review').click()`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`Array.from(document.querySelectorAll('.section-nav button')).find(b => b.textContent === 'Beta').click()`)
  await delay(100)
  await run(`document.querySelector('.section-body input[type="checkbox"]').click()`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`document.querySelector('.review-main').click()`)
  assert.deepEqual((await run('api.fixtureStats()')).openedChanges.at(-1), { id: 2481, project: 'telemetry', patchSet: 3 }, 'beta disabled opens Gerrit diff')
  assert.ok(await run(`!document.querySelector('.local-review[open]')`))
  console.log(JSON.stringify({ ownedReview: 'passed', latestAgainstBase: 'passed', titleOpensGerrit: 'passed', optOut: 'passed' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
