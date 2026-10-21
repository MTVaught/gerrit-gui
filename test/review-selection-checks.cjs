// Real editor input against the existing simulated Gerrit preload.
const assert = require('node:assert/strict')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
module.exports = async function checkSelections(win) {
  const run = script => win.webContents.executeJavaScript(script)
  const stats = () => run('api.fixtureStats()')
  async function until(script, label = script) {
    for (let i = 0; i < 180; i++) { if (await run(`(async () => (${script}))()`)) return; await delay(50) }
    throw Error('Selection check: ' + label + '\n' + await run(`document.querySelector('.local-review')?.innerText`))
  }
  async function press(keyCode, modifiers = []) {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode, modifiers }); await delay(90)
  }
  async function click(expression, button = 'left') {
    const p = await run(`(() => { const n=(${expression}); if (!n) throw Error('Missing click target'); const r=n.getBoundingClientRect(); return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)} })()`)
    win.webContents.sendInputEvent({ type: 'mouseMove', ...p })
    win.webContents.sendInputEvent({ type: 'mouseDown', ...p, button, clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', ...p, button, clickCount: 1 }); await delay(140)
  }
  async function button(text, scope = '.local-review') {
    const expression = `Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(n=>n.textContent.trim()===${JSON.stringify(text)})`
    await until(`Boolean((${expression})) && !(${expression}).disabled`, text + ' is enabled')
    await click(expression)
  }
  async function choose(label, value) {
    await run(`(() => { const n=document.querySelector('[aria-label="${label}"]'); n.value=${JSON.stringify(value)}; n.dispatchEvent(new Event('change',{bubbles:true})) })()`)
    await until(`document.querySelector('.review-editor')?.dataset.reviewReady==='true'`); await delay(180)
  }
  async function focus(pane = 'modified') {
    if (!await run(`document.querySelector('[aria-label="More review actions"]').parentElement.open`)) await click(`document.querySelector('[aria-label="More review actions"]')`)
    await button('Go to line', '.review-menu[open]'); await press('Escape')
    if (!await run(`Boolean(document.querySelector('.review-side-head.unified'))`)) await press(pane === 'original' ? 'Left' : 'Right', ['shift'])
    await press('Home', ['control'])
  }
  async function select(pane = 'modified', reverse = false, rows = 1) {
    await focus(pane)
    if (reverse) { await press('Down'); await press('Up', ['shift']) }
    else { for(let i=0;i<rows;i++) await press('Down', ['shift']) }
  }
  async function add(context = false) {
    if (context) {
      await press('F10', ['shift'])
      await until(`Array.from((document.querySelector('.shadow-root-host')?.shadowRoot ?? document).querySelectorAll('.action-label')).some(n=>n.textContent==='Add review comment')`, 'editor context menu')
      await press('Home'); await press('Enter')
    } else await press('c')
    await until(`document.querySelector('[aria-label="Draft comment"]')?.getBoundingClientRect().height>0`)
  }
  async function placed(pane, line = 1) {
    assert.equal(await run(`document.querySelector('.review-comment-compose').closest('.review-inline-zone').getAttribute('aria-label')`), `${pane === 'original' ? 'Original' : 'Modified'} comments after line ${line}`)
  }
  async function saveText(text) {
    await win.webContents.insertText(text)
    await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent==='Saved to Gerrit'`)
    return (await stats()).drafts.at(-1)
  }
  async function cancel() { await button('Cancel', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`) }
  async function discard() { await button('Discard draft', '.comment-draft'); await until(`(await api.fixtureStats()).drafts.length===0`) }
  function anchor(draft, patchSet, side, length) {
    assert.deepEqual([draft.patch_set, draft.side, draft.path, draft.line, draft.range], [patchSet, side, 'src/telemetry/batch-scheduler.ts', 1, {start_line:1,start_character:0,end_line:1,end_character:length}])
  }
  win.focus(); win.webContents.focus()
  await choose('Base patch set', 'base')
  const initial = await stats()
  assert.equal(initial.drafts.length, 0)
  // Both entry points and split panes, including reverse selection.
  for (const pane of ['modified', 'original']) for (const context of [false, true]) {
    console.log('Selection input', pane, context ? 'context' : 'shortcut')
    await select(pane, context); await add(context); await placed(pane)
    const draft = await saveText(`Boundary ${pane} ${context}`)
    anchor(draft, 3, pane === 'original' ? 'PARENT' : 'REVISION', '// Comparing base to patch set 3'.length)
    await cancel(); await until(`(await api.fixtureStats()).drafts.length===0`)
  }
  assert.equal((await stats()).requests, initial.requests, 'comment actions keep the full-file cache')
  await choose('Base patch set', '2')
  const baseRequests = (await stats()).requests
  await select('original'); await add(true); await placed('original')
  anchor(await saveText('Older base selection'), 2, 'REVISION', '// Comparing 2 to patch set 3'.length)
  await cancel()
  // The modified source is the selectable code pane in unified mode.
  await focus(); await press('m'); await until(`Boolean(document.querySelector('.review-side-head.unified'))`)
  for (const context of [false, true]) {
    console.log('Selection input unified', context ? 'context' : 'shortcut')
    await select(); await add(context); await placed('modified')
    anchor(await saveText('Unified boundary'), 3, 'REVISION', '// Comparing 2 to patch set 3'.length)
    await cancel()
  }
  assert.equal((await stats()).requests, baseRequests)
  await focus(); await press('m'); await until(`!document.querySelector('.review-side-head.unified')`)
  await choose('Base patch set', 'base')
  // A narrow pane wraps line 1. Keyboard selection traverses its display rows.
  const size = win.getSize()
  win.setSize(800, 1000); await delay(500)
  await focus()
  const rows = await run(`(() => { const nodes=Array.from(document.querySelectorAll('.modified-in-monaco-diff-editor .line-numbers')); const first=nodes.find(n=>n.textContent==='1').getBoundingClientRect(); const second=nodes.find(n=>n.textContent==='2').getBoundingClientRect(); return Math.round((second.top-first.top)/first.height) })()`)
  assert.ok(rows > 1, 'line 1 wraps in the narrow pane')
  console.log('Selection input wrapped', rows, 'display rows')
  const beforeWrapped = (await stats()).requests
  await select('modified', false, rows); await add(); await placed('modified')
  const wrapped = await saveText('Wrapped selection stays on source line 1.')
  anchor(wrapped, 3, 'REVISION', '// Comparing base to patch set 3'.length)
  await button('Save', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`)
  assert.equal((await stats()).requests, beforeWrapped)
  win.setSize(...size); await delay(300)
  await button('Close review'); await click(`document.querySelector('.review-main')`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady==='true' && Boolean(document.querySelector('.comment-draft'))`)
  const reopened = (await stats()).requests
  await button('Edit', '.comment-draft'); await placed('modified')
  anchor((await stats()).drafts[0], 3, 'REVISION', '// Comparing base to patch set 3'.length)
  await button('Suggest replacement for selected range', '.review-comment-compose')
  await click(`document.querySelector('[aria-label="Suggested replacement"]')`)
  await win.webContents.insertText('// Replacement preserves the existing newline')
  await until(`(await api.fixtureStats()).drafts[0].fix_suggestions?.[0].replacements[0].replacement==='// Replacement preserves the existing newline'`)
  assert.deepEqual((await stats()).drafts[0].fix_suggestions[0].replacements[0].range, wrapped.range)
  await button('Save', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`)
  await discard()
  assert.equal((await stats()).requests, reopened)
  assert.ok(await run(`document.querySelectorAll('.review-editor .view-lines>div').length<300`), 'large files stay virtualized')
  win.setSize(...size); await delay(300)
  // Newline-only input must not produce a zero-width suggested replacement.
  await focus(); await press('End'); await press('Down', ['shift']); await press('Home', ['shift']); await press('Home', ['shift']); await add(); await placed('modified')
  assert.ok(await run(`!Array.from(document.querySelectorAll('.review-comment-compose button')).some(n=>n.textContent==='Suggest replacement for selected range')`))
  assert.equal((await saveText('Only the newline')).range, undefined)
  await cancel()
  // Stored ranges and replacement ranges are not fresh selections.
  await run('api.fixtureSelectionComments()')
  await button('Close review'); await click(`document.querySelector('.review-main')`)
  await until(`Boolean(document.querySelector('[data-review-comment-id="boundary-stored"]'))`)
  const stored = (await stats()).drafts[0]
  await button('Edit', '.comment-draft'); await placed('modified', 2)
  await press('End', ['control']); await win.webContents.insertText(' edited')
  await until(`(await api.fixtureStats()).drafts[0].message.endsWith(' edited')`)
  const edited = (await stats()).drafts[0]
  assert.deepEqual(edited.range, stored.range)
  assert.deepEqual(edited.fix_suggestions[0].replacements, stored.fix_suggestions[0].replacements)
  await cancel(); await discard()
  await button('Reply', '[data-review-thread-id="boundary-stored"]')
  const reply = await saveText('Keep the original stored boundary.')
  assert.equal(reply.in_reply_to, 'boundary-stored'); assert.equal(reply.line, 2)
  assert.deepEqual(reply.range, stored.range)
  await cancel()
  console.log('Selection boundaries: shortcut/context menu, reverse, split panes, base patch set, unified, wrapping, reopen, suggestions, and stored ranges passed')
}
