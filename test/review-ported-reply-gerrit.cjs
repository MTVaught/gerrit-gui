// Build first, seed a throwaway Gerrit 3.11.2, then run under Xvfb.
// Production desktop entrypoint/preload/service/client; xdotool supplies input.
const { app, BrowserWindow, nativeTheme, net } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const { execFileSync, spawn } = require('node:child_process')
const { once } = require('node:events')
const root = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ported-reply-gerrit-'))
const output = path.resolve(process.env.REPLY_EVIDENCE_DIR || path.join(scratch, 'evidence'))
const base = process.env.GERRIT_TEST_URL || 'http://127.0.0.1:8080'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a throwaway loopback Gerrit with dummy users')
assert.equal(process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP, '1', 'Enable the local test transport explicitly')
const recording = process.env.REPLY_RECORDINGS === '1'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
fs.mkdirSync(output, { recursive: true })
app.disableHardwareAcceleration()
process.env.GERRIT_GUI_USER_DATA = path.join(scratch, 'profile')
fs.mkdirSync(process.env.GERRIT_GUI_USER_DATA)
fs.writeFileSync(path.join(process.env.GERRIT_GUI_USER_DATA, 'settings.json'), JSON.stringify({
  serverUrl: base, username: 'bob', password: 'bobpw', projects: ['demo'], localReview: true,
  theme: 'system', showTrayCounts: false, ui: { bounds: { x: 0, y: 0, width: 1440, height: 1000 } },
}))
const writes = []
const realFetch = net.fetch.bind(net)
net.fetch = async (url, init) => {
  const response = await realFetch(url, init)
  if (init?.method !== 'GET' && /\/a\/changes\/\d+\/revisions\/\d+\/(drafts|review)/.test(String(url))) {
    writes.push({ path: new URL(url).pathname, method: init.method, body: JSON.parse(init.body), status: response.status })
  }
  return response
}
async function api(user, method, resource, body, content = 'application/json') {
  const response = await fetch(base + '/a' + resource, {
    method, redirect: 'error',
    headers: { Authorization: 'Basic ' + Buffer.from(user + ':' + user + 'pw').toString('base64'), 'Content-Type': content },
    body: body === undefined ? undefined : content === 'application/json' ? JSON.stringify(body) : body,
  })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${resource}: ${response.status} ${text}`)
  return text.startsWith(")]}'") ? JSON.parse(text.slice(4)) : text
}
async function fixture() {
  const change = await api('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: 'Reply anchor regression', work_in_progress: true })
  const id = change._number
  const source = 'export const retries = 3;\nexport const timeout = 1000;\n'
  await api('alice', 'PUT', `/changes/${id}/edit/reply.ts`, source, 'text/plain')
  await api('alice', 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
  await api('alice', 'POST', `/changes/${id}/reviewers`, { reviewer: 'bob' })
  await api('alice', 'POST', `/changes/${id}/hashtags`, { add: ['reviewer:bob'] })
  await api('alice', 'POST', `/changes/${id}/revisions/2/review`, {
    comments: { 'reply.ts': [{ line: 1, message: 'Please explain the retry limit.', unresolved: true }] }, notify: 'NONE',
  })
  const parent = (await api('bob', 'GET', `/changes/${id}/comments`))['reply.ts'][0]
  await api('alice', 'PUT', `/changes/${id}/edit/reply.ts`, '// Retry policy\n' + source, 'text/plain')
  await api('alice', 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
  await api('alice', 'POST', `/changes/${id}/custom_keyed_values`, { add: { 'review-requested-ps': '3' } })
  return { id, parent }
}
const run = (win, expression) => win.webContents.executeJavaScript(expression)
async function until(win, expression, label) {
  for (let i = 0; i < 200; i++) { if (await run(win, expression)) return; await delay(100) }
  throw new Error(label + ': ' + await run(win, 'document.body.innerText'))
}
let cursor = { x: 700, y: 700 }
function native(...args) { execFileSync('xdotool', args.map(String)) }
async function click(win, expression) {
  const point = await run(win, `(() => {const e=${expression};if(!e)throw Error('Missing click target');const r=e.getBoundingClientRect();return {x:Math.round(screenX+r.x+r.width/2),y:Math.round(screenY+outerHeight-innerHeight+r.y+r.height/2)}})()`)
  for (let step = 1; step <= 15; step++) {
    native('mousemove', Math.round(cursor.x + (point.x - cursor.x) * step / 15), Math.round(cursor.y + (point.y - cursor.y) * step / 15))
    await delay(recording ? 45 : 3)
  }
  cursor = point
  await delay(recording ? 2000 : 100); native('click', 1); await delay(200)
}
const button = (win, text, scope = '.local-review') => click(win, `Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b=>b.textContent.trim()===${JSON.stringify(text)})`)
const captionPath = path.join(scratch, 'caption.txt')
function caption(text) { fs.writeFileSync(captionPath + '.next', text); fs.renameSync(captionPath + '.next', captionPath) }
let recorder
async function stopRecording() {
  if (!recorder) return
  const stopped = once(recorder, 'exit'); recorder.stdin.write('q'); const [code] = await stopped
  recorder = undefined; assert.equal(code, 0, 'Recording finalized')
}
const webThreads = `(() => {function walk(n){return [...n.querySelectorAll('*')].flatMap(e=>[e,...(e.shadowRoot?walk(e.shadowRoot):[])])}return walk(document).filter(e=>e.tagName==='GR-COMMENT-THREAD' && e.getBoundingClientRect().height>0).map(e=>({rootId:e.rootId,comments:e.thread?.comments.map(c=>({id:c.id,patch_set:c.patch_set,line:c.line,in_reply_to:c.in_reply_to,message:c.message}))}))})()`
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 180000)
app.whenReady().then(async () => {
  const version = JSON.parse((await (await fetch(base + '/config/server/version')).text()).slice(4))
  assert.equal(version, '3.11.2')
  let current = await fixture()
  const created = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)))
  require(path.join(root, 'out/main/index.js'))
  const main = await created
  main.setBounds({ x: 0, y: 0, width: 1440, height: 1000 })
  await until(main, `Boolean(document.querySelector('.review-main'))`, 'Dashboard ready')
  const results = []
  let browser
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      browser.destroy(); browser = undefined
      await button(main, 'Close review')
      current = await fixture()
      await click(main, `document.querySelector('[aria-label="Refresh"]')`)
    }
    nativeTheme.themeSource = theme
    const { id, parent } = current
    const target = `(() => {let e=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='#${id}');while(e&&!e.querySelector('.review-main'))e=e.parentElement;return e?.querySelector('.review-main')})()`
    await until(main, `Boolean(${target})`, 'New test change appears')
    await click(main, target)
    await until(main, `Boolean(document.querySelector('[data-review-path="reply.ts"]'))`, 'Changed files ready')
    await click(main, `document.querySelector('[data-review-path="reply.ts"]')`)
    await until(main, `document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('[data-review-comment-id="${parent.id}"]'))`, 'Older comment mapped inline')
    assert.equal(await run(main, `document.querySelector('[aria-label="Base patch set"]').value`), 'base')
    caption('Gerrit 3.11.2 | Reply to an older comment from patch set 3')
    if (recording) {
      recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1440x1000', '-i', process.env.DISPLAY,
        '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionPath}:reload=1:fontsize=21:fontcolor=white:box=1:boxcolor=black@0.85:boxborderw=14:x=(w-text_w)/2:y=h-58`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, `fixed-reply-${theme}.mp4`)],
      { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, `ffmpeg-${theme}.log`), 'w')] })
      await delay(2000)
    }
    caption('Click Reply in the thread marked From PS 2')
    await button(main, 'Reply', `[data-review-thread-id="${parent.id}"]`)
    await until(main, `document.querySelectorAll('.review-comment-compose').length===1 && Boolean(document.querySelector('.review-editor [aria-label="Draft comment"]')) && !document.querySelector('.review-send-dialog')`, 'One inline composer')
    caption('Type once and wait for the automatic draft save')
    await click(main, `document.querySelector('[aria-label="Draft comment"]')`)
    native('type', '--clearmodifiers', '--delay', recording ? 55 : 5, 'Three attempts limit server load.')
    await until(main, `document.querySelector('.review-comment-compose [role="status"]')?.textContent==='Saved to Gerrit'`, 'Autosave completes')
    const drafts = (await api('bob', 'GET', `/changes/${id}/drafts`))['reply.ts']
    assert.equal(drafts.length, 1); const draft = drafts[0]
    assert.deepEqual([draft.patch_set, draft.line, draft.in_reply_to], [2, 1, parent.id])
    await button(main, 'Save', '.review-comment-compose')
    await until(main, `!document.querySelector('.review-comment-compose')`, 'Save closes composer')
    assert.equal(await run(main, `document.querySelector('[aria-label="Compared patch set"]').value`), '3')
    caption('Publish the one saved reply from the current patch set')
    await click(main, `document.querySelector('.review-comments > button')`)
    await until(main, `Boolean(document.querySelector('.review-send-dialog'))`, 'Publish dialog opens')
    assert.equal(await run(main, `document.querySelectorAll('.review-publish-list li').length`), 1)
    await delay(recording ? 1500 : 100)
    await button(main, 'Send review', '.review-send-dialog')
    await until(main, `!document.querySelector('.review-send-dialog') && document.querySelector('.review-comment-notice')?.textContent.includes('Review published')`, 'Review published')
    const comments = (await api('bob', 'GET', `/changes/${id}/comments`))['reply.ts']
    const replies = comments.filter(c => c.message === 'Three attempts limit server load.')
    assert.equal(replies.length, 1); assert.equal(replies[0].id, draft.id)
    assert.deepEqual([replies[0].patch_set, replies[0].line, replies[0].in_reply_to], [2, 1, parent.id])
    assert.deepEqual(await api('bob', 'GET', `/changes/${id}/drafts`), {})
    const requests = writes.filter(w => w.path.startsWith(`/a/changes/${id}/`))
    assert.deepEqual(requests.filter(w=>w.method==='PUT').map(w=>[w.path,w.body.line,w.body.in_reply_to]), [
      [`/a/changes/${id}/revisions/2/drafts`,1,parent.id], [`/a/changes/${id}/revisions/2/drafts/${draft.id}`,1,parent.id],
    ])
    assert.deepEqual(requests.find(w=>w.method==='POST').body.draft_ids_to_publish, [draft.id])
    caption('Check the same file in the real Gerrit web interface')
    browser = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 1000, webPreferences: { sandbox: true } })
    await browser.loadURL(base + '/login/%23%2F?account_id=1000002')
    await browser.loadURL(`${base}/c/demo/+/${id}/3/reply.ts`)
    await until(browser, `(${webThreads}).length>0`, 'Gerrit diff threads loaded')
    const threads = await run(browser, webThreads)
    assert.equal(threads.length, 1, 'Gerrit displays one thread')
    assert.equal(threads[0].rootId, parent.id)
    assert.equal(threads.flatMap(t=>t.comments).filter(c=>c.id===draft.id).length, 1, 'Reply appears once')
    caption('The reply appears once inside the older thread')
    await delay(recording ? 6000 : 300)
    await stopRecording()
    const result = { version, theme, change: id, requests, comments: comments.map(c=>({id:c.id,patch_set:c.patch_set,line:c.line,in_reply_to:c.in_reply_to,message:c.message})), threads }
    fs.writeFileSync(path.join(output, `fixed-reply-${theme}.json`), JSON.stringify(result, null, 2) + '\n')
    results.push(result)
  }
  // The screenshot pair uses the same final change, view, and scroll position.
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme; await delay(400)
    fs.writeFileSync(path.join(output, `fixed-result-${theme}.png`), (await browser.webContents.capturePage()).toPNG())
  }
  console.log(JSON.stringify({ passed: true, output, changes: results.map(r=>r.change), themes: results.map(r=>r.theme), platform: 'Linux/Electron with real local Gerrit 3.11.2 and generated data' }))
  clearTimeout(timeout); browser.destroy(); main.destroy(); app.quit()
}).catch(async error => { console.error(error); try { await stopRecording() } catch {} app.exit(1) })
