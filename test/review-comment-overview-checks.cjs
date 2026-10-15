// Runs against the built renderer with real Electron pointer and keyboard input.
const assert = require('node:assert/strict')
const { nativeTheme } = require('electron')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
module.exports = async function checkOverview(win) {
  const run = script => win.webContents.executeJavaScript(script)
  async function until(script, label) {
    for (let i = 0; i < 150; i++) { if (await run(script)) return; await delay(50) }
    throw new Error(label)
  }
  async function key(keyCode, modifiers = []) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await delay(80)
  }
  async function point(selector) {
    return run(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } })()`)
  }
  function input(type, p) { win.webContents.sendInputEvent({ type, ...p, button: 'left', clickCount: 1 }) }
  async function click(p) { input('mouseMove', p); input('mouseDown', p); input('mouseUp', p); await delay(100) }
  async function open() {
    await click(await point('.review-comments summary'))
    await click(await point('.review-comments .review-menu-items button'))
    await until(`Boolean(document.querySelector('.review-comment-overview[open]'))`, 'overview opens')
    assert.equal(await run(`document.activeElement?.classList.contains('review-comment-return')`), true, 'initial focus is on return button')
  }
  const state = () => run(`(async () => ({
    file: document.querySelector('[data-review-path][aria-current="true"]')?.dataset.reviewPath,
    base: document.querySelector('[aria-label="Base patch set"]')?.value,
    patch: document.querySelector('[aria-label="Compared patch set"]')?.value,
    code: [...document.querySelectorAll('.review-editor .view-lines')].map(el => ({ text: el.innerText, top: el.getBoundingClientRect().top })),
    drafts: (await api.fixtureStats()).drafts,
    requests: (await api.fixtureStats()).requests,
    reviewed: (await api.fixtureStats()).reviewedWrites
  }))()`)
  const original = win.getSize()
  const originalTheme = nativeTheme.themeSource
  win.focus(); win.webContents.focus()
  for (const theme of ['light', 'dark']) {
    nativeTheme.themeSource = theme
    for (const size of [[1600, 1000], [420, 760]]) {
      win.setSize(...size)
      await delay(400)
      await open()
      const metrics = await run(`(() => { const d=document.querySelector('.review-comment-overview'), r=d.getBoundingClientRect(); return {ratio:r.width/innerWidth, left:r.left, right:r.right, width:innerWidth, overflow:d.scrollWidth>d.clientWidth, listOverflow:document.querySelector('.review-comment-overview-list').scrollWidth>document.querySelector('.review-comment-overview-list').clientWidth} })()`)
      assert.ok(Math.abs(metrics.ratio - .9) < .01 && metrics.left > 0 && metrics.right < metrics.width, JSON.stringify(metrics))
      assert.equal(metrics.overflow || metrics.listOverflow, false, 'no horizontal overflow in ' + theme + ' at ' + size)
      for (let i=0;i<8;i++) { await key('Tab'); assert.ok(await run(`document.querySelector('.review-comment-overview').contains(document.activeElement)`), 'modal contains keyboard focus') }
      await click(await point('.review-comment-return'))
      await until(`!document.querySelector('.review-comment-overview')`, 'return dismisses')
      assert.ok(await run(`document.activeElement === document.querySelector('.review-comments summary')`), 'focus returns to Comments')
    }
  }
  win.setSize(1600, 720); await delay(400)
  const beforeScroll = (await state()).code
  await run(`Array.from(document.querySelectorAll('.local-review button')).find(button => button.textContent === 'Go to line').click()`)
  await key('Escape'); await key('End', ['control']); await delay(400)
  assert.notDeepEqual((await state()).code, beforeScroll, 'continuity checks start from scrolled code')
  for (const action of ['return', 'escape', 'background']) {
    const before = await state()
    await open()
    assert.equal(await run(`document.getElementById('review-comment-overview-title').textContent`), 'All comments')
    const fixed = await run(`[...document.querySelectorAll('.review-comment-overview > header, .review-comment-overview > .review-comment-filters')].map(el=>el.getBoundingClientRect().top)`)
    const pos = await point('.review-comment-overview-list')
    input('mouseMove', pos)
    win.webContents.sendInputEvent({type:'mouseWheel',...pos,deltaY:-650,deltaX:0})
    await until(`document.querySelector('.review-comment-overview-list').scrollTop > 0`, 'long list scrolls')
    assert.deepEqual(await run(`[...document.querySelectorAll('.review-comment-overview > header, .review-comment-overview > .review-comment-filters')].map(el=>el.getBoundingClientRect().top)`), fixed, 'header and filters stay fixed')
    const rect = await run(`document.querySelector('.review-comment-overview').getBoundingClientRect().toJSON()`)
    const outside = { x: Math.round(rect.x / 2), y: Math.round(rect.y + 80) }
    await click({x:Math.round(rect.x+3), y:Math.round(rect.y+3)})
    assert.ok(await run(`Boolean(document.querySelector('.review-comment-overview[open]'))`), 'padding click stays open')
    await click(await point('#review-comment-overview-title'))
    assert.ok(await run(`Boolean(document.querySelector('.review-comment-overview[open]'))`), 'content click stays open')
    input('mouseDown', await point('#review-comment-overview-title')); input('mouseMove', outside); input('mouseUp', outside); await delay(100)
    assert.ok(await run(`Boolean(document.querySelector('.review-comment-overview[open]'))`), 'inside to outside gesture stays open')
    input('mouseDown', outside); input('mouseMove', await point('#review-comment-overview-title')); input('mouseUp', await point('#review-comment-overview-title')); await delay(100)
    assert.ok(await run(`Boolean(document.querySelector('.review-comment-overview[open]'))`), 'outside to inside gesture stays open')
    await key('a'); await key('j')
    assert.equal(await run(`Boolean(document.querySelector('.review-send-dialog'))`), false, 'review shortcuts do not run behind overview')
    if (action === 'return') await click(await point('.review-comment-return'))
    else if (action === 'escape') await key('Escape')
    else await click(outside)
    await until(`!document.querySelector('.review-comment-overview')`, action + ' closes overview')
    assert.ok(await run(`Boolean(document.querySelector('.local-review[open]'))`), 'review stays open')
    assert.ok(await run(`document.activeElement === document.querySelector('.review-comments summary')`), 'dismissal restores visible focus')
    assert.deepEqual(await state(), before, action + ' preserves file, comparison, code position, drafts, requests, and review flags')
  }
  await open()
  await click(await point('.review-comment-overview [data-review-thread-id="single"] > .review-comment-location'))
  await until(`!document.querySelector('.review-comment-overview') && Boolean(document.activeElement?.closest('.review-editor'))`, 'location navigation returns focus to code')
  win.setSize(...original); nativeTheme.themeSource = originalTheme; await delay(400)
  console.log('Overview: both themes, desktop/narrow layout, focus containment, fixed controls, safe pointer dismissal, Escape, and review continuity passed')
}
