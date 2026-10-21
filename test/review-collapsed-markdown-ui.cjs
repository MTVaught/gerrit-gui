// Build first. Real Electron input against simulated Gerrit comments.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'collapsed-markdown-')))
app.disableHardwareAcceleration()
process.env.REVIEW_COMMENTS_FIXTURE = '1'
process.env.REVIEW_FIXTURE_NOW = '2026-10-21 12:00:00.000'
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1600, height: 1000, show: true, webPreferences: { contextIsolation: true, sandbox: false, preload: path.join(__dirname, 'fixtures/local-review-preload.cjs') } })
  const errors = []
  win.webContents.on('console-message', details => { if (details.level === 'error') errors.push(details.message) })
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script, label) {
    for (let i = 0; i < 200; i++) { if (await run(script)) return; await delay(50) }
    throw new Error(label + ': ' + await run('document.body.innerText'))
  }
  async function click(selector) {
    const point = await run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
    await delay(150)
  }
  const comment = '[data-review-comment-id="single"]'
  await win.loadFile(path.join(__dirname, '../out/renderer/index.html'))
  await until(`Boolean(document.querySelector('.review-main'))`, 'board opens')
  await click('button[aria-label="Settings"]')
  await run(`Array.from(document.querySelectorAll('.section-nav button')).find(b => b.textContent === 'Beta').click()`)
  await click('.section-body input[type="checkbox"]')
  await click('button[aria-label="Settings"]')
  await run('api.fixtureCommentGaps(false)')
  win.focus(); win.webContents.focus()
  await click('.review-main')
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('${comment} .review-comment-preview'))`, 'collapsed comment opens inline')
  const dir = process.env.REVIEW_FEATURE_EVIDENCE ?? path.join(__dirname, '../docs/screenshots/collapsed-comment-markdown')
  fs.mkdirSync(dir, { recursive: true })
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    await until(`document.documentElement.dataset.theme === '${theme}'`, 'theme applied')
    await delay(500)
    assert.deepEqual(await run(`(() => { const p = document.querySelector('${comment} .review-comment-preview'); return { bold: p.querySelector('strong')?.textContent, code: p.querySelector('code')?.textContent, link: p.querySelector('a')?.getAttribute('href'), quote: p.querySelector('blockquote')?.textContent.trim(), raw: p.textContent.includes('**') } })()`), { bold: 'delivery ordering', code: 'maxBatchSize', link: 'https://example.com/options', quote: 'Preserve event order.', raw: false })
    assert.ok(await run(`document.querySelector('${comment} .review-comment-preview').getBoundingClientRect().height < 25`), 'Markdown preview stays on one line')
    await click(comment + ' .review-comment-preview a')
    assert.ok(await run(`!document.querySelector('${comment} .review-comment-body')`), 'link click does not expand the comment')
    await click(comment + ' .review-comment-preview strong')
    await until(`Boolean(document.querySelector('${comment} .review-comment-body blockquote'))`, 'formatted text click expands the comment')
    await click(comment + ' [aria-label="Collapse comment"]')
    await until(`Boolean(document.querySelector('${comment} .review-comment-preview strong'))`, 'collapse restores rendered Markdown')
    fs.writeFileSync(path.join(dir, `collapsed-markdown-${theme}.png`), (await win.webContents.capturePage()).toPNG())
    await click('.review-comments summary')
    await click('.review-menu-items button')
    await until(`Boolean(document.querySelector('.review-comment-overview[open]'))`, 'all comments opens')
    assert.ok(await run(`Boolean(document.querySelector('.review-comment-overview ${comment} .review-comment-preview strong'))`), 'overview also renders collapsed Markdown')
    await click('.review-comment-return')
  }
  // Block formatting and explicit Markdown line breaks must stay compact too.
  await run(`api.saveReviewDraft('telemetry~main~Idemo', 3, { path: 'src/telemetry/batch-scheduler.ts', line: 2, side: 'REVISION', message: ${JSON.stringify('## Details\n\n- First\n- Second\n\n```ts\nconst value = 1;\n```\n\nBefore  \nafter')}, unresolved: false })`)
  await click('.review-comments summary')
  await click('.review-menu-items button:last-child')
  await until(`Boolean(document.querySelector('[data-review-comment-id="draft-1"] .review-comment-body'))`, 'block Markdown draft loads')
  assert.ok(await run(`Boolean(document.querySelector('[data-review-comment-id="draft-1"] .review-comment-body br'))`), 'expanded Markdown keeps hard breaks')
  await click('[data-review-comment-id="draft-1"] [aria-label="Collapse comment"]')
  assert.ok(await run(`document.querySelector('[data-review-comment-id="draft-1"] .review-comment-preview').getBoundingClientRect().height < 25`), 'headings, lists, code blocks and hard breaks stay on one line')
  assert.ok(await run(`document.querySelector('[data-review-comment-id="draft-1"] .review-comment-preview').textContent.replace(/\\s+/g, ' ').includes('Before after')`), 'collapsed hard break keeps the words separate')
  assert.deepEqual(errors, [])
  console.log('Collapsed Markdown checks passed in light and dark mode, with paired screenshots.')
  clearTimeout(timeout); win.destroy(); app.quit()
}).catch(error => { console.error(error); app.exit(1) })
