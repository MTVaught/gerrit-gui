// Real renderer and input checks with simulated Gerrit data. Start Vite first.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-count-summary-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 60000)
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1560, height: 1220, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true } })
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') console.error(message) })
  const run = script => win.webContents.executeJavaScript(script)
  const fixture = `http://localhost:5173/@fs${path.join(__dirname, 'fixtures/count-summary.html')}`
  async function until(script) {
    for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(100) }
    throw new Error('Timed out: ' + script)
  }
  async function click(selector) {
    const rect = await run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
    win.webContents.sendInputEvent({ type: 'mouseMove', ...rect })
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 1, ...rect })
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 1, ...rect })
    await delay(100)
  }
  const evidence = path.join(__dirname, '../docs/screenshots/change-counts')
  fs.mkdirSync(evidence, { recursive: true })
  async function pair(name) {
    for (const theme of ['light', 'dark']) {
      nativeTheme.themeSource = theme
      await until(`document.documentElement.dataset.theme === '${theme}'`)
      await delay(150)
      const mismatches = await run(`(() => {
        const mapping = { 'needs-changes':'fix', 'ready-to-merge':'merge', approved:'approved', 'needs-review':'review', 'in-person-review':'review', iterating:'iterating', 'in-progress':'progress' };
        const probe = document.createElement('span'); document.body.append(probe);
        const mismatches = [];
        for (const [state, family] of Object.entries(mapping)) {
          probe.style.color = 'var(--state-' + family + ')'; const expected = getComputedStyle(probe).color;
          for (const e of document.querySelectorAll('.badge.' + state + ', .ledger .tally.' + state)) if (getComputedStyle(e).color !== expected) mismatches.push(state);
        }
        probe.remove(); return mismatches;
      })()`)
      assert.deepEqual(mismatches, [])
      fs.writeFileSync(path.join(evidence, `${name}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
    }
  }
  const pills = `Array.from(document.querySelectorAll('.tabs:not(.ghost) .tab.active .count.split > span')).map(e => [e.className, Number(e.textContent)])`
  await win.loadURL(fixture + '#tab=mine')
  await until(`Boolean(document.querySelector('.subject'))`)
  const expected = [['neg', 1], ['merge', 1], ['pos', 3], ['pending', 2], ['iterating', 1], ['wip', 2]]
  assert.deepEqual(await run(pills), expected)
  assert.equal(await run(`document.querySelectorAll('.group h3 .count, .ledger tr.g .count').length`), 0)
  assert.ok(await run(`document.body.textContent.includes('3 branches')`))
  assert.equal(await run(`document.querySelectorAll('.badge.tally, .family .change-head .tally, .sequence-family-head .tally').length`), 0)
  assert.equal(await run(`document.querySelector('[data-change-number="104"] .badge.approved')?.textContent`), 'Approved')
  assert.equal(await run(`document.querySelectorAll('.chain .badge.private').length`), 0)
  await pair('mine-standard')

  // Click an actual segment: it must not create a View filter.
  await click('.tabs:not(.ghost) .tab.active .count.split > .iterating')
  assert.equal(await run(`document.querySelectorAll('.filter-summary').length`), 0)
  assert.deepEqual(await run(pills), expected)
  await click('.view .split-main')
  await until(`Boolean(document.querySelector('input[placeholder]'))`)
  const input = await run(`Array.from(document.querySelectorAll('input')).map(e => ({placeholder:e.placeholder, type:e.type}))`)
  assert.ok(input.some(i => i.placeholder === 'Search titles'))
  await click('input[placeholder="Search titles"]')
  await win.webContents.insertText('no matching change')
  await until(`document.body.textContent.includes('No change on this tab matches the filter')`)
  assert.deepEqual(await run(pills), expected)
  await click('.empty button.link')
  await until(`Boolean(document.querySelector('.subject'))`)

  // Verify section headings on every tab, using actual tab clicks.
  for (let i = 0; i < 6; i++) {
    await click(`.tabs:not(.ghost) .tab:nth-child(${i + 1})`)
    assert.equal(await run(`document.querySelectorAll('.group h3 .count, .ledger tr.g .count').length`), 0)
  }
  await click('.tabs:not(.ghost) .tab:nth-child(3)')
  await click('button[aria-label="Compact window"]')
  win.setContentSize(680, 1220)
  await until(`Boolean(document.querySelector('.ledger'))`)
  assert.equal(await run(`document.querySelectorAll('.ledger .fh .tally').length`), 0)
  await pair('mine-compact')
  assert.deepEqual(await run(pills), expected)
  for (let i = 0; i < 6; i++) {
    await click(`.tabs:not(.ghost) .tab:nth-child(${i + 1})`)
    assert.equal(await run(`document.querySelectorAll('.ledger tr.g .count').length`), 0)
  }
  await click('.tabs:not(.ghost) .tab:nth-child(3)')
  assert.equal(await run(`document.querySelectorAll('.ledger tr.g .count').length`), 0)
  win.setContentSize(560, 1000)
  await delay(150)
  await pair('mine-narrow')
  const narrow = await run(`(() => { const p = document.querySelector('.tabs .tab.active .count').getBoundingClientRect(); return { pillRight:p.right, viewport:innerWidth, width:document.documentElement.scrollWidth, overflow:Array.from(document.querySelectorAll('body *')).filter(e=>e.getBoundingClientRect().right>innerWidth && !e.closest('.tabs')).slice(0,8).map(e=>e.className) }; })()`)
  console.log('Narrow layout: pills fit; existing action control can overflow', narrow)
  assert.ok(narrow.pillRight <= narrow.viewport)

  // Use the actual canvas tray output. The native macOS menu bar is not tested.
  win.setContentSize(640, 160)
  await run(`(() => { const strip = window.countSummaryFixture.badge.strip; window.fixtureStrip = strip; document.getElementById('root').remove(); const img = document.createElement('img'); img.src = strip.light.dataUrl; img.style.cssText = 'display:block;margin:55px auto;transform:scale(2)'; document.body.append(img); })()`)
  await pair('tray-strip')
  const actions = await run(`window.countSummaryFixture.badge.counts`)
  assert.deepEqual(actions, { review: 1, fix: 1, ready: 3, merge: 1 })

  for (const variant of ['private', 'empty', 'progress']) {
    await win.loadURL(fixture + `?variant=${variant}#tab=mine`)
    await until(`Boolean(document.querySelector('.tabs:not(.ghost) .tab.active')) && !document.body.textContent.includes('Loading...')`)
    if (variant === 'progress') assert.deepEqual(await run(pills), [['wip', 1]])
    else assert.equal(await run(`document.querySelectorAll('.tabs:not(.ghost) .tab.active .count').length`), 0)
    if (variant === 'private') assert.ok(await run(`document.body.textContent.includes('Private')`))
  }
  win.setContentSize(1560, 1220)
  await win.loadURL(fixture + '?variant=private-sequence#tab=mine')
  await until(`Boolean(document.querySelector('[data-change-number="104"] .badge.private'))`)
  assert.equal(await run(`document.querySelectorAll('.chain [data-change-number="104"]').length`), 0)
  assert.equal(await run(`document.querySelectorAll('.chain .badge.private').length`), 0)
  await click('.chain .seq-btn > button')
  await until(`Boolean(document.querySelector('.picker.sequence'))`)
  assert.equal(await run(`document.querySelector('.picker.sequence').textContent.includes('#104')`), false)
  await click('.picker.sequence button.link')
  await pair('private-outside-sequence')
  console.log(JSON.stringify({ platform: process.platform, simulatedData: true, counts: expected, inputChecks: 'passed', nativeMacTray: 'not tested' }))
  clearTimeout(timeout)
  win.destroy()
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
