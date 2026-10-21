const assert = require('node:assert/strict')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
const draft = '[aria-label="Draft comment"]'
const longMessage = Array.from({ length: 30 }, (_, i) => `${String(i + 1).padStart(2, '0')} Review this part of the long comment.`).join('\n')

function controls(win) {
  const run = script => win.webContents.executeJavaScript(script)
  async function press(keyCode, modifiers = []) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
    await delay(80)
  }
  async function until(script) {
    for (let i = 0; i < 100; i++) { if (await run(`(async () => (${script}))()`)) return; await delay(100) }
    throw new Error('Timed out: ' + script)
  }
  async function button(text, scope = '.local-review') {
    await run(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(button => button.textContent === ${JSON.stringify(text)}).click()`)
    await delay(120)
  }
  async function wheel(selector, deltaY) {
    const box = await run(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)
    const x = Math.round(box.x + Math.min(box.width / 2, 70)), y = Math.round(box.y + Math.min(box.height / 2, 35))
    assert.ok(y > 0 && y < 960, 'wheel target is visible')
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
    win.webContents.sendInputEvent({ type: 'mouseWheel', x, y, deltaY, deltaX: 0, wheelTicksY: deltaY / 120, canScroll: true })
    await delay(220)
  }
  async function panes() {
    return run(`[...document.querySelectorAll('.monaco-editor .margin-view-overlays')].map(pane => { const line = pane.querySelector('.line-numbers'); return { line: line?.textContent, top: line?.getBoundingClientRect().top } })`)
  }
  async function fill(selector, text) {
    await run(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    await press('a', ['control']); await win.webContents.insertText(text)
    await press('Home', ['control']); await delay(1000)
  }
  return { run, press, until, button, wheel, panes, fill }
}

async function checkField(win, selector = draft) {
  const { run, press, until, wheel, panes } = controls(win)
  await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit'`)
  const value = () => run(`(() => { const f = document.querySelector(${JSON.stringify(selector)}), active = document.activeElement; return { text: f.value, top: f.scrollTop, max: f.scrollHeight - f.clientHeight, height: f.clientHeight, focus: active?.tagName + ':' + active?.getAttribute('aria-label') + ':' + (active?.tagName === 'BUTTON' ? active.textContent : ''), dialogTop: f.closest('dialog')?.scrollTop } })()`)
  const before = await value(), code = await panes(), initialStats = await run('api.fixtureStats()'), writes = initialStats.commentWrites.length
  assert.ok(before.max > 100, 'test field overflows')
  // Supplement the real scrolling checks with a routing check for zoom input.
  // Intercept at the parent so this synthetic event cannot zoom the test UI.
  assert.ok(await run(`(() => { const field=document.querySelector(${JSON.stringify(selector)}), parent=field.closest('form').parentElement; let reached=false; const listener=event=>{reached=true;event.stopPropagation()}; parent.addEventListener('wheel',listener,{once:true}); const event=new WheelEvent('wheel',{deltaY:100,ctrlKey:true,bubbles:true,cancelable:true});field.dispatchEvent(event);parent.removeEventListener('wheel',listener);return reached && !event.defaultPrevented })()`), 'modified zoom wheel passes through the composer')
  await wheel(selector, -100)
  assert.ok((await value()).top > before.top, 'real wheel scrolls text down')
  await wheel(selector, 100)
  assert.ok((await value()).top < before.top + 20, 'real wheel scrolls text up')
  for (let i = 0; i < 14 && (await value()).top < before.max; i++) await wheel(selector, -200)
  const bottom = await value()
  assert.ok(Math.abs(bottom.top - bottom.max) < 2, 'last line is reachable: ' + JSON.stringify(bottom))
  await wheel(selector, -100)
  assert.equal((await value()).top, bottom.top, 'bottom boundary stays fixed')
  for (let i = 0; i < 14 && (await value()).top > 0; i++) await wheel(selector, 200)
  assert.equal((await value()).top, 0, 'first line is reachable')
  await wheel(selector, 100)
  const top = await value()
  assert.equal(top.top, 0, 'top boundary stays fixed')
  assert.deepEqual(await panes(), code, 'both code panes stay fixed')
  assert.equal(top.text, before.text); assert.equal(top.height, before.height)
  assert.equal(top.focus, before.focus); assert.equal(top.dialogTop, before.dialogTop)
  // Move focus away with a real key, then scroll the hovered field.
  await press('Tab')
  const unfocused = (await value()).focus
  await wheel(selector, -100)
  assert.ok((await value()).top > 0, 'hovered field scrolls without keyboard focus')
  assert.equal((await value()).focus, unfocused)
  assert.equal((await run('api.fixtureStats()')).commentWrites.length, writes, 'scrolling sends no draft writes')
  assert.equal((await run('api.fixtureStats()')).requests, initialStats.requests, 'scrolling does not refetch source')
  await run(`document.querySelector(${JSON.stringify(selector)}).focus({ preventScroll: true })`)
  console.log(JSON.stringify({ internalFieldScroll: 'passed', selector, before: { top: before.top, max: before.max }, bottom: bottom.top, panes: code }))
}

async function checkEditing(win) {
  const { run, press, until, button, wheel, panes, fill } = controls(win)
  // The caller leaves a long, autosaved new draft open in unified mode.
  await run(`document.querySelector(${JSON.stringify(draft)}).focus()`)
  await press('End', ['control'])
  assert.equal(await run(`document.activeElement.selectionStart`), longMessage.length, 'keyboard reaches last character')
  await press('Home', ['control']); await press('End', ['shift'])
  assert.ok(await run('document.activeElement.selectionEnd > document.activeElement.selectionStart'), 'native selection remains usable')
  await press('Home', ['control']); await wheel(draft, 2000)
  // Use the native scrollbar thumb, then resize the native corner handle.
  const box = await run(`document.querySelector(${JSON.stringify(draft)}).getBoundingClientRect().toJSON()`)
  async function drag(x, y, endX, endY) {
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
    win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
    for (let i = 1; i <= 10; i++) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(x + (endX - x) * i / 10), y: Math.round(y + (endY - y) * i / 10), button: 'left', modifiers: ['leftbuttondown'] })
      await delay(20)
    }
    win.webContents.sendInputEvent({ type: 'mouseUp', x: endX, y: endY, button: 'left', clickCount: 1 })
    await delay(300)
  }
  await drag(Math.round(box.right - 7), Math.round(box.top + 25), Math.round(box.right - 7), Math.round(box.bottom - 20))
  assert.ok(await run(`document.querySelector(${JSON.stringify(draft)}).scrollTop > 0`), 'native scrollbar drag moves text')
  const shorter = longMessage.split('\n').slice(0, 8).join('\n')
  await fill(draft, shorter)
  const codeBeforeResize = await panes()
  const resize = await run(`document.querySelector(${JSON.stringify(draft)}).getBoundingClientRect().toJSON()`)
  await drag(Math.round(resize.right - 3), Math.round(resize.bottom - 3), Math.round(resize.right - 3), Math.round(resize.bottom + 145))
  assert.ok(await run(`document.querySelector(${JSON.stringify(draft)}).clientHeight > ${resize.height + 100}`), 'native resize handle grows the field')
  assert.deepEqual(await panes(), codeBeforeResize, 'resizing preserves code position')
  assert.ok(await run(`(() => { const f=document.querySelector(${JSON.stringify(draft)}); return f.scrollHeight <= f.clientHeight })()`), 'resized text fits')
  await wheel(draft, -100)
  assert.notDeepEqual(await panes(), codeBeforeResize, 'a field that fits lets the diff scroll')
  const beforeControl = await panes()
  await wheel('.review-comment-compose > button', -100)
  assert.notDeepEqual(await panes(), beforeControl, 'scrolling over comment controls moves the diff')
  await button('Cancel', '.review-comment-compose')
  await until(`!document.querySelector('.review-comment-compose')`)

  async function goToLine(line) {
    await button('Go to line'); await press('a', ['control']); await win.webContents.insertText(':' + line); await press('Enter'); await delay(350)
  }
  await goToLine(2)
  await button('Reply', '[data-review-thread-id="published-1"]')
  await until(`document.activeElement?.getAttribute('aria-label') === 'Draft comment'`)
  await fill(draft, longMessage); await checkField(win)
  await button('Save', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`)
  const reply = (await run('api.fixtureStats()')).drafts[0]
  assert.equal(reply.in_reply_to, 'published-1'); assert.equal(reply.line, 2); assert.equal(reply.patch_set, 3)
  await button('Edit', '.comment-draft'); await delay(700)
  await run(`document.querySelector(${JSON.stringify(draft)}).focus()`); await press('Home', ['control'])
  await checkField(win)
  await fill(draft, longMessage + '\nEdited after scrolling.')
  const edited = (await run('api.fixtureStats()')).drafts[0]
  assert.equal(edited.id, reply.id); assert.equal(edited.in_reply_to, reply.in_reply_to); assert.equal(edited.line, reply.line)
  await button('Cancel', '.review-comment-compose')
  await until(`!document.querySelector('.review-comment-compose')`)
  assert.equal((await run('api.fixtureStats()')).drafts[0].message, longMessage, 'Cancel restores existing draft')
  await button('Discard draft', '.comment-draft')
  await until(`(await api.fixtureStats()).drafts.length === 0`)

  // Seed an older suggestion, then scroll its ordinary message editor.
  // Replacement authoring controls are removed by the companion feature.
  await run(`api.saveReviewDraft('telemetry~main~Idemo', 3, { path: 'src/telemetry/batch-scheduler.ts', line: 1, side: 'REVISION', message: ${JSON.stringify(longMessage)}, range: { start_line: 1, start_character: 0, end_line: 1, end_character: 10 }, fix_suggestions: [{ description: 'Stored suggestion', replacements: [{ path: 'src/telemetry/batch-scheduler.ts', range: { start_line: 1, start_character: 0, end_line: 1, end_character: 10 }, replacement: '// Stored replacement' }] }], unresolved: true })`)
  await button('Close review'); await run(`document.querySelector('.review-main').click()`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady === 'true' && Boolean(document.querySelector('.comment-draft'))`)
  const storedSuggestion = (await run('api.fixtureStats()')).drafts[0].fix_suggestions
  await button('Edit', '.comment-draft'); await fill(draft, longMessage + '\nUpdated comment.')
  assert.ok(await run(`!document.querySelector('[aria-label="Suggested replacement"]')`), 'replacement editor stays absent')
  await checkField(win)
  await button('Save', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`)
  const suggested = (await run('api.fixtureStats()')).drafts[0]
  assert.deepEqual(suggested.fix_suggestions, storedSuggestion, 'scrolling and saving preserve stored suggestions')
  assert.ok(suggested.range); assert.equal(suggested.line, 1)
  await button('Discard draft', '.comment-draft'); await until(`(await api.fixtureStats()).drafts.length === 0`)
  console.log(JSON.stringify({ keyboard: 'passed', scrollbarDrag: 'passed', nativeResize: 'passed', replyAndEdit: 'passed', suggestions: 'passed' }))
}

async function checkFallback(win) {
  const { run, until, button, fill, wheel } = controls(win)
  await run('api.fixtureDiffUnavailable(true)')
  await button('Close review')
  await run(`document.querySelector('.review-main').click()`)
  await until(`document.querySelector('.review-message[role="alert"]')?.textContent.includes('Fixture: diff is unavailable')`)
  await run(`document.querySelector('.review-comments summary').click()`)
  await button('File comment', '.review-comments')
  await until(`Boolean(document.querySelector('dialog .review-comment-compose'))`)
  await fill(draft, longMessage)
  win.setContentSize(1440, 600)
  await run(`document.querySelector('[aria-label="Draft comment"]').style.height = '280px'`)
  await delay(300)
  assert.ok(await run(`document.querySelector('.review-send-dialog').scrollHeight > document.querySelector('.review-send-dialog').clientHeight`), 'fallback dialog has real outer overflow')
  await checkField(win)
  const before = await run(`document.querySelector('.review-send-dialog').scrollTop`)
  await wheel(draft, -100)
  assert.equal(await run(`document.querySelector('.review-send-dialog').scrollTop`), before)
  await wheel('.review-send-dialog h2', -100)
  assert.ok(await run(`document.querySelector('.review-send-dialog').scrollTop > ${before}`), 'scrolling outside the field moves the fallback dialog')
  await button('Cancel', '.review-comment-compose')
  await until(`!document.querySelector('.review-comment-compose')`)
  console.log(JSON.stringify({ fallbackComposer: 'passed' }))
}

module.exports = { controls, checkField, checkEditing, checkFallback, longMessage, draft }
