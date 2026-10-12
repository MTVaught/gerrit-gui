// Build first, then run with xvfb-run -a electron --no-sandbox.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
process.env.REVIEW_FILE_ACTIVITY_FIXTURE = '1'
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-file-activity-'))
app.setPath('userData', userData)
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 960, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script) {
    for (let i = 0; i < 150; i++) { if (await run(script)) return; await delay(100) }
    throw new Error('Timed out: ' + script)
  }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`)
  await run(`document.querySelector('.review-main').click()`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && document.querySelector('.review-file-drafts')`)
  const activity = await run(`document.querySelector('[data-review-path="src/telemetry/batch-scheduler.ts"]').closest('.review-file-row').textContent`)
  assert.ok(activity.includes('1 draft') && activity.includes('1 unresolved'), 'drafts and unresolved counts appear together')
  assert.ok(await run(`document.querySelector('[data-review-path="src/telemetry/types.ts"]').closest('.review-file-row').textContent.includes('Renamed')`))
  assert.ok(await run(`document.querySelector('[data-review-path="src/telemetry/types.ts"]').closest('.review-file-row').textContent.includes('1 resolved')`))
  assert.ok(await run(`document.querySelector('[data-review-path="src/telemetry/events.ts"]').closest('.review-file-row').textContent.includes('Added')`))
  assert.ok(await run(`!document.querySelector('[data-review-path="src/telemetry/events.ts"]').closest('.review-file-row').querySelector('.review-lines-removed')`), 'zero counts are hidden')
  const dir = path.join(__dirname, '../docs/screenshots/local-review')
  fs.mkdirSync(dir, { recursive: true })
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await until(`matchMedia('(prefers-color-scheme: dark)').matches === ${theme === 'dark'}`)
    await delay(350)
    assert.ok(await run(`Array.from(document.querySelectorAll('.review-file-row')).every(row => row.scrollWidth <= row.clientWidth)`), 'file rows fit the sidebar')
    fs.writeFileSync(path.join(dir, 'file-activity-' + theme + '.png'), (await win.webContents.capturePage()).toPNG())
  }
  console.log('File activity labels, concurrent draft/unresolved counts, zero counts, and layout passed')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) }).finally(() => fs.rmSync(userData, { recursive: true, force: true }))
