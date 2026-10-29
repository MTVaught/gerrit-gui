// Real Electron/preload and input events against simulated loopback Gerrit.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs'), path = require('node:path')
const { startReviewServer } = require('./fixtures/review-windows-server.cjs')
const scratch = fs.mkdtempSync('/tmp/reset-reviewed-ui-')
app.setPath('userData', scratch); app.disableHardwareAcceleration(); nativeTheme.themeSource = 'light'
process.env.GERRIT_GUI_USER_DATA = scratch
process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP = '1'
const files = ['batch-scheduler', 'clock', 'types'].map(name => `src/telemetry/${name}.ts`)
const outside = 'outside-comparison.ts'
const delay = ms => new Promise(r => setTimeout(r, ms))
const run = (win, script) => win.webContents.executeJavaScript(script)
async function until(check, label) {
  for (let n = 0; n < 250; n++) { if (await check()) return; await delay(40) }
  throw Error('Timed out: ' + label)
}
async function click(win, css) {
  const r = await run(win, `document.querySelector(${JSON.stringify(css)})?.getBoundingClientRect().toJSON()`)
  assert.ok(r?.width, 'visible target: ' + css)
  win.show(); win.focus(); win.webContents.focus()
  const point = { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), button: 'left', clickCount: 1 }
  win.webContents.sendInputEvent({ type: 'mouseDown', ...point })
  win.webContents.sendInputEvent({ type: 'mouseUp', ...point })
  await delay(70)
}
async function key(win, keyCode) {
  win.focus(); win.webContents.focus()
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
  if (keyCode === 'Enter' || keyCode === 'Space') win.webContents.sendInputEvent({ type: 'char', keyCode: keyCode === 'Enter' ? '\r' : ' ' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
  await delay(70)
}
async function count(win, n) { await until(() => run(win, `document.querySelector('.review-files-heading span')?.textContent===${JSON.stringify(n+'/3 reviewed')}`), 'count '+n) }
async function idle(win) { await until(() => run(win, `document.querySelector('.review-reset')?.getAttribute('aria-busy')==='false' && !document.querySelector('.review-status[aria-busy=true]')`), 'writes settled') }
const fileButton = file => `[data-review-path="${file}"]`
const mark = (file, done) => `[aria-label="Mark ${done ? 'unreviewed' : 'reviewed'}: ${file}"]`
let fixture
const timeout = setTimeout(() => { console.error('Reset integration timed out'); app.exit(2) }, 120000)
;(async () => {
  fixture = await startReviewServer()
  fixture.state.files = Object.fromEntries(files.map(f => [f, { lines_inserted: 3, lines_deleted: 2 }]))
  fixture.state.reviewed.set(3, new Set([files[0], files[1], outside, '/COMMIT_MSG']))
  fixture.state.reviewed.set(2, new Set([files[0]]))
  fixture.state.comments.push({ id:'kept-comment', path:files[0], patch_set:3, message:'Keep this comment', updated:'2026-10-23 12:00:00.000000000', author:{_account_id:1,name:'Alex'} })
  fs.writeFileSync(path.join(scratch,'settings.json'), JSON.stringify({serverUrl:fixture.url, username:'alex', password:'simulated-only', localReview:true, separateReviewWindows:true, theme:'light', showAppBadge:false, showTrayCounts:false}))
  require('../out/main/index.js')
  await until(() => BrowserWindow.getAllWindows().length === 1, 'board')
  const board = BrowserWindow.getAllWindows()[0]
  await until(() => run(board, `Boolean(document.querySelector('.review-main'))`), 'board loaded')
  async function open() {
    const previous = new Set(BrowserWindow.getAllWindows())
    await click(board,'.review-main')
    await until(() => BrowserWindow.getAllWindows().some(w => !previous.has(w)), 'review window')
    const win = BrowserWindow.getAllWindows().find(w => !previous.has(w))
    await until(() => run(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && !!document.querySelector('.review-reset') && !document.querySelector('.review-files-heading span')?.textContent.includes('Loading')`), 'review ready')
    return win
  }
  const a = await open(); let b = await open()
  await count(a, 2); await count(b, 2)
  // Capture the selected crossed-out checkmark with the same loaded data in both themes.
  for (const theme of ['light','dark']) {
    await run(board, `api.patchSettings({theme:${JSON.stringify(theme)},diffTheme:'application'})`)
    await until(()=>run(a, `document.documentElement.dataset.theme===${JSON.stringify(theme)} && document.querySelector('.local-review').dataset.reviewTheme===${JSON.stringify(theme)}`),'heading appearance '+theme)
    const rect = await run(a, `document.querySelector('.review-files').getBoundingClientRect().toJSON()`)
    const image = await a.webContents.capturePage({x:Math.floor(rect.x),y:Math.floor(rect.y),width:Math.ceil(rect.width),height:300})
    fs.writeFileSync(path.resolve('openspec/changes/archive/2026-10-29-mark-all-files-unreviewed/evidence/reset-heading-'+theme+'.png'),image.toPNG())
  }

  await click(b, fileButton(files[2]))
  await click(b,'.review-comments details summary')
  await click(b,'.review-comments .review-menu-items button:nth-child(3)')
  // Keep another window's local composer text through confirmed-status refreshes.
  await until(() => run(b, `!!document.querySelector('[aria-label="Draft comment"]')`), 'composer')
  await click(b,'[aria-label="Draft comment"]')
  await b.webContents.insertText('Keep my local draft text')
  await click(a,'.review-files-filter input')
  assert.equal(await run(a,`document.querySelectorAll('.review-status').length`), 1)
  fixture.state.reviewedWriteDelay = 300; fixture.state.reviewedReadDelay = 180
  const start = fixture.state.calls.length
  await click(a,'.review-reset')
  assert.equal(await run(a,`document.querySelector('.review-reset').getAttribute('aria-label')`),'Marking all unreviewed...')
  assert.equal(await run(a,`document.querySelector('[aria-label="Compared patch set"]').disabled`),true)
  assert.equal(await run(a,`document.querySelector('[aria-label="Base patch set"]').disabled`),true)
  assert.equal(await run(a,`document.querySelector('[aria-label="File reviewed"]').disabled`),true)
  assert.equal(await run(a,`[...document.querySelectorAll('.review-status')].every(b=>b.disabled)`),true)
  await click(a,'.review-reset'); await key(a,'R')
  a.close(); await delay(80)
  assert.equal(a.isDestroyed(),false,'pending reset blocks native closure')
  await count(a,0); await idle(a); await count(b,0)
  const writes = fixture.state.calls.slice(start).filter(c=>/reviewed$/.test(c.route))
  assert.equal(writes.length,4,'duplicate click and shortcut did not add writes')
  assert.ok(writes.every(c=>c.method==='DELETE' && c.route.includes('/revisions/3/')))
  assert.equal(fixture.state.reviewed.get(3).size,0)
  assert.deepEqual([...fixture.state.reviewed.get(2)],[files[0]])
  assert.equal(fixture.state.comments[0].message,'Keep this comment')
  assert.equal(await run(a,`document.querySelector('.review-files-filter input').checked`),true)
  assert.equal(await run(a,`document.querySelectorAll('.review-status').length`),3)
  assert.equal(await run(a,`document.querySelector('[data-review-path][aria-current=true]').dataset.reviewPath`),files[0])
  assert.equal(await run(b,`document.querySelector('[data-review-path][aria-current=true]').dataset.reviewPath`),files[2])
  assert.equal(await run(b,`document.querySelector('[aria-label="Draft comment"]').value`),'Keep my local draft text')
  assert.equal(await run(a,`document.querySelector('.review-reset').disabled`),true,'empty reset disabled')
  const reopened = await open(); await count(reopened,0); reopened.destroy(); b.destroy()

  // Automatic marking and first/partial failures use real preference controls and reset input.
  await click(a,'.review-files-filter input')
  await run(board,`api.patchReviewPreferences({autoMarkReviewed:true})`)
  await click(a,fileButton(files[1]))
  await until(()=>fixture.state.reviewed.get(3).has(files[1]),'automatic marking starts')
  await idle(a)
  await click(a,mark(files[2],false)); await idle(a); await count(a,2)
  fixture.state.failReviewedWrites.add(files[1])
  await click(a,'.review-reset')
  await idle(a)
  assert.match(await run(a,`document.querySelector('.review-flag-error')?.textContent`),/Could not mark all files unreviewed/)
  assert.equal(fixture.state.reviewed.get(3).size,2,'first failure kept flags')
  fixture.state.failReviewedWrites.clear()
  fixture.state.failReviewedWrites.add(files[2])
  await click(a,'.review-reset'); await idle(a); await count(a,1)
  assert.equal(fixture.state.reviewed.get(3).has(files[1]),false)
  await delay(250)
  assert.equal(fixture.state.reviewed.get(3).has(files[1]),false,'automatic marking did not undo partial reset')
  fixture.state.failReviewedWrites.clear()
  await click(a,'.review-flag-error button'); await delay(250)
  assert.equal(fixture.state.reviewed.get(3).has(files[1]),false,'status retry keeps current visit unreviewed')
  await click(a,'.review-reset'); await idle(a); await count(a,0)
  assert.equal(await run(board,`api.getReviewPreferences().then(s=>s.value.autoMarkReviewed)`),true)
  await delay(350)
  assert.equal(fixture.state.reviewed.get(3).size,0,'automatic marking did not undo reset')
  await click(a,fileButton(files[2])); await until(()=>fixture.state.reviewed.get(3).has(files[2]),'automatic marking resumes')
  await idle(a)
  // Tab to the button and activate with Enter, then Space in a fresh visit.
  await click(a, '.review-files-filter input'); await key(a,'Tab')
  await run(a,`document.querySelector('.review-reset').focus()`)
  await key(a,'Enter'); await idle(a); await count(a,0)
  await click(a,fileButton(files[0])); await until(()=>fixture.state.reviewed.get(3).has(files[0]),'revisit auto mark')
  await idle(a); await run(a,`document.querySelector('.review-reset').focus()`)
  await key(a,'Space'); await idle(a); await count(a,0)
  await run(board,`api.patchReviewPreferences({autoMarkReviewed:false})`)
  await delay(100)

  // Read failure disables reset even with cached flags, until a successful retry.
  b = await open()
  await click(a,mark(files[0],false)); await idle(a)
  fixture.state.failReviewedRead=true
  await click(b,mark(files[1],false)); await delay(650)
  await until(()=>run(a,`!!document.querySelector('.review-flag-error')`),'failed status refresh')
  assert.equal(await run(a,`document.querySelector('.review-reset').disabled`),true)
  fixture.state.failReviewedRead=false
  await click(a,'.review-flag-error button')
  await until(()=>run(a,`!document.querySelector('.review-reset').disabled`),'status retry enables reset')
  await click(a,'.review-reset'); await idle(a); await count(a,0)

  // A reset remains available for flags outside the visible comparison.
  const link = {id:2481,project:'telemetry',patchSet:3}
  await run(board,`api.setReviewFileReviewed(${JSON.stringify(link)},${JSON.stringify(outside)},true)`)
  await until(()=>run(a,`!document.querySelector('.review-reset').disabled`),'outside flag enables reset')
  await count(a,0)
  await click(a,'.review-reset'); await idle(a)
  assert.equal(fixture.state.reviewed.get(3).size,0)

  // Resize with real pointer input, then inspect the same narrow view in both themes.
  const separator = await run(a, `document.querySelector('.review-file-resize').getBoundingClientRect().toJSON()`)
  const dragStart = {x:Math.round(separator.x+separator.width/2),y:Math.round(separator.y+100)}
  a.webContents.sendInputEvent({type:'mouseDown',...dragStart,button:'left',clickCount:1})
  a.webContents.sendInputEvent({type:'mouseMove',x:140,y:dragStart.y,button:'left'})
  a.webContents.sendInputEvent({type:'mouseUp',x:140,y:dragStart.y,button:'left',clickCount:1})
  await delay(150)
  const evidence = path.resolve('openspec/changes/archive/2026-10-29-mark-all-files-unreviewed/evidence')
  for (const theme of ['light','dark']) {
    await run(board, `api.patchSettings({theme:${JSON.stringify(theme)},diffTheme:'application'})`)
    await until(()=>run(a, `document.documentElement.dataset.theme===${JSON.stringify(theme)}`),'appearance '+theme)
    const layout = await run(a, `(()=>{const pane=document.querySelector('.review-files'),b=document.querySelector('.review-reset');return {pane:pane.getBoundingClientRect().width,width:b.getBoundingClientRect().width,height:b.getBoundingClientRect().height,inside:b.getBoundingClientRect().right<=pane.getBoundingClientRect().right,wrap:getComputedStyle(b).whiteSpace,overflow:b.scrollWidth>b.clientWidth}})()`)
    assert.ok(layout.pane<=142 && layout.pane>=140,JSON.stringify(layout))
    assert.equal(layout.inside,true)
    assert.equal(layout.overflow,false)
    assert.equal(layout.width,22)
    assert.equal(layout.height,22)
    assert.equal(await run(a, `document.querySelector('.review-reset').parentElement.className`),'review-files-heading')
    assert.equal(await run(a, `document.querySelector('.review-reset').getAttribute('aria-label')`),'Mark all unreviewed')
    fs.writeFileSync(path.join(evidence,'reset-narrow-'+theme+'.png'),(await a.webContents.capturePage()).toPNG())
  }

  // Embedded review uses the same production control and pending close protection.
  await run(board,`api.patchSettings({separateReviewWindows:false})`)
  await click(board,'.review-main')
  await until(()=>run(board,`document.querySelector('.review-editor')?.dataset.reviewReady==='true'`),'embedded review')
  await click(board,mark(files[0],false)); await idle(board)
  await click(board,'.review-reset')
  await key(board,'U')
  assert.equal(await run(board,`!!document.querySelector('.local-review')`),true)
  await idle(board); await count(board,0)
  console.log(JSON.stringify({reset:'passed',hiddenAndOutsidePaths:'passed',pseudoFiles:'passed',duplicateAndShortcut:'passed',pendingClose:'passed',sharedWindowsAndDraft:'passed',persistence:'passed',partialFailureAndRetry:'passed',autoMarkVisit:'passed',keyboardEnterAndSpace:'passed',readRetry:'passed',embedded:'passed'}))
  clearTimeout(timeout); fixture.server.close()
  for(const w of BrowserWindow.getAllWindows()) w.destroy()
  fs.rmSync(scratch,{recursive:true,force:true});app.exit(0)
})().catch(async error=>{
  console.error(error.stack)
  for(const w of BrowserWindow.getAllWindows()) if(!w.isDestroyed()) fs.writeFileSync(path.join(scratch,'failure-'+w.id+'.png'),(await w.webContents.capturePage()).toPNG())
  console.error('Diagnostics: '+scratch)
  clearTimeout(timeout);fixture?.server.close();app.exit(1)
})
