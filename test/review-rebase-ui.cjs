// Build first. Exercise real Monaco decoration layers against Gerrit metadata.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
process.env.REVIEW_REBASE_FIXTURE = '1'
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-rebase-ui-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  nativeTheme.themeSource = 'light'
  const win = new BrowserWindow({ width: 1440, height: 960, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script) { for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) } throw new Error('Timed out: ' + script) }
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`Array.from(document.querySelectorAll('.section-nav button')).find(b => b.textContent === 'Beta').click()`)
  await delay(100)
  await run(`document.querySelector('.section-body input[type="checkbox"]').click()`)
  await run(`document.querySelector('button[aria-label="Settings"]').click()`)
  await run(`document.querySelector('.review-main').click()`)
  await until(`Boolean(document.querySelector('.review-rebase-added-text'))`)
  const functionLines = await run(`(() => {
    const lines = Array.from(document.querySelectorAll('.modified-in-monaco-diff-editor .view-lines > .view-line'));
    const index = lines.findIndex(e => e.textContent.includes('rebasedFunction'));
    return lines.slice(index, index + 3).map(e => Boolean(e.querySelector('.review-rebase-added-text')));
  })()`)
  assert.deepEqual(functionLines, [true, true, true], 'rebased function header, return and closing brace are all rebase edits')
  assert.ok(await run(`!document.querySelector('.review-rebase-legend, .review-tools, .review-stats, .review-current-file')`), 'diff has no legend, action strip, diagnostics footer or repeated file row')
  assert.ok(await run(`document.querySelector('.review-editor').getBoundingClientRect().top < 200`), 'code begins near the top of the window')
  await run(`document.querySelector('summary[aria-label="More review actions"]').click()`)
  assert.ok(await run(`Boolean(document.querySelector('.review-menu[open]'))`))
  await run(`document.querySelector('.review-menu[open] summary').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await until(`!document.querySelector('.review-menu[open]')`)
  assert.ok(await run(`Boolean(document.querySelector('.local-review[open]'))`), 'Escape dismisses menu without closing review')
  async function checkHighlightLayers(lineColors, textColors) {
    for (const [index, kind] of ['added', 'removed'].entries()) {
      const actual = await run(`(() => {
        const row = document.querySelector('.view-overlays > div:has(.review-rebase-${kind})');
        const line = row.querySelector('.line-${kind === 'added' ? 'insert' : 'delete'}');
        const text = row.querySelector('.char-${kind === 'added' ? 'insert' : 'delete'}');
        const token = document.querySelector('.review-rebase-${kind}-text');
        return [getComputedStyle(line).backgroundColor, getComputedStyle(text).backgroundColor, getComputedStyle(token).backgroundColor];
      })()`)
      assert.deepEqual(actual, [lineColors[index], textColors[index], 'rgba(0, 0, 0, 0)'], 'rebase line and word layers use the same hue without opaque token backgrounds')
    }
    assert.ok(await run(`(() => {
      const row = document.querySelector('.modified-in-monaco-diff-editor .view-overlays > div:has(.char-insert):not(:has(.review-rebase-added))');
      return getComputedStyle(row.querySelector('.char-insert')).backgroundColor !== getComputedStyle(document.querySelector('.view-overlays > div:has(.review-rebase-added) .char-insert')).backgroundColor;
    })()`), 'ordinary changed words retain their normal color')
  }
  await checkHighlightLayers(['rgb(215, 231, 255)', 'rgb(255, 240, 189)'], ['rgb(170, 203, 250)', 'rgb(245, 215, 117)'])
  async function checkOverviewColors() {
    const colors = await run(`Array.from(document.querySelectorAll('canvas.diffOverviewRuler')).map(canvas => {
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const colors = new Set();
      for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3]) colors.add(Array.from(pixels.slice(i, i + 4)).join(','));
      return Array.from(colors);
    })`)
    assert.ok(colors[0].includes('233,187,70,255'), 'scrollbar shows rebase removals in yellow')
    assert.ok(colors[1].includes('138,180,248,255'), 'scrollbar shows rebase additions in blue')
    assert.ok(colors.every(pane => pane.length > 1), 'scrollbar also preserves ordinary edits in a mixed hunk')
  }
  await checkOverviewColors()
  const adjacentMarkers = await run(`Array.from(document.querySelectorAll('canvas.diffOverviewRuler')).map((canvas, index) => {
    const editor = document.querySelector(index ? '.modified-in-monaco-diff-editor' : '.original-in-monaco-diff-editor');
    return ['feature', 'upstream', 'local'].map(name => {
      const line = Array.from(editor.querySelectorAll('.view-lines > .view-line')).find(e => e.textContent.includes('const') && e.textContent.includes(name));
      const y = Math.floor((line.offsetTop + line.offsetHeight / 2) * canvas.height / canvas.clientHeight);
      return Array.from(canvas.getContext('2d').getImageData(Math.floor(canvas.width / 2), y, 1, 1).data).join(',');
    });
  })`)
  for (const pane of adjacentMarkers) {
    assert.equal(pane[0], pane[2], 'regular edit adjacent to a rebase edit keeps the ordinary marker color')
    assert.notEqual(pane[1], pane[2], 'mixed hunk is split at the rebase boundary')
  }
  const colors = await run(`['.review-rebase-added', '.review-rebase-removed'].map(s => getComputedStyle(document.querySelector(s)).backgroundColor)`)
  assert.deepEqual(colors, ['rgb(215, 231, 255)', 'rgb(255, 240, 189)'])
  assert.ok(await run(`Array.from(document.querySelectorAll('.modified-in-monaco-diff-editor .view-line')).find(e => e.textContent.includes('feature')).querySelector('.review-rebase-added-text') === null`), 'ordinary edit retains normal coloring')
  assert.equal(await run(`Array.from(document.querySelectorAll('.review-rebase-added-text')).filter(e => e.textContent.includes('spacing')).length`), 1, 'default whitespace policy shows whitespace-only rebase edits')
  await run(`Array.from(document.querySelectorAll('.local-review button')).find(b => b.textContent === 'Diff preferences').click()`)
  await run(`(() => { const e = Array.from(document.querySelectorAll('.review-preferences select')).find(e => e.closest('label').textContent.includes('Ignore Whitespace')); e.value = 'IGNORE_TRAILING'; e.dispatchEvent(new Event('change', {bubbles:true})); })()`)
  await run(`Array.from(document.querySelectorAll('.review-preferences button')).find(b => b.textContent === 'Save').click()`)
  await until(`!Array.from(document.querySelectorAll('.review-rebase-added-text')).some(e => e.textContent.includes('spacing'))`)
  nativeTheme.themeSource = 'dark'
  await until(`getComputedStyle(document.querySelector('.review-rebase-added')).backgroundColor === 'rgb(36, 63, 97)'`)
  await checkHighlightLayers(['rgb(36, 63, 97)', 'rgb(84, 69, 29)'], ['rgb(54, 91, 134)', 'rgb(128, 103, 41)'])
  await checkOverviewColors()
  const dir = path.join(__dirname, '../docs/screenshots/local-review')
  fs.mkdirSync(dir, { recursive: true })
  await delay(200)
  fs.writeFileSync(path.join(dir, 'rebase-diff-dark.png'), (await win.webContents.capturePage()).toPNG())
  nativeTheme.themeSource = 'light'
  await until(`getComputedStyle(document.querySelector('.review-rebase-added')).backgroundColor === 'rgb(215, 231, 255)'`)
  await delay(200)
  fs.writeFileSync(path.join(dir, 'rebase-diff-light.png'), (await win.webContents.capturePage()).toPNG())
  win.focus(); win.webContents.focus()
  await run(`Array.from(document.querySelectorAll('.local-review button')).find(b => b.textContent === 'Go to line').click()`)
  for (const keyCode of ['Escape', 'm']) { win.webContents.sendInputEvent({ type: 'keyDown', keyCode }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode }); await delay(100) }
  await until(`Boolean(document.querySelector('.review-side-head.unified'))`)
  assert.ok(await run(`Boolean(document.querySelector('.modified-in-monaco-diff-editor .review-rebase-added-text'))`), 'unified view retains rebase additions')
  await until(`Boolean(document.querySelector('.modified-in-monaco-diff-editor .view-zones .review-rebase-removed-text'))`)
  assert.equal(await run(`getComputedStyle(document.querySelector('.modified-in-monaco-diff-editor .view-zones .view-line:has(.review-rebase-removed-text)')).backgroundColor`), 'rgb(255, 240, 189)', 'unified removals retain rebase colors')
  assert.equal(await run(`getComputedStyle(document.querySelector('.view-zones .view-line:has(.review-rebase-removed-text) .char-delete')).backgroundColor`), 'rgb(245, 215, 117)', 'unified changed words use rebase yellow')
  await checkOverviewColors()
  assert.equal((await run('api.fixtureStats()')).requests, 1, 'no extra diff fetches')
  console.log(JSON.stringify({ rebaseColors: 'passed', ordinaryColors: 'passed', whitespacePolicy: 'passed', darkTheme: 'passed', unified: 'passed', noExtraFetch: 'passed' }))
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
