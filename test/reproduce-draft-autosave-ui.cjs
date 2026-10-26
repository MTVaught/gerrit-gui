// Production desktop with one app window, real local Gerrit, and X11 input.
// Build and seed a throwaway Gerrit before running under 1440x1000 Xvfb.
const { app, BrowserWindow, nativeTheme, net } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const { once } = require('node:events')
const root = path.resolve(__dirname, '..')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'draft-autosave-ui-'))
const output = path.resolve(process.env.DRAFT_EVIDENCE_DIR || path.join(scratch, 'evidence'))
const base = process.env.GERRIT_TEST_URL || 'http://127.0.0.1:18080'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a throwaway loopback server and dummy users')
assert.equal(process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP, '1')
fs.mkdirSync(output, { recursive: true })
app.disableHardwareAcceleration()
app.setPath('userData', path.join(scratch, 'profile'))
process.env.GERRIT_GUI_USER_DATA = app.getPath('userData')
fs.mkdirSync(app.getPath('userData'), { recursive: true })
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({
  serverUrl: base, username: 'bob', password: 'bobpw', projects: ['demo'], localReview: true,
  separateReviewWindows: false, theme: 'system', showAppBadge: false, showTrayCounts: false,
  ui: { bounds: { x: 0, y: 0, width: 1440, height: 930 } },
}))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = (win, script) => win.webContents.executeJavaScript(script)
const requests = []
const originalFetch = net.fetch.bind(net)
net.fetch = async (url, init) => {
  const response = await originalFetch(url, init)
  if (/\/a\/changes\/\d+\/(?:revisions\/\d+\/)?drafts/.test(String(url))) {
    const raw = await response.clone().text()
    let body; try { body = JSON.parse(raw.replace(/^\)\]\}'/, '')) } catch { body = raw }
    requests.push({ path: new URL(url).pathname, method: init.method, input: init.body ? JSON.parse(init.body) : undefined, status: response.status, response: body })
  }
  return response
}
async function api(user, method, resource, body, contentType = 'application/json') {
  const response = await fetch(base + '/a' + resource, {
    method, redirect: 'error',
    headers: { Authorization: 'Basic ' + Buffer.from(user + ':' + user + 'pw').toString('base64'), 'Content-Type': contentType },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : body,
  })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${resource}: ${response.status} ${text}`)
  return text.startsWith(")]}'") ? JSON.parse(text.slice(4)) : text
}
async function fixture() {
  const change = await api('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: 'Draft autosave investigation', work_in_progress: true })
  const id = change._number
  await api('alice', 'PUT', `/changes/${id}/edit/review.ts`, 'export const attempts = 3;\nexport const timeout = 1000;\n', 'text/plain')
  await api('alice', 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
  await api('alice', 'POST', `/changes/${id}/reviewers`, { reviewer: 'bob' })
  await api('alice', 'POST', `/changes/${id}/hashtags`, { add: ['reviewer:bob'] })
  await api('alice', 'POST', `/changes/${id}/custom_keyed_values`, { add: { 'review-requested-ps': '2' } })
  return id
}
async function until(win, script, label) {
  for (let n = 0; n < 200; n++) { if (await run(win, script)) return; await delay(100) }
  throw Error(label + ': ' + await run(win, 'document.body.innerText'))
}
function native(...args) { execFileSync('xdotool', args.map(String)) }
let cursor = { x: 700, y: 700 }
async function click(win, expression) {
  const point = await run(win, `(() => {const e=${expression};if(!e)throw Error('Missing target: '+${JSON.stringify(expression)});const r=e.getBoundingClientRect();return {x:Math.round(screenX+r.x+r.width/2),y:Math.round(screenY+outerHeight-innerHeight+r.y+r.height/2)}})()`)
  for (let i = 1; i <= 16; i++) {
    native('mousemove', Math.round(cursor.x + (point.x - cursor.x) * i / 16), Math.round(cursor.y + (point.y - cursor.y) * i / 16))
    await delay(45)
  }
  cursor = point
  await delay(2000); native('click', 1); await delay(300)
}
const button = (win, text, scope = '.local-review') => click(win, `Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b=>b.textContent.trim()===${JSON.stringify(text)})`)
const captionFile = path.join(scratch, 'caption.txt')
function caption(text) { console.log(text); fs.writeFileSync(captionFile + '.next', text); fs.renameSync(captionFile + '.next', captionFile) }
let recorder
async function stopRecording() {
  if (!recorder) return
  const stopped = once(recorder, 'exit'); recorder.stdin.write('q'); const [code] = await stopped
  recorder = undefined; assert.equal(code, 0, 'Recording finalized')
}
async function screenshotPair(win, name, restoreTheme) {
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await until(win, `document.documentElement.dataset.theme==='${theme}' && document.querySelector('.local-review').dataset.reviewTheme==='${theme}'`, 'theme applied')
    await delay(500)
    fs.writeFileSync(path.join(output, `${name}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
  }
  nativeTheme.themeSource = restoreTheme; await delay(400)
}
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 240000)
app.whenReady().then(async () => {
  assert.equal(JSON.parse((await (await fetch(base + '/config/server/version')).text()).slice(4)), '3.11.2')
  let id = await fixture()
  const created = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)))
  require(path.join(root, 'out/main/index.js'))
  const win = await created
  win.setBounds({ x: 0, y: 0, width: 1440, height: 930 })
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      // Reload discards the failed summary only in this isolated test profile.
      id = await fixture(); win.reload()
    }
    nativeTheme.themeSource = theme
    const target = `(() => {let e=Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='#${id}');while(e&&!e.querySelector('.review-main'))e=e.parentElement;return e?.querySelector('.review-main')})()`
    await until(win, `Boolean(${target})`, 'test review appears')
    await click(win, target)
    await until(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true'`, 'editor ready')
    await click(win, `document.querySelector('[data-review-path="review.ts"]')`)
    await until(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelector('[data-review-path="review.ts"]').getAttribute('aria-current')==='true'`, 'source file ready')
    assert.equal(BrowserWindow.getAllWindows().length, 1, 'one application window')
    caption('Linux Electron | Real local Gerrit 3.11.2 | One app window | Generated test data')
    recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1440x1000', '-i', process.env.DISPLAY,
      '-vf', `drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionFile}:reload=1:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.9:boxborderw=10:x=(w-text_w)/2:y=h-45`,
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, `reproduction-${theme}.mp4`)],
      { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, `ffmpeg-${theme}.log`), 'w')] })
    await delay(1800)
    caption('Open Comments, then File comment')
    await click(win, `document.querySelector('.review-menu summary')`)
    await button(win, 'File comment')
    caption('Type a draft and wait for autosave')
    await click(win, `document.querySelector('[aria-label="Draft comment"]')`)
    native('type', '--clearmodifiers', '--delay', 35, 'Please explain the retry limit.')
    await until(win, `Boolean(document.querySelector('.review-draft-conflict'))`, 'false conflict after autosave')
    assert.equal(await run(win, `document.querySelector('.review-comment-compose .primary').disabled`), true)
    let drafts = (await api('bob', 'GET', `/changes/${id}/drafts`))['review.ts']
    assert.equal(drafts.length, 1)
    caption('Autosave succeeded, but the app reports a conflict and disables Save')
    await delay(4000)
    caption('Click Keep as new draft, then wait for the same conflict')
    await button(win, 'Keep as new draft')
    await until(win, `Boolean(document.querySelector('.review-draft-conflict'))`, 'false conflict repeats')
    drafts = (await api('bob', 'GET', `/changes/${id}/drafts`))['review.ts']
    assert.equal(drafts.length, 2)
    assert.notEqual(drafts[0].id, drafts[1].id)
    assert.equal(drafts[0].message, drafts[1].message)
    caption('Two saved draft IDs now contain the same text. Autosave is paused again.')
    await delay(4500)
    await button(win, 'Cancel', '.review-comment-compose')
    caption('Open Reply and type an overall review summary')
    await click(win, `document.querySelector('.review-comments > button')`)
    await until(win, `Boolean(document.querySelector('[aria-label="Review summary"]'))`, 'summary ready')
    await click(win, `document.querySelector('[aria-label="Review summary"]')`)
    native('type', '--clearmodifiers', '--delay', 35, 'Please document the retry limit.')
    await until(win, `document.body.innerText.includes("400 patchset-level comments can't have side, range, or line")`, 'summary rejected')
    caption('Gerrit rejects the summary payload with HTTP 400. Send review stays disabled.')
    await delay(5000)
    await stopRecording()
    const state = await run(win, `({ summary:document.querySelector('[aria-label="Review summary"]').value, error:document.querySelector('.review-send-dialog .error').textContent, sendDisabled:document.querySelector('.review-send-dialog .primary').disabled })`)
    assert.equal(state.sendDisabled, true)
    fs.writeFileSync(path.join(output, `requests-and-storage-${theme}.json`), JSON.stringify({ theme, change: id, windows: BrowserWindow.getAllWindows().length, drafts, state, requests: requests.filter(r => r.path.startsWith(`/a/changes/${id}/`)) }, null, 2) + '\n')
    if (theme === 'dark') {
      await screenshotPair(win, 'summary-error', theme)
      // Reopen one stored draft after the recording. Capture the same
      // conflict, data, and scroll position in both screenshot themes.
      win.reload()
      await until(win, `Boolean(${target})`, 'review after reload')
      await click(win, target)
      await until(win, `Boolean(document.querySelector('[data-review-path="review.ts"]'))`, 'source file listed')
      await click(win, `document.querySelector('[data-review-path="review.ts"]')`)
      await until(win, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && Boolean(document.querySelector('.comment-draft'))`, 'saved drafts restored')
      await button(win, 'Edit')
      await click(win, `document.querySelector('[aria-label="Draft comment"]')`)
      native('key', 'End'); native('type', '--clearmodifiers', '--delay', 35, ' Please add a note.')
      await until(win, `Boolean(document.querySelector('.review-draft-conflict'))`, 'existing draft also conflicts on its own update')
      await screenshotPair(win, 'draft-conflict', theme)
    }
  }
  console.log(JSON.stringify({ reproduced: true, output, platform: 'Linux/Electron with real local Gerrit 3.11.2; generated data; X11 input' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(async error => { console.error(error); try { await stopRecording() } catch {} app.exit(1) })
