// Production desktop/preload and Chromium input, with delayed simulated Gerrit.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { startReviewServer } = require('./fixtures/review-windows-server.cjs')
const scratch = fs.mkdtempSync('/tmp/reviewed-files-ui-')
app.setPath('userData', scratch)
app.disableHardwareAcceleration()
nativeTheme.themeSource = 'light'
process.env.GERRIT_GUI_USER_DATA = scratch
process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP = '1'
const files = ['batch-scheduler', 'clock', 'queue', 'transport', 'types'].map(name => `src/telemetry/${name}.ts`)
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = (win, expression) => win.webContents.executeJavaScript(expression)
async function until(check, label) {
  for (let i = 0; i < 300; i++) { if (await check()) return; await delay(40) }
  throw new Error('Timed out: ' + label)
}
async function click(win, selector) {
  const rect = await run(win, `document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`)
  assert.ok(rect?.width, 'Visible target: ' + selector)
  win.show(); win.focus(); win.webContents.focus()
  const point = { x: Math.round(rect.x + rect.width / 2), y: Math.round(rect.y + rect.height / 2), button: 'left', clickCount: 1 }
  win.webContents.sendInputEvent({ type: 'mouseDown', ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', ...point })
  await delay(100)
}
const status = (file, reviewed) => `[aria-label="Mark ${reviewed ? 'unreviewed' : 'reviewed'}: ${file}"]`
const summary = win => run(win, `({count:document.querySelector('.review-files-heading')?.textContent, flags:[...document.querySelectorAll('.review-status')].map(b=>({checked:b.getAttribute('aria-pressed')==='true',disabled:b.disabled})),header:document.querySelector('[aria-label="File reviewed"]')?.checked,error:document.querySelector('.review-flag-error')?.textContent})`)
async function observe(win) {
  await run(win, `window.flagObservations=[];new MutationObserver(()=>{window.flagObservations.push(document.querySelector('.review-files-heading')?.textContent)}).observe(document.querySelector('.review-files'),{subtree:true,attributes:true,childList:true,characterData:true})`)
}
async function patchSet(win, number) {
  await run(win, `(()=>{const select=document.querySelector('[aria-label="Compared patch set"]');select.value=${JSON.stringify(String(number))};select.dispatchEvent(new Event('change',{bubbles:true}))})()`)
  await until(() => run(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && !document.querySelector('.review-files-heading').textContent.includes('Loading')`), 'patch set loaded')
}
let fixture
const timeout = setTimeout(() => { console.error('Reviewed-files integration timed out'); app.exit(2) }, 90000)
;(async () => {
  fixture = await startReviewServer()
  fixture.state.files = Object.fromEntries(files.map(file => [file, { lines_inserted: 3, lines_deleted: 2 }]))
  fixture.state.reviewed.set(3, new Set(files))
  fs.writeFileSync(path.join(scratch, 'settings.json'), JSON.stringify({ serverUrl: fixture.url, username: 'alex', password: 'simulated-only', localReview: true, separateReviewWindows: true, theme: 'light', showAppBadge: false, showTrayCounts: false }))
  require('../out/main/index.js')
  await until(() => BrowserWindow.getAllWindows().length === 1, 'board')
  const board = BrowserWindow.getAllWindows()[0]
  await until(() => run(board, `Boolean(document.querySelector('.review-main'))`), 'board loaded')
  await click(board, '.review-main')
  await until(() => BrowserWindow.getAllWindows().length === 2, 'first review')
  const a = BrowserWindow.getAllWindows().find(win => win !== board)
  await click(board, '.review-main')
  await until(() => BrowserWindow.getAllWindows().length === 3, 'second review')
  const b = BrowserWindow.getAllWindows().find(win => win !== board && win !== a)
  for (const win of [a, b]) {
    await until(() => run(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelector('.review-files-heading')?.textContent==='Files5/5 reviewed'`), 'initial reviewed flags')
    await observe(win)
  }
  fixture.state.reviewedWriteDelay = 500
  fixture.state.reviewedReadDelay = 300
  const start = fixture.state.calls.length
  for (const file of files.slice(0, 3)) await click(a, status(file, true))
  const optimistic = await summary(a)
  assert.deepEqual(optimistic.flags.map(f => f.checked), [false, false, false, true, true])
  assert.equal(optimistic.count, 'Files2/5 reviewed')
  assert.equal(optimistic.header, false)
  assert.ok(optimistic.flags.slice(3).every(f => !f.disabled), 'unrelated controls stay available')
  await click(a, status(files[0], false))
  a.close(); await delay(100)
  assert.equal(a.isDestroyed(), false, 'pending batch blocks closure')
  await until(async () => (await summary(a)).flags.every(f => !f.disabled), 'all saves settled')
  const writes = fixture.state.calls.slice(start).filter(call => /reviewed$/.test(call.route))
  assert.equal(writes.length, 3, 'all different files saved, duplicate pending click ignored')
  assert.ok(writes.every(call => call.method === 'DELETE'))
  assert.deepEqual([...fixture.state.reviewed.get(3)], files.slice(3))
  await until(async () => (await summary(b)).count === 'Files2/5 reviewed', 'confirmed flags in second window')
  for (const win of [a, b]) assert.equal(await run(win, `window.flagObservations.some(s=>s.includes('Loading'))`), false, 'no status flash')

  fixture.state.failReviewedWrites.add(files[3])
  await click(a, status(files[3], true))
  await click(a, status(files[4], true))
  await until(async () => Boolean((await summary(a)).error) && (await summary(a)).flags.every(f => !f.disabled), 'failed and successful saves settle')
  await delay(500)
  const failed = await summary(a)
  assert.deepEqual(failed.flags.map(f => f.checked), [false, false, false, true, false])
  assert.match(failed.error, /transport.ts/)
  fixture.state.failReviewedWrites.clear()
  await click(a, status(files[3], true))
  await until(async () => (await summary(a)).count === 'Files0/5 reviewed' && (await summary(a)).flags.every(f => !f.disabled), 'failed file retried')
  assert.equal((await summary(a)).error, undefined)

  await click(a, '.review-files-filter input')
  await click(a, status(files[0], false))
  assert.equal((await summary(a)).header, true, 'header follows optimistic sidebar flag')
  assert.equal(await run(a, `document.querySelectorAll('.review-status').length`), 4, 'filter follows optimistic flag')
  await until(() => fixture.state.reviewed.get(3).has(files[0]), 'filtered save')
  await click(a, '.review-files-filter input')
  await until(async () => (await summary(a)).flags.every(f => !f.disabled), 'filter restored')
  await click(a, '[aria-label="File reviewed"]')
  await until(async () => (await summary(a)).count === 'Files0/5 reviewed' && (await summary(a)).flags.every(f => !f.disabled), 'header save')

  await click(a, status(files[1], false))
  await patchSet(a, 2)
  assert.equal((await summary(a)).count, 'Files0/5 reviewed')
  await until(() => fixture.state.reviewed.get(3).has(files[1]), 'old revision save settles')
  assert.equal((await summary(a)).count, 'Files0/5 reviewed', 'old save does not change selected revision')
  await patchSet(a, 3)
  assert.equal((await summary(a)).count, 'Files1/5 reviewed')

  fixture.state.failReviewedRead = true
  // A confirmed write in the other view triggers a read in this one.
  await click(b, status(files[4], false))
  await until(async () => (await summary(a)).error?.includes('read failure'), 'read error retained')
  assert.equal((await summary(a)).count, 'Files1/5 reviewed', 'failed refresh keeps known flags')
  fixture.state.failReviewedRead = false
  await click(a, '.review-flag-error button')
  await until(async () => (await summary(a)).count === 'Files2/5 reviewed' && !(await summary(a)).error, 'read retry reconciles')
  console.log(JSON.stringify({ rapidWrites: 3, optimisticFlags: 'passed', noFlash: 'passed', sharedWindows: 'passed', duplicatePending: 'passed', pendingClose: 'passed', isolatedFailure: 'passed', saveRetry: 'passed', filterAndHeader: 'passed', patchSetIsolation: 'passed', readRetry: 'passed' }))
  clearTimeout(timeout); fixture.server.close()
  for (const win of BrowserWindow.getAllWindows()) win.destroy()
  fs.rmSync(scratch, { recursive: true, force: true })
  app.exit(0)
})().catch(async error => {
  console.error(error.stack)
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) fs.writeFileSync(path.join(scratch, `failure-${win.id}.png`), (await win.webContents.capturePage()).toPNG())
  console.error('Diagnostics: ' + scratch)
  clearTimeout(timeout); fixture?.server.close(); app.exit(1)
})
