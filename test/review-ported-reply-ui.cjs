// Focused simulated-server companion to review-comments-ui.cjs. Build first.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'ported-reply-ui-')))
app.disableHardwareAcceleration()
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_PORTED_FIXTURE = '1'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 90000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(expression) {
    for (let i = 0; i < 200; i++) { if (await run(expression)) return; await delay(50) }
    throw new Error('Timed out: ' + expression)
  }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`)
  await run(`api.fixtureCommentGaps(false)`)
  await run(`document.querySelector('.review-main').click()`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('[data-review-thread-id="historical"]'))`)
  await require('./review-ported-reply-checks.cjs')(win)
  console.log('Ported reply anchors, inline placement, lifecycle, reopen, and publication scopes passed')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
