// Build first. Real Linux pointer and keyboard input; simulated Gerrit data.
// Browser mode also needs test/diff-theme-server.ts and Vite on 5183/5184.
const { app, BrowserWindow, nativeTheme, ipcMain } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
const scratch = process.env.DIFF_THEME_TEST_DIR ?? fs.mkdtempSync(path.join(os.tmpdir(), 'local-diff-ui-'))
const browser = Boolean(process.env.BROWSER_THEME_FIXTURE)
const capture = Boolean(process.env.CAPTURE_DIFF_THEME)
const output = path.resolve('docs/screenshots/local-diff-preferences', browser ? 'browser' : 'desktop')
fs.mkdirSync(output, { recursive: true })
app.setPath('userData', path.join(scratch, 'user-data'))
app.disableHardwareAcceleration()
process.env.REVIEW_THEME_FIXTURE = '1'
process.env.REVIEW_FILE_ACTIVITY_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-19 12:00:00.000'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
let recorder
const timeout = setTimeout(() => { recorder?.kill('SIGINT'); app.exit(2) }, 420000)
app.whenReady().then(async () => {
  const esbuild = require(require.resolve('esbuild', { paths: [path.dirname(require.resolve('vite/package.json'))] }))
  const storePath = path.join(scratch, 'settings.cjs')
  esbuild.buildSync({ entryPoints: [path.resolve('src/main/settings.ts')], outfile: storePath, bundle: true, platform: 'node', format: 'cjs', external: ['electron'] })
  const store = require(storePath)
  if (!process.env.DIFF_THEME_REOPEN) await store.save({ ...await store.getStatus(), serverUrl: 'https://gerrit.example.com', username: 'alex', password: 'fixture', projects: [], teams: [], primaryTeam: '', mergers: [], slackWorkspaces: [], localReview: true, theme: 'system', diffTheme: 'application' })
  if (process.env.DIFF_THEME_REOPEN) await store.save({ ...await store.getStatus(), password: 'fixture' })
  const writes = []
  let failSettings = false, delaySettings = 0
  ipcMain.handle('fixture:getSettings', () => store.getStatus())
  ipcMain.handle('fixture:saveSettings', async (_event, input) => {
    writes.push(input)
    const fail = failSettings; failSettings = false
    await delay(delaySettings)
    if (fail) throw new Error('Fixture settings write failed')
    await store.save(input)
  })
  const win = new BrowserWindow({ x: 0, y: 0, width: 1600, height: 1000, frame: false, show: true,
    webPreferences: browser ? {} : { contextIsolation: true, sandbox: false, preload: path.resolve('test/fixtures/local-review-preload.cjs') } })
  const errors = [], traffic = [], themeDialogChecks = []
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => { traffic.push(details.url); callback({}) })
  const run = async script => { try { return await win.webContents.executeJavaScript(script) } catch (error) { throw new Error(script + '\n' + error.message) } }
  async function until(script, label) {
    for (let i = 0; i < 200; i++) { if (await run(script)) return; await delay(75) }
    fs.writeFileSync(path.join(scratch, 'failure.png'), (await win.webContents.capturePage()).toPNG())
    console.error(await run(`document.body.innerText.slice(-3500)`))
    throw new Error('Timed out: ' + label + '; screenshot ' + path.join(scratch, 'failure.png'))
  }
  const native = (...args) => execFileSync('xdotool', args.map(String))
  let cursor = { x: 800, y: 500 }
  async function target(selector) {
    return run(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); if(!e)throw new Error('Missing '+${JSON.stringify(selector)}); const r=e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
  }
  async function click(selector) {
    const point = await target(selector)
    if (capture) {
      const from = cursor
      for (let i = 1; i <= 20; i++) { native('mousemove', Math.round(from.x + (point.x - from.x) * i / 20), Math.round(from.y + (point.y - from.y) * i / 20)); await delay(30) }
      await delay(2000)
    } else native('mousemove', point.x, point.y)
    cursor = point
    native('click', 1)
    await delay(capture ? 650 : 140)
  }
  async function key(value) { native('key', value); await delay(100) }
  async function type(selector, text) { await click(selector); await key('ctrl+a'); if (text) native('type', '--clearmodifiers', '--delay', 40, String(text)); else await key('BackSpace'); await delay(180) }
  async function select(selector, index) { await click(selector); await key('Home'); for (let i = 0; i < index; i++) await key('Down'); await key('Return') }
  const pref = '[data-review-preferences]'
  const closePref = '.review-preferences footer button'
  const closeReview = '.local-review-header > button:last-child'
  const themeSelect = '.review-preferences label:first-child select'
  const contextSelect = '.review-preferences label:nth-child(2) select'
  const number = name => `.review-preference-fields input[type=number][min="${name === 'font' ? 8 : name === 'tab' ? 1 : 20}"]`
  const check = label => `.review-preference-fields label:nth-child(${label}) input[type=checkbox]`
  const saved = () => run(`JSON.parse(localStorage.getItem('local-review-diff-preferences'))`)
  const captionFile = path.join(scratch, 'caption.txt')
  function caption(text) { fs.writeFileSync(captionFile + '.next', text); fs.renameSync(captionFile + '.next', captionFile) }
  async function fixtureCall(name, ...args) {
    if (browser) return run(`fetch('/api/'+${JSON.stringify(name)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(args)})}).then(r=>r.json())`)
    return run(`window.api[${JSON.stringify(name)}](...${JSON.stringify(args)})`)
  }
  async function control(value) { if (browser) await fixtureCall('fixturePreferenceControl', value); else { failSettings = value.fail ?? false; delaySettings = value.delay ?? 0 } }
  const status = async () => browser ? (await fixtureCall('fixturePreferenceStatus')).settings : store.getStatus()
  async function savedTheme(value) { for (let i = 0; i < 100; i++) { if ((await status()).diffTheme === value) return; await delay(75) }; throw new Error('Theme was not persisted: ' + value) }
  async function theme(value) { await until(`document.querySelector('.local-review')?.dataset.reviewTheme === '${value}' && Boolean(document.querySelector('.monaco-editor.${value === 'dark' ? 'vs-dark' : 'vs'}'))`, 'theme ' + value) }
  async function openReview() { await click('.review-main'); await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`, 'review ready') }
  async function openPreferences() { await click(pref); await until(`Boolean(document.querySelector('.review-preferences[open]'))`, 'preferences open') }
  async function appearance() { await click('button[aria-label="Settings"]'); await click('.section-nav button:first-child') }
  async function setAppearanceTheme(value) { await click(`input[name="diff-theme"][value="${value}"]`); await until(`!document.querySelector('input[name="diff-theme"]:checked').disabled`, 'Appearance write') }
  async function screenshot(name) { fs.writeFileSync(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG()) }
  async function stopRecording() {
    if (!recorder) return
    const done = new Promise((resolve, reject) => recorder.once('exit', code => code === 0 ? resolve() : reject(new Error('ffmpeg ' + code))))
    recorder.stdin.write('q'); await done; recorder = null
  }
  if (browser) await win.loadURL('http://127.0.0.1:5183/'); else await win.loadFile(path.resolve('out/renderer/index.html'))
  win.focus(); win.webContents.focus()
  await until(`Boolean(document.querySelector('.review-main'))`, 'board ready')
  await fixtureCall('fixtureReadOnly', false)
  if (process.env.DIFF_THEME_REOPEN) {
    const expected = JSON.parse(fs.readFileSync(path.join(scratch, 'expected.json')))
    await openReview(); await openPreferences()
    assert.deepEqual(await saved(), expected.preferences)
    assert.equal(await run(`document.querySelector(${JSON.stringify(themeSelect)}).value`), expected.diffTheme)
    assert.equal((await status()).diffTheme, expected.diffTheme)
    fs.writeFileSync(path.join(output, 'restart-results.json'), JSON.stringify({ platform: process.platform, mode: browser ? 'browser' : 'desktop', retainedAfterRestart: true, expected }, null, 2))
    console.log('Restart retained local preferences and shared diff theme: ' + scratch)
    clearTimeout(timeout); win.destroy(); app.quit(); return
  }
  for (const mode of ['light', 'dark']) {
    nativeTheme.themeSource = mode
    await run(`localStorage.removeItem('local-review-diff-preferences');localStorage.setItem('local-review-gerrit-preferences-synced','true')`)
    await appearance(); await setAppearanceTheme('application'); await click('button[aria-label="Settings"]')
    await openReview(); await theme(mode)
    const opposite = mode === 'light' ? 'dark' : 'light'
    const before = await run(`({path:document.querySelector('[data-review-path][aria-current=true]')?.dataset.reviewPath,comparison:[...document.querySelectorAll('.review-comparison select')].map(e=>e.value),draft:document.querySelector('.comment-draft')?.textContent})`)
    assert.ok(before.draft?.includes('I will add that explanation.'))
    await run(`window.preferenceEditorToken=document.querySelector('.review-editor');window.preferenceModelToken=document.querySelector('.modified-in-monaco-diff-editor')`)
    if (capture) {
      caption('Linux / simulated Gerrit data. Open Diff Preferences.')
      recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '20', '-video_size', '1600x1000', '-i', process.env.DISPLAY,
        '-vf', `drawbox=x=0:y=ih-46:w=iw:h=46:color=black@0.88:t=fill,drawtext=fontfile=/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf:textfile=${captionFile}:reload=1:fontcolor=white:fontsize=20:x=(w-tw)/2:y=h-34`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(output, 'workflow-' + mode + '.mp4')], { stdio: ['pipe', 'ignore', fs.openSync(path.join(scratch, 'ffmpeg-' + mode + '.log'), 'w')] })
      await delay(1000)
    }
    await openPreferences()
    assert.equal(await run(`document.querySelectorAll('.review-preferences button').length`), 1)
    assert.equal(await run(`document.querySelector('.review-preferences .muted').textContent`), 'Changes apply automatically in this application.')
    assert.equal(await run(`document.querySelector(${JSON.stringify(contextSelect)}).value`), '-1')
    await screenshot('preferences-' + mode)
    if (!capture) { win.setSize(640, 1000); await delay(250); assert.equal(await run(`document.querySelector('.review-preferences').scrollWidth <= document.querySelector('.review-preferences').clientWidth`), true, 'compact dialog fits'); await screenshot('preferences-compact-' + mode); win.setSize(1600, 1000); await delay(250) }
    caption('Font size: use Ctrl+A, then type 16. It applies without Save.')
    await type(number('font'), '16')
    assert.equal((await saved()).fontSize, 16)
    assert.equal(await run(`getComputedStyle(document.querySelector('.modified-in-monaco-diff-editor .view-lines')).fontSize`), '16px')
    caption('Context: use Home, then two Down arrows and Enter to select 10 lines.')
    await select(contextSelect, 2)
    assert.equal((await saved()).context, 10)
    await until(`Boolean(document.querySelector('.diff-hidden-lines-widget'))`, 'context updates while preferences stay open')
    caption('Close keeps both edits. The review uses the new font and context.')
    await click(closePref); await delay(capture ? 1800 : 100)
    await until(`document.activeElement?.matches('[data-review-preferences]')`, 'focus returns to opener')
    await screenshot('review-' + mode)
    caption('Reopen preferences. Font size 16 and Context 10 are retained.')
    await openPreferences()
    assert.equal(await run(`document.querySelector(${JSON.stringify(number('font'))}).value`), '16')
    assert.equal(await run(`document.querySelector(${JSON.stringify(contextSelect)}).value`), '10')
    caption('Diff theme: use Home and arrow keys, then Enter. The theme applies automatically.')
    const visibleBeforeTheme = await run(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent`)
    await run(`window.themePreferenceDialog=document.querySelector('.review-preferences');window.themePreferenceCloseEvents=0;window.themePreferenceDialog.addEventListener('close',()=>window.themePreferenceCloseEvents++);void 0`)
    await select(themeSelect, opposite === 'light' ? 0 : 1); await theme(opposite)
    assert.equal(await run(`document.querySelector('.modified-in-monaco-diff-editor .view-lines').textContent`), visibleBeforeTheme, 'theme preserves source position')
    assert.equal((await status()).diffTheme, opposite)
    assert.equal(await run(`window.preferenceEditorToken === document.querySelector('.review-editor') && window.preferenceModelToken === document.querySelector('.modified-in-monaco-diff-editor')`), true)
    assert.deepEqual(await run(`({path:document.querySelector('[data-review-path][aria-current=true]')?.dataset.reviewPath,comparison:[...document.querySelectorAll('.review-comparison select')].map(e=>e.value),draft:document.querySelector('.comment-draft')?.textContent})`), before)
    caption('The theme changed. Diff Preferences stays open so you can keep editing.')
    await delay(capture ? 4000 : 350)
    const dialogCheck = await run(`({sameDialog:window.themePreferenceDialog===document.querySelector('.review-preferences'),open:window.themePreferenceDialog.open,modal:window.themePreferenceDialog.matches(':modal'),closeEvents:window.themePreferenceCloseEvents})`)
    assert.deepEqual(dialogCheck, {sameDialog:true,open:true,modal:true,closeEvents:0}, 'theme changes must keep the same preferences dialog open')
    caption('Keep editing: use Ctrl+A, then type Tab width 6 in the open dialog.')
    await type(number('tab'), '6')
    assert.equal((await saved()).tabWidth, 6)
    assert.equal(await run(`window.themePreferenceDialog.open && window.themePreferenceCloseEvents===0`), true, 'another edit must work without reopening preferences')
    themeDialogChecks.push({startingTheme:mode,selectedTheme:opposite,...dialogCheck,editedTabWidthWithoutReopening:6})
    await screenshot('theme-stays-open-' + mode)
    caption('Preferences is still open. Press Escape now to dismiss it explicitly.')
    await delay(capture ? 2000 : 0)
    await key('Escape'); await openPreferences()
    assert.equal(await run(`document.querySelector(${JSON.stringify(themeSelect)}).value`), opposite)
    await delay(capture ? 1800 : 100)
    caption('Close the review. Appearance uses the same saved Diff theme.')
    await click(closePref); await click(closeReview); await appearance()
    await until(`document.querySelector('input[name="diff-theme"][value="${opposite}"]').checked`, 'Appearance shares saved theme')
    await delay(capture ? 2200 : 100)
    await stopRecording()
    // Changing an unrelated setting must retain the diff theme.
    await click('input[name="theme"][value="light"]')
    await until(`!document.querySelector('input[name="theme"]:checked').disabled`, 'unrelated setting saved')
    assert.equal((await status()).diffTheme, opposite)
    await click('input[name="theme"][value="system"]')
    await until(`!document.querySelector('input[name="theme"]:checked').disabled`, 'system restored')
    await click('button[aria-label="Settings"]')
    console.log(mode + ' automatic update and shared Appearance checks passed')
  }
  if (!capture) {
    await openReview(); await openPreferences()
    // Empty, fractional, nonnumeric, and out-of-range values leave storage intact.
    const initial = await saved()
    for (const value of ['', '7', '33', '1.5', 'abc']) {
      await type(number('font'), value)
      assert.equal((await saved()).fontSize, initial.fontSize)
      assert.equal(await run(`document.querySelector(${JSON.stringify(number('font'))}).getAttribute('aria-invalid')`), 'true')
    }
    await type(number('font'), '18'); await key('Return')
    assert.equal(await run(`Boolean(document.querySelector('.review-preferences[open]'))`), true)
    await click(check(3)); await type(number('width'), '120'); await click(check(3))
    assert.equal(await run(`document.querySelector(${JSON.stringify(number('width'))}).disabled`), true)
    assert.equal((await saved()).diffWidth, 120)
    await click(check(3)); assert.equal(await run(`document.querySelector(${JSON.stringify(number('width'))}).value`), '120')
    await type(number('tab'), '8')
    for (const row of [7, 8, 9, 10]) await click(check(row))
    await select('.review-preferences label:last-child select', 3)
    const all = await saved()
    assert.deepEqual({tab:all.tabWidth,width:all.diffWidth,fit:all.fitToScreen,tabs:all.showTabs,trailing:all.showTrailingWhitespace,syntax:all.syntaxHighlighting,auto:all.autoMarkReviewed,space:all.ignoreWhitespace}, {tab:8,width:120,fit:false,tabs:true,trailing:false,syntax:false,auto:true,space:'IGNORE_ALL'})
    // Simulate a storage failure, then use the actual field again to recover.
    await run(`window.originalPreferenceSetItem=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='local-review-diff-preferences')throw new Error('Fixture storage full');return window.originalPreferenceSetItem.call(this,k,v)};void 0`)
    await type(number('font'), '20')
    await until(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture storage full')`, 'storage failure shown')
    assert.equal((await saved()).fontSize, 18)
    assert.equal(await run(`document.querySelector(${JSON.stringify(number('font'))}).value`), '18')
    await click(closePref); await openPreferences()
    assert.ok(await run(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture storage full')`))
    await run(`Storage.prototype.setItem=window.originalPreferenceSetItem;void 0`)
    await type(number('font'), '20')
    assert.equal((await saved()).fontSize, 20)
    assert.equal(await run(`Boolean(document.querySelector('.review-preferences [role=alert]'))`), false)
    // A delayed theme write must not close/disable the form or replace newer choices.
    await select(themeSelect, 2); await theme('dark')
    await control({ delay: 1500, fail: true })
    await select(themeSelect, 0); await select(themeSelect, 1); await type(number('tab'), '6')
    await click(closePref); await openPreferences()
    await savedTheme('dark'); await theme('dark'); assert.equal(await run(`document.querySelector(${JSON.stringify(themeSelect)}).value`), 'dark')
    assert.equal((await saved()).tabWidth, 6)
    await control({ delay: 300, fail: true }); await select(themeSelect, 0)
    await until(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture settings write failed')`, 'theme failure shown')
    await theme('dark'); assert.equal(await run(`document.querySelector(${JSON.stringify(themeSelect)}).value`), 'dark')
    await click(closePref); await openPreferences()
    assert.ok(await run(`document.querySelector('.review-preferences [role=alert]')?.textContent.includes('Fixture settings write failed')`))
    await control({}); await select(themeSelect, 0); await theme('light')
    assert.equal(await run(`Boolean(document.querySelector('.review-preferences [role=alert]'))`), false)
    await type(number('font'), '')
    await key('Escape'); await openPreferences()
    assert.equal(await run(`document.querySelector(${JSON.stringify(number('font'))}).value`), '20')
    await click(closePref); await click(closeReview)
    // Verify fresh local data and malformed fields without a Gerrit import.
    await run(`localStorage.setItem('local-review-diff-preferences',JSON.stringify({context:25,fontSize:99,tabWidth:8}));localStorage.setItem('local-review-gerrit-preferences-synced','true')`)
    await openReview(); await openPreferences()
    assert.equal(await run(`document.querySelector(${JSON.stringify(contextSelect)}).value`), '25')
    assert.equal(await run(`document.querySelector(${JSON.stringify(number('font'))}).value`), '13')
    assert.equal(await run(`document.querySelector(${JSON.stringify(number('tab'))}).value`), '8')
    await type(number('font'), '17')
    await click(closePref); await click(closeReview)
    await fixtureCall('fixtureReadOnly', true)
    await openReview(); await openPreferences()
    await select(contextSelect, 1); await type(number('font'), '19'); await select(themeSelect, 1); await theme('dark')
    assert.equal((await saved()).fontSize, 19)
    assert.equal((await saved()).context, 3)
    await click(closePref)
    assert.equal(await run(`document.querySelector('.review-comment-controls .btn.primary')?.disabled ?? document.querySelector('.local-review-header .btn.primary')?.disabled`), true)
    const reviewedBefore = await run(`document.querySelector('input[aria-label="File reviewed"]').checked`)
    await click('input[aria-label="File reviewed"]')
    await until(`document.querySelector('.local-review').textContent.includes('Fixture review is read-only')`, 'reviewed-file write remains denied')
    assert.equal(await run(`document.querySelector('input[aria-label="File reviewed"]').checked`), reviewedBefore)
    await click(closeReview)
    await fixtureCall('fixtureReadOnly', false)
  }
  const expected = { preferences: await saved(), diffTheme: (await status()).diffTheme }
  fs.writeFileSync(path.join(scratch, 'expected.json'), JSON.stringify(expected))
  win.webContents.reload(); await until(`Boolean(document.querySelector('.review-main'))`, 'reloaded board')
  await openReview(); await openPreferences()
  assert.deepEqual(await saved(), expected.preferences)
  assert.equal(await run(`document.querySelector(${JSON.stringify(themeSelect)}).value`), expected.diffTheme)
  assert.equal(traffic.filter(url => /preferences\.diff|(?:save)?reviewDiffPreferences/i.test(url)).length, 0)
  if (!browser) assert.equal(await run(`'reviewDiffPreferences' in window.api || 'saveReviewDiffPreferences' in window.api`), false)
  const stats = await fixtureCall('fixtureStats')
  assert.ok(stats.requests > 0, 'normal review content still loads')
  const result = { themeDialogChecks, platform: process.platform, mode: browser ? 'browser HTTP API' : 'Electron desktop', simulated: 'Gerrit data, storage and settings failures', realInput: 'xdotool pointer and keyboard', capture, checks: capture ? 'automatic font/context/theme changes, Close, Escape, shared Appearance, continuity, reload' : 'all fields, numeric validation, automatic persistence, Close/Escape/focus/Enter, continuity, local and theme failures/retry, rapid edits, read-only, legacy/corrupt values, reload', accountPreferenceRequests: 0, contentRequests: stats.requests, expected, writes: browser ? undefined : writes, traffic: traffic.filter(url => url.includes('/api/')) }
  fs.writeFileSync(path.join(output, capture ? 'capture-results.json' : 'results.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify({ mode: result.mode, checks: 'passed', accountPreferenceRequests: 0, scratch }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); recorder?.kill('SIGINT'); app.exit(1) })
