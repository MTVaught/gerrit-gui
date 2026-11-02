// Production Linux desktop and real throwaway Gerrit 3.11.2, with X11 input.
// Seed dummy accounts with test/seed-gerrit.sh before running this check.
const { app, BrowserWindow, nativeTheme, net } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs'), os = require('node:os'), path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const { once } = require('node:events')
const base = process.env.GERRIT_TEST_URL
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a throwaway loopback Gerrit with dummy accounts')
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'reset-reviewed-gerrit-'))
const output = path.resolve(process.env.RESET_REVIEWED_EVIDENCE || path.join(scratch, 'evidence'))
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(scratch, 'profile'))
fs.mkdirSync(app.getPath('userData'))
app.disableHardwareAcceleration()
process.env.GERRIT_GUI_USER_DATA = app.getPath('userData')
process.env.GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP = '1'
const record = process.env.RESET_RECORDINGS === '1'
const files = ['review/a.ts', 'review/b.ts', 'review/c.ts']
const marker = '/GERRIT_GUI_UNREVIEWED'
const writes = []
const originalFetch = net.fetch.bind(net)
net.fetch = async (url, init) => {
  const response = await originalFetch(url, init)
  if (/\/reviewed$/.test(url)) writes.push({ path: decodeURIComponent(new URL(url).pathname), method: init.method, status: response.status })
  return response
}
fs.writeFileSync(path.join(app.getPath('userData'), 'settings.json'), JSON.stringify({
  serverUrl: base, username: 'bob', password: 'bobpw', projects: ['demo'], localReview: true,
  separateReviewWindows: false, theme: 'system', diffTheme: 'application', showAppBadge: false, showTrayCounts: false,
}))
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const run = (win, expression) => win.webContents.executeJavaScript(expression)
async function api(user, method, resource, body, type = 'application/json') {
  const response = await fetch(base + '/a' + resource, {
    method, redirect: 'error',
    headers: { Authorization: 'Basic ' + Buffer.from(user + ':' + user + 'pw').toString('base64'), ...(body === undefined ? {} : { 'Content-Type': type }) },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : body,
  })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${resource}: ${response.status} ${text}`)
  return text ? JSON.parse(text.replace(/^\)\]\}'/, '')) : undefined
}
const reviewed = (id, ps, user = 'bob') => api(user, 'GET', `/changes/${id}/revisions/${ps}/files?reviewed`)
const mark = (id, ps, file, value, user = 'bob') => api(user, value ? 'PUT' : 'DELETE', `/changes/${id}/revisions/${ps}/files/${encodeURIComponent(file)}/reviewed`)
async function fixture() {
  const change = await api('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: 'Keep cleared review flags after refresh', work_in_progress: true })
  const id = change._number
  for (const [i, file] of files.slice(0, 2).entries()) await api('alice', 'PUT', `/changes/${id}/edit/${encodeURIComponent(file)}`, `export const limit = ${i + 1};\n`, 'text/plain')
  await api('alice', 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
  for (const file of files.slice(0, 2)) await mark(id, 2, file, true)
  await api('alice', 'PUT', `/changes/${id}/edit/${encodeURIComponent(files[2])}`, 'export const limit = 3;\n', 'text/plain')
  await api('alice', 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
  await api('alice', 'POST', `/changes/${id}/reviewers`, { reviewer: 'bob' })
  await api('alice', 'POST', `/changes/${id}/hashtags`, { add: ['reviewer:bob'] })
  await api('alice', 'POST', `/changes/${id}/custom_keyed_values`, { add: { 'review-requested-ps': '3' } })
  await mark(id, 3, files[0], true, 'alice')
  const inherited = await reviewed(id, 3)
  assert.deepEqual(inherited.sort(), files.slice(0, 2))
  for (const file of inherited) await mark(id, 3, file, false)
  const reverted = await reviewed(id, 3)
  assert.deepEqual(reverted.sort(), inherited, 'control reproduces flags returning without the fix')
  return { id, inherited, reverted }
}
async function until(check, label) {
  for (let i = 0; i < 250; i++) { if (await check()) return; await delay(60) }
  throw Error('Timed out: ' + label)
}
const pageUntil = (win, expression, label) => until(() => run(win, expression), label)
const native = (...args) => execFileSync('xdotool', args.map(String))
let recorder, main, recordingStart, rawVideo, finalVideo, currentCaption
const captions = []
async function click(selector) {
  main.show(); main.focus(); main.webContents.focus()
  native('windowfocus', main.getNativeWindowHandle().readUInt32LE())
  const rect = await run(main, `document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect().toJSON()`)
  assert.ok(rect?.width && rect?.height, 'visible target ' + selector)
  const bounds = main.getContentBounds()
  const point = { x: Math.round(bounds.x + rect.x + rect.width / 2), y: Math.round(bounds.y + rect.y + rect.height / 2) }
  const location = native('getmouselocation', '--shell').toString()
  const x = Number(location.match(/^X=(\d+)/m)[1]), y = Number(location.match(/^Y=(\d+)/m)[1])
  for (let i = 1; i <= 16; i++) {
    native('mousemove', Math.round(x + (point.x - x) * i / 16), Math.round(y + (point.y - y) * i / 16))
    await delay(recorder ? 45 : 2)
  }
  await delay(recorder ? 2000 : 120)
  native('click', 1); await delay(150)
}
const captionFile = path.join(scratch, 'caption.txt')
function say(text) {
  console.log(text)
  currentCaption = text
  if (recorder) captions.push({ seconds: (Date.now() - recordingStart) / 1000, text })
}
async function stopRecording() {
  if (!recorder) return
  const stopped = once(recorder, 'exit'); recorder.stdin.write('q')
  const [code] = await stopped; recorder = undefined
  assert.equal(code, 0, 'video finalized')
  // Static captions avoid FFmpeg's live-text reload artifacts. Keep all input frames.
  const filters = ['drawbox=x=0:y=1000:w=iw:h=80:color=black:t=fill']
  for (const [index, caption] of captions.entries()) {
    const file = captionFile + '-' + index
    fs.writeFileSync(file, caption.text)
    const end = captions[index + 1]?.seconds ?? 99999
    filters.push(`drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${file}:fontsize=19:fontcolor=white:x=(w-text_w)/2:y=1020:enable='between(t,${caption.seconds},${end})'`)
  }
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', rawVideo, '-vf', filters.join(','), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', finalVideo])
}
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 180000)
app.whenReady().then(async () => {
  const version = JSON.parse((await (await fetch(base + '/config/server/version')).text()).slice(4))
  assert.equal(version, '3.11.2')
  let current = await fixture()
  const created = new Promise(resolve => app.once('browser-window-created', (_event, win) => resolve(win)))
  require('../out/main/index.js')
  main = await created
  main.setBounds({ x: 0, y: 0, width: 1440, height: 1000 })
  const results = []
  for (const theme of ['light', 'dark']) {
    if (theme === 'dark') {
      await click('.local-review-header > button:last-child')
      current = await fixture()
      await click('[aria-label="Refresh"]')
    }
    nativeTheme.themeSource = theme
    const { id } = current
    // Locate the real dashboard control for the generated change.
    const control = `[data-change-number="${id}"] .review-main`
    await pageUntil(main, `Boolean(document.querySelector(${JSON.stringify(control)}))`, 'test change appears')
    await click(control)
    await pageUntil(main, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelector('.review-files-heading span')?.textContent==='2/4 reviewed'`, 'inherited flags ready')
    await click(`[data-review-path="${files[0]}"]`)
    await pageUntil(main, `document.querySelector('.review-editor')?.dataset.reviewReady==='true'`, 'selected file ready')
    say('Linux Electron with real Gerrit 3.11.2 and generated data. Two of four files are reviewed.')
    if (record) {
      recordingStart = Date.now()
      captions.length = 0; captions.push({ seconds: 0, text: currentCaption })
      rawVideo = path.join(scratch, `reset-persistence-${theme}.mp4`)
      finalVideo = path.join(output, `reset-persistence-${theme}.mp4`)
      recorder = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1440x1080', '-i', process.env.DISPLAY,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', rawVideo],
      { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, `ffmpeg-${theme}.log`), 'w')] })
      await delay(2200)
    }
    say('Enable Unreviewed only to hide the reviewed files.')
    await click('.review-files-filter input')
    assert.equal(await run(main, `document.querySelectorAll('.review-status').length`), 2)
    await delay(record ? 1500 : 100)
    say('Click the reset glyph to mark all files unreviewed, including hidden files.')
    const start = writes.length
    await click('.review-reset')
    await pageUntil(main, `document.querySelector('.review-files-heading span')?.textContent==='0/4 reviewed' && document.querySelector('.review-reset')?.getAttribute('aria-busy')==='false'`, 'reset finished')
    await delay(record ? 2500 : 350)
    assert.equal(await run(main, `document.querySelectorAll('.review-status').length`), 4)
    assert.equal(await run(main, `document.querySelector('.review-files-filter input').checked`), true)
    assert.equal(await run(main, `document.querySelector('[data-review-path][aria-current=true]').dataset.reviewPath`), files[0])
    assert.deepEqual(await reviewed(id, 3), [marker])
    say('All four files stay unreviewed. Close and reopen to check the saved state.')
    await click('.local-review-header > button:last-child')
    await pageUntil(main, `!document.querySelector('.local-review')`, 'closed review')
    await click(control)
    await pageUntil(main, `document.querySelector('.review-editor')?.dataset.reviewReady==='true' && document.querySelector('.review-files-heading span')?.textContent==='0/4 reviewed'`, 'reopened review stays clear')
    say('The reopened review still has zero reviewed files. Older patch sets and the other user are unchanged.')
    await delay(record ? 5000 : 250)
    await stopRecording()
    assert.deepEqual((await reviewed(id, 2)).sort(), files.slice(0, 2))
    assert.deepEqual(await reviewed(id, 3, 'alice'), [files[0]])
    const savedWrites = writes.slice(start)
    assert.equal(savedWrites.length, 4)
    assert.ok(savedWrites.every(w => w.path.startsWith(`/a/changes/${id}/revisions/3/`) && w.status < 300))
    assert.deepEqual(savedWrites.map(w => w.method), ['PUT', 'DELETE', 'PUT', 'DELETE'])
    const result = { version, theme, ...current, writes: savedWrites, reviewed: await reviewed(id, 3), persistedAfterReopen: true, olderPatchSetUnchanged: true, otherUserUnchanged: true, platform: 'Linux Electron', data: 'Real throwaway Gerrit with generated changes and dummy accounts; no simulated responses.', captions: record ? [...captions] : undefined }
    fs.writeFileSync(path.join(output, `reset-persistence-${theme}.json`), JSON.stringify(result, null, 2) + '\n')
    results.push(result)
  }
  console.log(JSON.stringify({ passed: true, output, themes: results.map(r => r.theme) }))
  clearTimeout(timeout); main.destroy(); app.quit()
}).catch(async error => {
  console.error(error.stack); console.error('Diagnostics: ' + scratch)
  try { await stopRecording() } catch {}
  if (main && !main.isDestroyed()) fs.writeFileSync(path.join(output, 'failure.png'), (await main.webContents.capturePage()).toPNG())
  app.exit(1)
})
