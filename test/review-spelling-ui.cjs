// Build first; run under Xvfb. RECORD_SPELLING=1 captures real desktop clicks.
// Gerrit data and spelling suggestions are fixtures; the editor and native menu are real.
const { app, BrowserWindow, Menu, nativeTheme } = require('electron')
const { editorContextMenu } = require('../src/main/editor-context-menu.ts')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-review-spelling-')))
app.disableHardwareAcceleration()
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_SPELLING_FIXTURE = '1'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 90000)
let recorder
app.whenReady().then(async () => {
  const mode = process.env.SPELLING_THEME || 'light'
  nativeTheme.themeSource = mode
  const win = new BrowserWindow({ x: 0, y: 0, width: 1440, height: 960, frame: false, webPreferences: { contextIsolation: true, sandbox: false, spellcheck: true, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script, name) {
    for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) }
    throw new Error(name)
  }
  async function button(text, scope) {
    await run(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b => b.textContent === ${JSON.stringify(text)}).click()`)
    await delay(100)
  }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`, 'dashboard')
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await button('Beta', '.section-nav')
  await run(`document.querySelector('.section-body input[type="checkbox"]').click()`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`document.querySelector('.review-main').click()`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`, 'review editor')
  win.focus(); win.webContents.focus()
  for (const [keyCode, modifiers] of [['Home', ['control']], ['Down', []], ['c', []]]) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  }
  await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`, 'inline comment focused')
  await win.webContents.insertText('mispelled ')
  await delay(600)
  let context
  win.webContents.on('context-menu', (_event, params) => {
    context = params
    // The provider marks the word; suggestions are deterministic across OS dictionaries.
    const template = editorContextMenu({ ...params, dictionarySuggestions: ['misspelled'] }, {
      replace: word => win.webContents.replaceMisspelling(word),
      addToDictionary: word => win.webContents.session.addWordToSpellCheckerDictionary(word),
    })
    if (template.length) Menu.buildFromTemplate(template).popup({ window: win })
  })
  const recording = process.env.RECORD_SPELLING === '1'
  async function caption(text) {
    if (!recording) return
    await run(`(() => { let el = document.getElementById('capture-caption'); if (!el) { el = document.createElement('div'); el.id = 'capture-caption'; el.style.cssText = 'position:fixed;bottom:12px;left:12px;z-index:99999;background:#18212f;color:white;padding:12px 20px;font:18px sans-serif;pointer-events:none;border:1px solid #778;'; document.querySelector('.local-review').append(el) } el.textContent = ${JSON.stringify(text)} })()`)
  }
  async function moveAndClick(x, y, button) {
    if (recording) {
      const start = execFileSync('xdotool', ['getmouselocation', '--shell'], { encoding: 'utf8' })
      const sx = Number(start.match(/^X=(\d+)/m)[1]), sy = Number(start.match(/^Y=(\d+)/m)[1])
      for (let step = 1; step <= 20; step++) {
        execFileSync('xdotool', ['mousemove', String(Math.round(sx + (x - sx) * step / 20)), String(Math.round(sy + (y - sy) * step / 20))])
        await delay(40)
      }
      await delay(2000)
      execFileSync('xdotool', ['click', String(button)])
    } else {
      execFileSync('xdotool', ['mousemove', String(x), String(y), 'click', String(button)])
    }
  }
  if (recording) {
    const directory = path.join(__dirname, '../docs/videos/review-comments')
    fs.mkdirSync(directory, { recursive: true })
    recorder = spawn('ffmpeg', ['-y', '-f', 'x11grab', '-draw_mouse', '1', '-framerate', '25', '-video_size', '1440x960', '-i', process.env.DISPLAY, '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', path.join(directory, `spelling-${mode}.mp4`)], { stdio: ['pipe', 'ignore', 'ignore'] })
    await caption('Right-click the misspelled word in an inline review comment.')
    await delay(1500)
  }
  const rect = await run(`document.querySelector('[aria-label="Draft comment"]').getBoundingClientRect().toJSON()`)
  const x = Math.round(rect.x + 30), y = Math.round(rect.y + 12)
  await moveAndClick(x, y, 3)
  for (let i = 0; i < 100 && !context; i++) await delay(50)
  assert.ok(context?.isEditable, 'inline comment reaches the native context menu')
  assert.equal(context.misspelledWord, 'mispelled', 'native spelling identifies the clicked word')
  await caption('Click the spelling suggestion to correct the comment.')
  await delay(recording ? 2000 : 100)
  // The first native menu row is the replacement suggestion.
  await moveAndClick(x + 50, y + 12, 1)
  await until(`document.querySelector('[aria-label="Draft comment"]').value === 'misspelled '`, 'native menu correction updates React editor')
  await until(`(async () => (await api.fixtureStats()).drafts.some(d => d.message === 'misspelled '))()`, 'corrected draft autosaves')
  await caption('The corrected comment is saved automatically to Gerrit.')
  await delay(recording ? 3500 : 100)
  // Verify React retained the correction when the composer closes.
  await button('Save', '.review-comment-compose')
  await until(`!document.querySelector('.review-comment-compose') && Boolean(Array.from(document.querySelectorAll('.comment-draft')).find(el => el.textContent.includes('misspelled')))`, 'corrected draft survives closing')
  console.log(JSON.stringify({ theme: mode, nativeInlineMenu: 'passed', correction: 'passed', autosave: 'passed' }))
  if (recorder) { recorder.stdin.write('q'); await new Promise(resolve => recorder.once('exit', resolve)); recorder = null }
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(async error => {
  console.error(error)
  if (recorder) { recorder.stdin.write('q'); await new Promise(resolve => recorder.once('exit', resolve)) }
  app.exit(1)
})
