// Build, seed a throwaway Gerrit 3.11.2, then run under 1920x1080 Xvfb.
// Production desktop/service/IPC. Xdotool supplies all recorded UI input.
const { app, BrowserWindow, nativeTheme, net } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const { once } = require('node:events')
const { draftVersion } = require('../src/shared/draft-version.ts')
const root = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-autosave-gerrit-'))
const output = path.resolve(process.env.DRAFT_EVIDENCE_DIR || path.join(scratch, 'evidence'))
const base = process.env.GERRIT_TEST_URL || 'http://127.0.0.1:18080'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a throwaway loopback Gerrit and dummy accounts')
assert.equal(process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP, '1')
const record = process.env.DRAFT_RECORDINGS === '1'
const themes = process.env.DRAFT_FIX_THEME ? [process.env.DRAFT_FIX_THEME] : ['light', 'dark']
assert.ok(themes.every(theme => ['light', 'dark'].includes(theme)))
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(scratch, 'profile'))
fs.mkdirSync(app.getPath('userData'))
app.disableHardwareAcceleration()
process.env.GERRIT_GUI_USER_DATA = app.getPath('userData')
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({
  serverUrl: base, username: 'bob', password: 'bobpw', projects: ['demo'], localReview: true,
  separateReviewWindows: false, theme: 'system', showAppBadge: false, showTrayCounts: false,
  ui: { bounds: { x: 240, y: 0, width: 1440, height: 990 } },
}))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = (win, expression) => win.webContents.executeJavaScript(expression)
const requests = [], results = [], captions = []
const originalFetch = net.fetch.bind(net)
net.fetch = async (url, init) => {
  const response = await originalFetch(url, init)
  if (/\/a\/changes\/\d+\/(?:revisions\/\d+\/)?(?:drafts|review)(?:\/|\?|$)/.test(String(url))) {
    const raw = await response.clone().text()
    let body; try { body = JSON.parse(raw.replace(/^\)\]\}'/, '')) } catch { body = raw }
    requests.push({ path: new URL(url).pathname, method: init.method, input: init.body ? JSON.parse(init.body) : undefined, status: response.status, response: body })
  }
  return response
}
async function api(user, method, resource, body, type = 'application/json') {
  const response = await fetch(base + '/a' + resource, {
    method, redirect: 'error',
    headers: { Authorization: 'Basic ' + Buffer.from(user + ':' + user + 'pw').toString('base64'), 'Content-Type': type },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
  })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${resource}: ${response.status} ${text}`)
  return text.startsWith(")]}'") ? JSON.parse(text.slice(4)) : text
}
const drafts = async id => Object.entries(await api('bob', 'GET', `/changes/${id}/drafts`)).flatMap(([file, list]) => list.map(c => ({ ...c, path: file })))
const comments = async id => Object.entries(await api('bob', 'GET', `/changes/${id}/comments`)).flatMap(([file, list]) => list.map(c => ({ ...c, path: file })))
async function fixture(subject) {
  const change = await api('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject, work_in_progress: true })
  const id = change._number
  await api('alice', 'PUT', `/changes/${id}/edit/review.ts`, Array.from({ length: 12 }, (_, i) => `export const limit${i + 1} = ${i + 1};`).join('\n') + '\n', 'text/plain')
  await api('alice', 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
  await api('alice', 'POST', `/changes/${id}/reviewers`, { reviewer: 'bob' })
  await api('alice', 'POST', `/changes/${id}/hashtags`, { add: ['reviewer:bob'] })
  await api('alice', 'POST', `/changes/${id}/custom_keyed_values`, { add: { 'review-requested-ps': '2' } })
  await api('alice', 'POST', `/changes/${id}/revisions/2/review`, { comments: { 'review.ts': [{ line: 3, message: 'Please explain this limit.', unresolved: true }] }, notify: 'NONE' })
  const parent = (await comments(id)).find(c => c.path === 'review.ts')
  return { id, parent }
}
async function until(check, label) {
  for (let i = 0; i < 250; i++) { if (await check()) return; await delay(80) }
  throw Error('Timed out: ' + label)
}
const pageUntil = (win, script, label) => until(() => run(win, script), label)
function native(...args) { execFileSync('xdotool', args.map(String)) }
let recorder, activeChange, recordingStart = 0, currentCaption = ''
const captionFile = path.join(scratch, 'caption.txt')
function say(text) {
  currentCaption = text; console.log(text)
  fs.writeFileSync(captionFile + '.next', text); fs.renameSync(captionFile + '.next', captionFile)
  if (recorder) captions.push({ seconds: (Date.now() - recordingStart) / 1000, text })
}
async function click(win, expression) {
  win.show(); win.focus(); win.webContents.focus()
  native('windowfocus', win.getNativeWindowHandle().readUInt32LE())
  for (let attempt = 0; attempt < 16; attempt++) {
    const target = await run(win, `(() => {const e=${expression};if(!e)throw Error('Missing target');const r=e.getBoundingClientRect();const pane=document.querySelector('.modified-in-monaco-diff-editor .monaco-scrollable-element')?.getBoundingClientRect();return {top:r.top,bottom:r.bottom,height:r.height,visible:r.height>0&&r.top>=0&&r.bottom<innerHeight-10,pane:pane?.toJSON()}})()`)
    if (target.visible) break
    if (!target.pane) throw Error('Target is outside its window: ' + expression)
    if (recorder && attempt === 0) say('Scroll to bring the comment control into view.')
    const bounds = win.getContentBounds()
    native('mousemove', bounds.x + Math.round(target.pane.x + 15), bounds.y + Math.round(target.pane.y + target.pane.height / 2))
    native('click', '--repeat', '3', '--delay', '40', target.height && target.bottom > target.pane.bottom ? '5' : '4')
    await delay(150)
  }
  const point = await run(win, `(() => {const e=${expression};if(!e)throw Error('Missing target '+${JSON.stringify(expression)});const r=e.getBoundingClientRect();if(!r.width||!r.height)throw Error('Hidden target');return {x:Math.round(screenX+r.x+r.width/2),y:Math.round(screenY+outerHeight-innerHeight+r.y+r.height/2)}})()`)
  const location = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' })
  const start = { x: Number(location.match(/^X=(\d+)/m)[1]), y: Number(location.match(/^Y=(\d+)/m)[1]) }
  for (let i = 1; i <= 16; i++) {
    native('mousemove', Math.round(start.x + (point.x - start.x) * i / 16), Math.round(start.y + (point.y - start.y) * i / 16))
    await delay(recorder ? 45 : 2)
  }
  await delay(recorder ? 2000 : 180)
  const final = await run(win, `(() => {const r=(${expression}).getBoundingClientRect();return {x:Math.round(screenX+r.x+r.width/2),y:Math.round(screenY+outerHeight-innerHeight+r.y+r.height/2)}})()`)
  native('mousemove', final.x, final.y); await delay(50); native('click', 1); await delay(150)
}
const select = (win, css) => click(win, `document.querySelector(${JSON.stringify(css)})`)
const button = (win, text, scope = '.local-review') => click(win, `Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b=>b.textContent.trim()===${JSON.stringify(text)})`)
const field = '[aria-label="Draft comment"]', summaryField = '[aria-label="Review summary"]'
async function text(win, css, value, mode = 'replace') {
  if (recorder && mode !== 'new') say(currentCaption + (mode === 'append' ? ' Ctrl+End moves to the end.' : ' Ctrl+A selects the current text.'))
  await select(win, css)
  const before = await run(win, `document.querySelector(${JSON.stringify(css)}).value`)
  if (mode === 'replace') native('key', '--clearmodifiers', 'ctrl+a')
  if (mode === 'append') native('key', '--clearmodifiers', 'ctrl+End')
  if (value) native('type', '--clearmodifiers', '--delay', recorder ? 22 : 2, value)
  else native('key', '--clearmodifiers', 'BackSpace')
  const expected = value ? (mode === 'replace' ? value : before + value) : ''
  await pageUntil(win, `document.querySelector(${JSON.stringify(css)}).value===${JSON.stringify(expected)}`, 'native text input received')
}
async function settled(win, summary = false) {
  const scope = summary ? '.review-send-dialog' : '.review-comment-compose'
  await pageUntil(win, `document.querySelector('${scope} [role="status"]')?.textContent==='Saved to Gerrit' && document.querySelector('${scope} .primary')?.disabled===false && !document.querySelector('.review-draft-conflict')`, 'draft saved without conflict')
  const value = await run(win, `document.querySelector('${summary ? summaryField : field}').value`)
  await until(async () => (await drafts(activeChange)).some(c => c.message === value && (c.path === '/PATCHSET_LEVEL') === summary), 'latest field text stored in Gerrit')
  await pageUntil(win, `document.querySelector('${scope} .primary')?.disabled===false`, 'write completed')
  await delay(180) // Include the app's own coalesced mutation notification.
  assert.equal(await run(win, `Boolean(document.querySelector('.review-draft-conflict'))`), false)
}
async function fileComment(win, message) {
  await select(win, '.review-comments summary'); await button(win, 'File comment')
  await pageUntil(win, `Boolean(document.querySelector('${field}'))`, 'file composer')
  await text(win, field, message, 'new'); await settled(win)
}
async function save(win) {
  await button(win, 'Save', '.review-comment-compose')
  await pageUntil(win, `!document.querySelector('.review-comment-compose')`, 'explicit save closes composer')
}
async function openSummary(win) {
  await select(win, '.review-comments > button')
  await pageUntil(win, `Boolean(document.querySelector('${summaryField}'))`, 'summary dialog')
}
async function scope(win, keep) {
  if (recorder) say(keep ? 'Choose Keep drafts private. End and Enter select the last option.' : 'Choose Publish all drafts. Home and Enter select the first option.')
  await select(win, '[aria-label="Publish drafts"]')
  native('key', '--clearmodifiers', keep ? 'End' : 'Home'); native('key', 'Return'); await delay(100)
  assert.equal(await run(win, `document.querySelector('[aria-label="Publish drafts"]').value`), keep ? 'KEEP' : 'PUBLISH_ALL_REVISIONS')
}
async function send(win) {
  await button(win, 'Send review', '.review-send-dialog')
  await pageUntil(win, `!document.querySelector('.review-send-dialog') && document.body.innerText.includes('Review published to Gerrit.')`, 'review submission succeeds')
}
async function startRecording(name, theme) {
  if (!record) return
  say('Linux Electron | Real Gerrit 3.11.2 | Generated data | ' + name)
  recordingStart = Date.now(); captions.length = 0
  recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1920x1080', '-i', process.env.DISPLAY,
    '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionFile}:reload=1:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.9:boxborderw=12:x=(w-text_w)/2:y=h-42`,
    '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, `${name}-${theme}.mp4`)],
    { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, `${name}-${theme}-ffmpeg.log`), 'w')] })
  await delay(1500)
}
async function stopRecording(name, theme) {
  if (!recorder) return
  const stopped = once(recorder, 'exit'); recorder.stdin.write('q'); const [code] = await stopped
  recorder = undefined; assert.equal(code, 0)
  fs.writeFileSync(path.join(output, `${name}-captions-${theme}.json`), JSON.stringify(captions, null, 2) + '\n')
}
async function sourceFile(win) {
  await pageUntil(win, `Boolean(document.querySelector('[data-review-path="review.ts"]'))`, 'source listed')
  await select(win, '[data-review-path="review.ts"]')
  await pageUntil(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelector('.review-comments > button')?.disabled===false`, 'source and discussion ready')
}
const target = id => `(() => {let e=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='#${id}');while(e&&!e.querySelector('.review-main'))e=e.parentElement;return e?.querySelector('.review-main')})()`
async function openFromBoard(board, id) {
  board.show(); await select(board, '[aria-label="Refresh"]')
  await pageUntil(board, `Boolean(${target(id)})`, 'test change on board')
  await click(board, target(id))
}
async function overview(win) {
  await select(win, '.review-comments summary')
  await click(win, `Array.from(document.querySelectorAll('.review-menu-items button')).find(b=>b.textContent.startsWith('All comments'))`)
  await pageUntil(win, `Boolean(document.querySelector('.review-comment-overview[open]'))`, 'all comments shows overall review')
}
async function screenshotPair(name) {
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme; await delay(500)
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-video_size', '1920x1080', '-i', process.env.DISPLAY, '-frames:v', '1', path.join(output, `${name}-${theme}.png`)])
  }
}
async function sourceKinds(win, id, parent) {
  const checked = []
  for (const kind of ['line', 'range', 'reply']) {
    if (kind === 'reply') await button(win, 'Reply', `[data-review-thread-id="${parent.id}"]`)
    else {
      await select(win, '[aria-label="More review actions"]'); await button(win, 'Go to line', '.review-menu[open]')
      native('key', 'Escape'); native('key', 'shift+Right'); native('key', 'ctrl+Home'); native('key', 'Down')
      if (kind === 'range') native('key', 'shift+End')
      native('key', 'c')
    }
    await pageUntil(win, `Boolean(document.querySelector('${field}'))`, kind + ' composer')
    await text(win, field, kind + ' first text', 'new'); await settled(win)
    const first = (await drafts(id)).find(c => c.message === kind + ' first text')
    assert.ok(first)
    await text(win, field, ' updated', 'append'); await settled(win); await save(win)
    const saved = (await drafts(id)).find(c => c.id === first.id)
    assert.equal(saved.message, kind + ' first text updated')
    for (const key of ['path', 'patch_set', 'line', 'range', 'side', 'in_reply_to']) assert.deepEqual(saved[key], first[key])
    if (kind === 'range') assert.ok(saved.range)
    if (kind === 'line') assert.equal(saved.line, 2)
    if (kind === 'reply') assert.equal(saved.in_reply_to, parent.id)
    await button(win, 'Edit', `[data-review-comment-id="${saved.id}"]`)
    await text(win, field, ' canceled', 'append'); await settled(win)
    await button(win, 'Cancel', '.review-comment-compose')
    await pageUntil(win, `!document.querySelector('.review-comment-compose')`, 'cancel restores existing draft')
    assert.equal((await drafts(id)).find(c => c.id === saved.id).message, saved.message)
    await button(win, 'Discard draft', `[data-review-comment-id="${saved.id}"]`)
    await until(async () => !(await drafts(id)).some(c => c.id === saved.id), 'discard removes ' + kind)
    checked.push({ kind, first, saved })
  }
  return checked
}
async function versionOf(win, id, draftId) {
  return draftVersion(await run(win, `api.reviewDiscussion(${id}).then(d=>d.drafts.find(c=>c.id===${JSON.stringify(draftId)}))`))
}
async function removalChecks(a, b, id) {
  const checked = []
  for (const action of ['delete', 'publish']) {
    await fileComment(a, 'Draft before ' + action); await save(a)
    const draft = (await drafts(id)).find(c => c.message === 'Draft before ' + action)
    const version = await versionOf(a, id, draft.id)
    await pageUntil(b, `Boolean(document.querySelector('[data-review-comment-id="${draft.id}"]'))`, 'removal draft propagated')
    await button(b, 'Edit', `[data-review-comment-id="${draft.id}"]`)
    await text(b, field, 'Local text retained after ' + action)
    if (action === 'delete') await button(a, 'Discard draft', `[data-review-comment-id="${draft.id}"]`)
    else { await openSummary(a); await send(a) }
    await pageUntil(b, `Boolean(document.querySelector('.review-draft-conflict'))`, action + ' conflict')
    assert.equal(await run(b, `document.querySelector('${field}').value`), 'Local text retained after ' + action)
    for (const operation of [
      `api.saveReviewDraft(${id},2,{id:${JSON.stringify(draft.id)},path:'review.ts',message:'Late autosave',unresolved:true},${JSON.stringify(version)})`,
      `api.deleteReviewDraft(${id},2,${JSON.stringify(draft.id)},${JSON.stringify(version)})`,
    ]) assert.match(await run(a, operation + `.then(()=> 'allowed',e=>e.message)`), /Draft conflict/)
    assert.equal((await drafts(id)).some(c => c.id === draft.id), false)
    await button(b, 'Load saved version')
    await pageUntil(b, `!document.querySelector('.review-comment-compose')`, 'missing saved version closes editor')
    checked.push({ action, id: draft.id, retainedText: 'Local text retained after ' + action, staleWritesRejected: true })
  }
  return checked
}
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 900000)
app.whenReady().then(async () => {
  assert.equal(JSON.parse((await (await fetch(base + '/config/server/version')).text()).slice(4)), '3.11.2')
  let single = await fixture('Draft autosave and overall review regression')
  const created = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)))
  require(path.join(root, 'out/main/index.js'))
  const board = await created
  board.setBounds({ x: 240, y: 0, width: 1440, height: 990 })
  await pageUntil(board, `Boolean(document.querySelector('[aria-label="Refresh"]'))`, 'board ready')
  for (const theme of themes) {
    nativeTheme.themeSource = theme
    if (results.length) single = await fixture('Draft autosave and overall review regression')
    activeChange = single.id
    await run(board, 'api.patchSettings({separateReviewWindows:false})')
    await openFromBoard(board, single.id); await sourceFile(board)
    assert.equal(BrowserWindow.getAllWindows().length, 1)
    await startRecording('single-window', theme)
    say('One dashboard window: create a file comment and wait for autosave.')
    await fileComment(board, 'Single-window file comment.')
    const first = (await drafts(single.id)).find(c => c.path === 'review.ts')
    say('Edit the autosaved comment. The next save must keep the same draft ID.')
    await text(board, field, ' Second autosave.', 'append'); await settled(board)
    assert.equal((await drafts(single.id)).find(c => c.id === first.id).message, 'Single-window file comment. Second autosave.')
    assert.equal((await drafts(single.id)).length, 1)
    await save(board)
    say('Open Reply and autosave an overall review comment.')
    await openSummary(board); await text(board, summaryField, 'Overall review first text.', 'new'); await settled(board, true)
    const summary = (await drafts(single.id)).find(c => c.path === '/PATCHSET_LEVEL')
    say('Update the overall comment, then reopen Reply to confirm it was saved.')
    await text(board, summaryField, ' Updated.', 'append'); await settled(board, true)
    assert.equal((await drafts(single.id)).find(c => c.path === '/PATCHSET_LEVEL').id, summary.id)
    await button(board, 'Cancel', '.review-send-dialog'); await openSummary(board)
    assert.equal(await run(board, `document.querySelector('${summaryField}').value`), 'Overall review first text. Updated.')
    say('Clear the summary. Ctrl+A and Backspace delete its saved overall draft.')
    await text(board, summaryField, '')
    await until(async () => !(await drafts(single.id)).some(c => c.path === '/PATCHSET_LEVEL'), 'summary cleared on server')
    say('Write a replacement overall comment. A new saved draft is created.')
    await text(board, summaryField, 'Overall review published from the app.', 'new'); await settled(board, true)
    const replacement = (await drafts(single.id)).find(c => c.path === '/PATCHSET_LEVEL')
    assert.notEqual(replacement.id, summary.id)
    await scope(board, true); await send(board)
    assert.equal((await drafts(single.id)).find(c => c.path === '/PATCHSET_LEVEL').id, replacement.id)
    say('The comments are still private. Reopen Reply, then publish all drafts.')
    await openSummary(board); await scope(board, false); await send(board)
    const published = await comments(single.id)
    assert.equal(published.filter(c => c.id === first.id).length, 1)
    assert.equal(published.filter(c => c.id === replacement.id && c.message === replacement.message).length, 1)
    assert.deepEqual(await drafts(single.id), [])
    say('The source comment and overall review are published once. No private copies remain.')
    await overview(board); await delay(recorder ? 4000 : 150)
    await stopRecording('single-window', theme)
    if (theme === themes.at(-1)) { await screenshotPair('published-result'); nativeTheme.themeSource = theme }
    await button(board, 'Back to review Esc', '.review-comment-overview')
    const sourceChecks = await sourceKinds(board, single.id, single.parent)
    await button(board, 'Close review')
    const multi = await fixture('Two windows on the same real Gerrit review')
    activeChange = multi.id
    await run(board, 'api.patchSettings({separateReviewWindows:true})')
    await openFromBoard(board, multi.id)
    await until(() => Promise.resolve(BrowserWindow.getAllWindows().length === 2), 'first separate review')
    const a = BrowserWindow.getAllWindows().find(w => w !== board)
    await openFromBoard(board, multi.id)
    await until(() => Promise.resolve(BrowserWindow.getAllWindows().length === 3), 'second separate review')
    const b = BrowserWindow.getAllWindows().find(w => w !== board && w !== a)
    board.hide(); a.setBounds({ x: 0, y: 0, width: 956, height: 995 }); b.setBounds({ x: 964, y: 0, width: 956, height: 995 })
    await sourceFile(a); await sourceFile(b)
    await startRecording('two-windows', theme)
    say('Same review in two windows. Save an independent comment in each window.')
    await fileComment(a, 'Comment from the left window.'); await save(a)
    await pageUntil(b, `document.body.innerText.includes('Comment from the left window.')`, 'left draft reached right')
    const left = (await drafts(multi.id)).find(c => c.message === 'Comment from the left window.')
    await fileComment(b, 'Comment from the right window.'); await save(b)
    const right = (await drafts(multi.id)).find(c => c.message === 'Comment from the right window.')
    assert.notEqual(left.id, right.id); assert.equal((await drafts(multi.id)).length, 2)
    await pageUntil(a, `document.body.innerText.includes('Comment from the right window.')`, 'right draft reached left')
    say('Open the same left draft in both windows, then save an edit on the left.')
    await button(a, 'Edit', `[data-review-comment-id="${left.id}"]`); await button(b, 'Edit', `[data-review-comment-id="${left.id}"]`)
    const staleVersion = await versionOf(a, multi.id, left.id)
    await text(a, field, 'Left window updated its own draft.'); await settled(a); await save(a)
    await pageUntil(b, `Boolean(document.querySelector('.review-draft-conflict'))`, 'real edit conflicts in other window')
    assert.equal(await run(b, `document.querySelector('${field}').value`), left.message)
    say('The right window retains its text. Keep a new local comment as a separate draft.')
    await text(b, field, 'Recovered comment from the right window.')
    await button(b, 'Keep as new draft'); await settled(b)
    const recovered = (await drafts(multi.id)).find(c => ![left.id, right.id].includes(c.id))
    assert.ok(recovered); assert.equal((await drafts(multi.id)).length, 3)
    say('Continue editing the recovered draft. Further autosaves must keep its new ID.')
    await text(b, field, ' Continued.', 'append'); await settled(b); await save(b)
    assert.equal((await drafts(multi.id)).find(c => c.id === recovered.id).message, 'Recovered comment from the right window. Continued.')
    assert.equal((await drafts(multi.id)).length, 3)
    assert.match(await run(a, `api.saveReviewDraft(${multi.id},2,{id:${JSON.stringify(left.id)},path:'review.ts',message:'Stale overwrite',unresolved:true},${JSON.stringify(staleVersion)}).then(()=> 'allowed',e=>e.message)`), /Draft conflict/)
    assert.match(await run(a, `api.deleteReviewDraft(${multi.id},2,${JSON.stringify(left.id)},${JSON.stringify(staleVersion)}).then(()=> 'allowed',e=>e.message)`), /Draft conflict/)
    say('Test Load saved version on the other shared draft.')
    await button(a, 'Edit', `[data-review-comment-id="${right.id}"]`); await button(b, 'Edit', `[data-review-comment-id="${right.id}"]`)
    await text(a, field, 'Right draft updated from the left.'); await settled(a); await save(a)
    await pageUntil(b, `Boolean(document.querySelector('.review-draft-conflict'))`, 'second real conflict')
    await button(b, 'Load saved version')
    assert.equal(await run(b, `document.querySelector('${field}').value`), 'Right draft updated from the left.')
    await text(b, field, ' Edited after loading.', 'append'); await settled(b); await save(b)
    say('Publish the three source comments and an overall review from the left window.')
    await openSummary(a); await text(a, summaryField, 'Overall review from two windows.', 'new'); await settled(a, true)
    const overall = (await drafts(multi.id)).find(c => c.path === '/PATCHSET_LEVEL')
    await send(a)
    await pageUntil(b, `!document.querySelector('.comment-draft') && !document.querySelector('.review-draft-conflict')`, 'publication propagated to right window')
    const multiComments = await comments(multi.id)
    for (const id of [left.id, right.id, recovered.id, overall.id]) assert.equal(multiComments.filter(c => c.id === id).length, 1)
    assert.deepEqual(await drafts(multi.id), [])
    say('Both windows show the published review. All four saved IDs were published once.')
    await overview(a); await delay(recorder ? 4000 : 150)
    await stopRecording('two-windows', theme)
    if (theme === themes.at(-1)) { await screenshotPair('multiwindow-result'); nativeTheme.themeSource = theme }
    await button(a, 'Back to review Esc', '.review-comment-overview')
    say('Verify that the right window can post its own overall review as well.')
    await openSummary(b); await text(b, summaryField, 'Overall review sent from the right window.', 'new'); await settled(b, true)
    const rightOverall = (await drafts(multi.id)).find(c => c.path === '/PATCHSET_LEVEL')
    assert.notEqual(rightOverall.id, overall.id)
    await pageUntil(a, `document.querySelector('.review-comments > button').textContent.includes('(1)')`, 'right overall draft reached left')
    await send(b)
    const additionalOverallFromRight = (await comments(multi.id)).filter(c => c.id === rightOverall.id)
    assert.equal(additionalOverallFromRight.length, 1)
    assert.equal(additionalOverallFromRight[0].message, 'Overall review sent from the right window.')
    assert.deepEqual(await drafts(multi.id), [])
    const removals = await removalChecks(a, b, multi.id)
    const responseChecks = requests.filter(q => q.path.startsWith(`/a/changes/${single.id}/`) || q.path.startsWith(`/a/changes/${multi.id}/`))
    const saveResponses = responseChecks.filter(q => q.method === 'PUT' && q.status < 300)
    const persistedReads = responseChecks.filter(q => q.method === 'GET').flatMap(q => Object.values(q.response).flat())
    assert.ok(saveResponses.some(q => /\.\d*[1-9]\d*$/.test(q.response.updated) && persistedReads.some(c => c.id === q.response.id && c.updated === q.response.updated.replace(/\.\d+$/, '.000000000'))), 'fractional PUT and whole-second GET for the same real draft were exercised')
    assert.equal(saveResponses.filter(q => q.input.path === '/PATCHSET_LEVEL').some(q => ['side', 'line', 'range', 'parent'].some(key => key in q.input)), false)
    const result = { version: '3.11.2', theme, singleChange: single.id, multiChange: multi.id, singlePublished: published, multiPublished: multiComments, additionalOverallFromRight, sourceChecks, removals, stableIds: { left: left.id, right: right.id, recovered: recovered.id, overall: overall.id }, requests: responseChecks, finalDrafts: await drafts(multi.id), platform: 'Linux/Electron, real Gerrit, generated data, native X11 input' }
    fs.writeFileSync(path.join(output, `verified-${theme}.json`), JSON.stringify(result, null, 2) + '\n'); results.push(result)
    a.destroy(); b.destroy(); board.show()
  }
  console.log(JSON.stringify({ passed: true, output, changes: results.map(r => [r.singleChange, r.multiChange]), themes, platform: 'Linux/Electron with real local Gerrit 3.11.2' }))
  clearTimeout(timeout); board.destroy(); app.quit()
}).catch(async error => {
  console.error(error.stack)
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) {
    console.error(await run(win, 'document.body.innerText').catch(() => 'unavailable'))
    try { if (win.isVisible()) fs.writeFileSync(path.join(scratch, `failure-${win.id}.png`), (await win.webContents.capturePage()).toPNG()) } catch {}
  }
  console.error('Failure images: ' + scratch)
  try { await stopRecording('failed', themes[0]) } catch {}
  app.exit(1)
})
