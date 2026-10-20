// Real Electron renderer and OS pointer/keyboard input with simulated Gerrit data.
// Start Vite first. See docs/testing.md for the isolated Linux harness command.
const { app, BrowserWindow, nativeTheme } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawn } = require('node:child_process')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'gerrit-tooltips-')))
app.disableHardwareAcceleration()
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => app.exit(2), 360000)
const evidence = path.join(__dirname, '../docs/screenshots/dashboard-tooltips')
const videos = path.join(__dirname, '../docs/videos/dashboard-tooltips')
fs.mkdirSync(evidence, { recursive: true })
const recordings = process.env.TOOLTIP_RECORDINGS === '1'
let recorder
app.whenReady().then(async () => {
  const win = new BrowserWindow({ x: 0, y: 0, width: 1560, height: 1040, frame: false, useContentSize: true, webPreferences: { contextIsolation: true, sandbox: true } })
  const errors = []
  win.webContents.on('console-message', ({ level, message }) => { if (level === 'error') errors.push(message) })
  const run = async script => { try { return await win.webContents.executeJavaScript(script) } catch (error) { throw new Error(`${error.message}\nScript: ${script}\nRenderer: ${errors.join('; ')}`) } }
  const xd = (...args) => execFileSync('xdotool', args.map(String))
  const row = id => `[data-change-number="${id}"]`
  const conflict = `${row(102)} .conflict-mark`
  const passed = `${row(102)} .ci-mark`
  const failed = `${row(106)} .ci-mark`
  async function until(script) {
    for (let i = 0; i < 100; i++) { if (await run(script)) return; await delay(50) }
    throw new Error('Timed out: ' + script)
  }
  async function point(selector) {
    return run(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) throw new Error(${JSON.stringify(selector)}); const r = e.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2)} })()`)
  }
  async function move(selector, slow = false) {
    await run(`document.querySelector(${JSON.stringify(selector)})?.scrollIntoView({block:'nearest',inline:'nearest'})`)
    await delay(80)
    const target = await point(selector)
    const bounds = win.getContentBounds()
    const start = xd('getmouselocation', '--shell').toString()
    const x = Number(/X=(\d+)/.exec(start)?.[1] ?? 0), y = Number(/Y=(\d+)/.exec(start)?.[1] ?? 0)
    const steps = slow ? 20 : 1
    for (let i = 1; i <= steps; i++) {
      xd('mousemove', Math.round(x+(target.x+bounds.x-x)*i/steps), Math.round(y+(target.y+bounds.y-y)*i/steps))
      if (slow) await delay(30)
    }
    await delay(slow ? 2000 : 400)
  }
  async function click(selector) { await move(selector); xd('click', 1); await delay(150) }
  async function key(key) { xd('key', '--clearmodifiers', key); await delay(80) }
  async function reset() {
    const bounds = win.getContentBounds()
    xd('mousemove', bounds.x + bounds.width - 20, bounds.y + bounds.height - 20)
    await key('Escape')
    // Click a blank area to release keyboard focus without running an action.
    xd('click', 1)
    await delay(150)
  }
  async function tooltip(selector, text) {
    await reset()
    const before = await run(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return [r.width,r.height] })()`)
    await move(selector)
    await until(`document.querySelector('[role="tooltip"]')?.textContent === ${JSON.stringify(text)}`)
    const result = await run(`(() => { const e=document.querySelector(${JSON.stringify(selector)}); const t=document.getElementById(e.getAttribute('aria-describedby')); const r=t.getBoundingClientRect(); const b=e.getBoundingClientRect(); return {title:e.title, rect:[b.width,b.height], text:t.textContent, fits:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight} })()`)
    assert.equal(result.title, '')
    assert.equal(result.text, text)
    assert.equal(result.fits, true)
    assert.deepEqual(result.rect, before)
  }
  async function caption(text) {
    await run(`(() => { let e=document.getElementById('evidence-caption'); if (!e) { e=document.createElement('div'); e.id='evidence-caption'; e.style.cssText='position:fixed;left:0;right:0;bottom:0;padding:12px 20px;background:var(--bg);color:var(--fg);border-top:1px solid var(--border);font:16px system-ui;z-index:2000;pointer-events:none';document.body.append(e) } e.textContent=${JSON.stringify(text)} })()`)
  }
  async function keyboardFocus(selector) {
    // Use real Tab input. DOM inspection only identifies when the target is reached.
    for (let i = 0; i < 180; i++) {
      await key('Tab')
      if (await run(`document.activeElement === document.querySelector(${JSON.stringify(selector)})`)) return
    }
    throw new Error('Tab did not reach ' + selector)
  }
  const fixture = `http://localhost:5173/@fs${path.join(__dirname, 'fixtures/count-summary.html')}?variant=conflict#tab=mine`
  for (const layout of process.env.TOOLTIP_LAYOUT ? [process.env.TOOLTIP_LAYOUT] : ['standard', 'compact']) {
    await win.loadURL(fixture)
    await until(`Boolean(document.querySelector(${JSON.stringify(conflict)}))`)
    if (layout === 'compact') {
      await click('[aria-label="Compact window"]')
      win.setContentSize(960, 1040)
      await until(`Boolean(document.querySelector('.ledger'))`)
    } else win.setContentSize(1560, 1040)
    // Freeze relative ages so paired captures show the same fixture text.
    await run(`window.Date.now=()=>Date.parse(countSummaryFixture.changes[0].updated.replace(' ','T')+'Z')+10000;countSummaryFixture.changes.find(c=>c._number===109).unresolved_comment_count=3;void 0`)
    await click('[aria-label="Refresh"]')
    // Add fixture observations, not alternate UI handlers.
    await run(`window.countSummaryFixture.actions=[]; window.api.act=async action=>countSummaryFixture.actions.push(action); window.countSummaryFixture.opens=[];window.api.openChange=async link=>countSummaryFixture.opens.push(link);void 0`)
    for (const theme of ['light', 'dark']) {
      console.log('Checking', layout, theme)
      nativeTheme.themeSource = theme
      await until(`document.documentElement.dataset.theme === '${theme}'`)
      await run('window.scrollTo(0,0)')
      await tooltip(conflict, 'Merge conflict with main')
      fs.writeFileSync(path.join(evidence, `conflict-${layout}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
      // Crossing into the tooltip must not close it; Escape must keep it closed.
      await move('[role="tooltip"]')
      await delay(400)
      assert.equal(await run(`Boolean(document.querySelector('[role="tooltip"]'))`), true)
      await key('Escape')
      await delay(400)
      assert.equal(await run(`Boolean(document.querySelector('[role="tooltip"]'))`), false)
      await tooltip(passed, 'CI checks passed. Verified +1 on patch set 2.')
      await tooltip(failed, 'CI checks failed. Verified -1 on patch set 2.')
      fs.writeFileSync(path.join(evidence, `ci-failed-${layout}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
      const step = layout === 'standard' ? '.chain .step.done' : '.ledger .step.done'
      const stepText = await run(`(() => { const el=document.querySelector(${JSON.stringify(step)}); const row=el.closest('[data-change-number]'); return row?.dataset.changeNumber==='102' ? 'Step 2: Ready to Merge' : 'Step 4: Approved' })()`)
      // First complete step is the ready-to-merge second sequence member.
      await tooltip(step, stepText)
      await tooltip(layout === 'standard' ? '.family .change-head .badge.branch' : '.ledger .fh .status-icon:has(svg circle[cx="18"])', '3 related branches. Change-Id Itelemetry')
      await tooltip(layout === 'standard' ? '.chain .badge.chain' : '.ledger tr[id^="sequence:"] .status-icon', '5 changes built on each other on main; review them from the top down')
      await tooltip(`${row(109)} ${layout === 'standard' ? '.unresolved' : '.unresolved-count'}`, '3 unresolved comment threads')
      await tooltip(`${row(112)} .badge.private`, 'Private: only the owner, the reviewers and the CCs can see this change in Gerrit')
      await tooltip('.topbar [aria-label="Settings"]', 'Settings')
      fs.writeFileSync(path.join(evidence, `edge-${layout}-${theme}.png`), (await win.webContents.capturePage()).toPNG())
      assert.equal(await run(`document.querySelectorAll('.sizer [tabindex="0"],.tabs.ghost [tabindex="0"]').length`), 0)
      await reset()
      // Focus a real control by click, then reach the status icon with Tab.
      await click(layout === 'standard' ? `${row(102)} .c-num button` : `${row(102)} button.t`)
      await keyboardFocus(conflict)
      await until(`document.querySelector('[role="tooltip"]')?.textContent === 'Merge conflict with main'`)
      assert.equal(await run(`document.querySelector(${JSON.stringify(conflict)}).matches(':focus-visible')`), true)
      await key('Escape')
      assert.equal(await run(`document.activeElement === document.querySelector(${JSON.stringify(conflict)}) && !document.querySelector('[role="tooltip"]')`), true)
      await delay(400)
      assert.equal(await run(`Boolean(document.querySelector('[role="tooltip"]'))`), false)
      // A layout unmount must remove the portal and leave no stale timers.
      await key('Tab')
      await until(`document.querySelector('[role="tooltip"]')?.textContent.startsWith('CI checks passed')`)
      await click(layout === 'standard' ? '[aria-label="Compact window"]' : '[aria-label="Expand"]')
      await until(`!document.querySelector('[role="tooltip"]')`)
      await click(layout === 'standard' ? '[aria-label="Expand"]' : '[aria-label="Compact window"]')
      await delay(400)
      assert.equal(await run(`Boolean(document.querySelector('[role="tooltip"]'))`), false)
    }
    // Refresh must replace tooltip context and preserve unknown/no-vote display rules.
    await run(`(() => { const c=countSummaryFixture.changes.find(c=>c._number===102);c.branch='release-test';c.labels.Verified.all[0].value=2 })()`)
    await click('[aria-label="Refresh"]')
    await tooltip(conflict, 'Merge conflict with release-test')
    await tooltip(passed, 'CI checks passed. Verified +2 on patch set 2.')
    await run(`(() => { const c=countSummaryFixture.changes.find(c=>c._number===102);c.branch='main';c.labels.Verified.all[0].value=1 })()`)
    await click('[aria-label="Refresh"]')
    assert.equal(await run(`document.querySelectorAll('${row(109)} .ci-mark').length`), 0)
    assert.equal(await run(`document.querySelectorAll('${row(108)} .conflict-mark').length`), 0)
    // Existing split actions and reviewer handlers still run through real input.
    if (layout === 'compact') await click(`${row(101)} td.r`)
    const actionRow = layout === 'standard' ? row(101) : `${row(101)} + .ldetail`
    const caret = `${row(103)} ${layout === 'standard' ? '.c-actions ' : ''}.split-caret`
    await click(caret)
    await until(`Boolean(document.querySelector('.menu'))`)
    await key('Escape')
    await move(`${actionRow} .chip`); await click(`${actionRow} .chip-x`)
    await until('countSummaryFixture.actions.length === 1')
    await key('Return')
    await until('countSummaryFixture.actions.length === 2')
    assert.equal(await run('countSummaryFixture.actions[0].type'), 'hashtag')
    await reset()
    await tooltip(`${actionRow} .chip.add`, 'Add a primary reviewer, or a reviewer who is not waited for')
    await click(`${actionRow} .chip.add`)
    await until(`Boolean(document.querySelector('[aria-label="Add reviewers"]'))`)
    await key('Escape')
    if (layout === 'compact') await click(`${row(102)} td.r`)
    await click(layout === 'standard' ? `${row(102)} .c-actions .split-caret` : `${row(102)} + .ldetail .split-caret`)
    await until(`Boolean(document.querySelector('[aria-label="Ask to merge"]'))`)
    await key('Escape')
    if (layout === 'standard') {
      await click(`${row(101)} .c-wip .split-caret`)
      await until(`Boolean(document.querySelector('.menu'))`)
      await key('Escape')
    }
    await click('[aria-label="Settings"]')
    await until(`document.querySelector('[aria-label="Settings"]').getAttribute('aria-pressed') === 'true'`)
    await key('Return')
    await until(`document.querySelector('[aria-label="Settings"]').getAttribute('aria-pressed') === 'false'`)
    await click('.view .split-caret')
    await until(`Boolean(document.querySelector('.view-panel'))`)
    await key('Escape')
    // Check a disabled control's help while its actual refresh is pending.
    await run(`window.countSummaryFixture.fetch=window.api.fetchDashboard;window.api.fetchDashboard=async()=>{await new Promise(r=>setTimeout(r,1500));return countSummaryFixture.fetch()};void 0`)
    await click('[aria-label="Refresh"]')
    xd('mousemove', 200, 30)
    await move('[aria-label="Refresh"]')
    await until(`document.querySelector('[aria-label="Refresh"]').disabled && Boolean(document.querySelector('[role="tooltip"]'))`)
    await until(`!document.querySelector('[aria-label="Refresh"]').disabled`)
    await run(`window.api.fetchDashboard=countSummaryFixture.fetch;void 0`)
    if (recordings) {
      fs.mkdirSync(videos, { recursive: true })
      for (const theme of ['light', 'dark']) {
        nativeTheme.themeSource=theme
        await until(`document.documentElement.dataset.theme === '${theme}'`)
        await run('window.scrollTo(0,0)')
        await reset()
        await caption('Hover over the warning to read the merge conflict explanation.')
        const output=path.join(videos, `help-${layout}-${theme}.mp4`)
        recorder=spawn('ffmpeg',['-y','-loglevel','error','-f','x11grab','-draw_mouse','1','-framerate','25','-video_size',`${layout==='standard'?1560:960}x1040`,'-i',`${process.env.DISPLAY}+0,0`,'-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p','-movflags','+faststart',output],{stdio:['pipe','ignore','inherit']})
        await delay(800)
        await move(conflict,true)
        await delay(1000)
        await caption('The green check means CI checks passed for this patch set.')
        await move(passed,true)
        await delay(1000)
        await caption('The red X means CI checks failed for this patch set.')
        await move(failed,true)
        await delay(1000)
        await caption(layout === 'standard' ? 'Click the change number, then press Tab to focus the conflict icon.' : 'Click the change title, then press Tab to focus the conflict icon.')
        await move(layout==='standard'?`${row(102)} .c-num button`:`${row(102)} button.t`,true)
        xd('click',1)
        await keyboardFocus(conflict)
        await delay(2000)
        await caption('Press Escape to close help. The icon keeps keyboard focus.')
        await delay(800)
        await key('Escape')
        await delay(2000)
        recorder.stdin.write('q')
        await new Promise(resolve=>recorder.once('exit',resolve))
        recorder=undefined
      }
      await run(`document.getElementById('evidence-caption')?.remove()`)
    }
  }
  assert.deepEqual(errors, [])
  console.log('Dashboard tooltip checks passed on Linux: real pointer and keyboard input, themes, layouts, edge placement, context refresh, dismissal, unmount, and retained actions. Gerrit data is simulated.')
  clearTimeout(timeout)
  win.destroy()
  app.quit()
}).catch(error => { console.error(error); recorder?.stdin.write('q'); app.exit(1) })
