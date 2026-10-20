// Renderer integration with simulated native requests. Real native clicks are recorded separately.
const { app, BrowserWindow, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
process.env.REVIEW_NATIVE_FIXTURE = '1'
process.env.REVIEW_REBASE_FIXTURE = '1'
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'native-review-ui-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(r => setTimeout(r, ms))
const timeout = setTimeout(() => app.exit(2), 90000)
let ready = false
let acknowledgments = []
let blockSave = false
let releaseSave
ipcMain.on('fixture:reviewReady', (_e, value) => { ready = value })
ipcMain.on('fixture:reviewHandled', (_e, id) => acknowledgments.push(id))
ipcMain.handle('fixture:saveDraft', async () => { if (blockSave) await new Promise(resolve => { releaseSave = resolve }) })

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1280, height: 900, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = async script => {
    try { return await win.webContents.executeJavaScript(script) }
    catch (error) { throw new Error(script + '\n' + error.message) }
  }
  async function until(script, label = script) {
    for (let i = 0; i < 150; i++) { if (await run(script)) return; await delay(60) }
    throw new Error('Timed out: ' + label)
  }
  async function button(text, scope = 'document') { await run(`Array.from(${scope}.querySelectorAll('button')).find(b => b.textContent.trim() === ${JSON.stringify(text)}).click()`) }
  async function typeDraft(text) {
    await delay(150)
    const rect = await run(`document.querySelector('[aria-label="Draft comment"]').getBoundingClientRect().toJSON()`)
    win.focus(); win.webContents.focus()
    for (const type of ['mouseDown', 'mouseUp']) win.webContents.sendInputEvent({ type, x: Math.round(rect.x + 20), y: Math.round(rect.y + 20), button: 'left', clickCount: 1 })
    await win.webContents.insertText(text)
    await run(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`)
    assert.equal(await run(`document.querySelector('[aria-label="Draft comment"]').value`), text)
  }
  let requestId = 0
  const target = (id, patchSet = 3, basePatchSet) => ({ link: { id, project: 'telemetry', patchSet, ...(basePatchSet ? { basePatchSet } : {}) }, subject: 'Member ' + id })
  async function send(value) {
    const id = ++requestId
    win.webContents.send('app:review', { requestId: id, ...value })
    for (let i = 0; i < 100 && !acknowledgments.includes(id); i++) await delay(20)
    assert.ok(acknowledgments.includes(id), 'handled or canceled request acknowledged')
  }
  async function current(id, patchSet, basePatchSet) {
    await until(`document.querySelector('#local-review-title')?.textContent === 'Member ${id}' && document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    const last = (await run('api.fixtureStats()')).comparisons.at(-1).link
    assert.equal(last.id, id); assert.equal(last.patchSet, patchSet); assert.equal(last.basePatchSet, basePatchSet)
  }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'), { hash: 'tab=settings' })
  win.focus(); win.webContents.focus()
  await until(`Boolean(document.querySelector('.settings-page'))`)
  for (let i = 0; i < 100 && !ready; i++) await delay(20)
  assert.ok(ready, 'review listener announced readiness')
  await send(target(2481, 3, 1)); await current(2481, 3, 1)
  assert.equal(await run(`Boolean(document.querySelector('.settings-page'))`), false)
  assert.equal(await run(`document.querySelector('.app').classList.contains('compact')`), process.env.REVIEW_NATIVE_COMPACT === '1')

  // Same change, new comparison must remount the editor with the requested link.
  await send(target(2481, 2)); await current(2481, 2)
  const beforeDuplicate = (await run('api.fixtureStats()')).requests
  win.webContents.send('app:review', { requestId, ...target(2481, 2) })
  await delay(150)
  assert.equal((await run('api.fixtureStats()')).requests, beforeDuplicate, 'duplicate request does not remount')

  await send({ error: 'Could not open review #9999: fixture offline' })
  await until(`document.querySelector('.local-review [role="alert"]')?.textContent.includes('fixture offline')`)
  assert.equal(await run(`document.querySelector('#local-review-title').textContent`), 'Member 2481')
  assert.equal((await run('api.fixtureStats()')).openedChanges.length, 0, 'errors never launch a browser')
  await send(target(2482)); await current(2482, 3)
  assert.equal(await run(`Boolean(document.querySelector('.local-review .error[role="alert"]'))`), false)

  // A family branch and a sequence step carry the selected member's own identity.
  for (const member of [
    { link: { id: 2485, project: 'telemetry', patchSet: 3, basePatchSet: 1 }, subject: 'Release branch member' },
    { link: { id: 2486, project: 'telemetry', patchSet: 3 }, subject: 'Second sequence step' },
  ]) {
    await send(member)
    await until(`document.querySelector('#local-review-title')?.textContent === ${JSON.stringify(member.subject)} && document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`)
    assert.deepEqual((await run('api.fixtureStats()')).comparisons.at(-1).link, member.link)
  }
  await send(target(2482)); await current(2482, 3)

  // Keep text dirty long enough to test both answers to the existing discard prompt.
  await until(`Boolean(document.querySelector('.review-comments'))`)
  await button('File comment', `document.querySelector('.review-comments')`)
  await until(`Boolean(document.querySelector('[aria-label="Draft comment"]'))`)
  await run(`window.confirm = () => false; document.querySelector('[aria-label="Draft comment"]').focus()`)
  await typeDraft('Keep this unsaved text')
  await send(target(2483))
  assert.equal(await run(`document.querySelector('#local-review-title').textContent`), 'Member 2482')
  assert.equal(await run(`document.querySelector('[aria-label="Draft comment"]').value`), 'Keep this unsaved text')
  await run(`window.confirm = () => true; undefined`)
  await send(target(2483)); await current(2483, 3)

  // A draft write in flight blocks replacement without discarding its composer.
  await until(`Boolean(document.querySelector('.review-comments'))`)
  await button('File comment', `document.querySelector('.review-comments')`)
  await until(`Boolean(document.querySelector('[aria-label="Draft comment"]'))`)
  blockSave = true
  await run(`document.querySelector('[aria-label="Draft comment"]').focus()`)
  await typeDraft('Save before leaving')
  for (let i = 0; i < 100 && !releaseSave; i++) await delay(20)
  assert.ok(releaseSave, 'draft write is pending')
  await send(target(2484))
  assert.equal(await run(`document.querySelector('#local-review-title').textContent`), 'Member 2483')
  blockSave = false; releaseSave()
  await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit'`)
  await send(target(2484)); await current(2484, 3)
  assert.ok((await run('api.fixtureStats()')).drafts.some(d => d.message === 'Save before leaving'), 'saved Gerrit drafts remain')
  await button('Close review')
  // Explicit web navigation keeps using the browser API even with opt-in enabled.
  await run(`document.querySelector('button.subject,button.link.t').click()`)
  if (process.env.REVIEW_NATIVE_COMPACT === '1') await run(`Array.from(document.querySelectorAll('button')).find(b => b.textContent.includes('Open in Gerrit')).click()`)
  assert.deepEqual((await run('api.fixtureStats()')).openedChanges.at(-1), { id: 2481, project: 'telemetry' })
  ready = false
  await win.reload()
  await until(`Boolean(document.querySelector('.settings-page'))`)
  assert.equal(await run(`Boolean(document.querySelector('.local-review[open]'))`), false, 'acknowledged selection does not reopen')
  console.log(JSON.stringify({ compact: process.env.REVIEW_NATIVE_COMPACT === '1', startup: 'passed', comparisons: 'passed', errors: 'passed', dirtyEdits: 'passed', pendingWrites: 'passed', savedDrafts: 'passed', explicitWeb: 'passed' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
