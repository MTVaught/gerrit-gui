// Additional renderer checks, called by review-comments-ui.cjs after the older
// standalone draft is discarded. Gerrit data is simulated by its preload.
const assert = require('node:assert/strict')
const delay = ms => new Promise(resolve => setTimeout(resolve, ms))
module.exports = async function checkPortedReplies(win) {
  const run = script => win.webContents.executeJavaScript(script).catch(error => { throw new Error(script + '\n' + error.message) })
  const stats = () => run('api.fixtureStats()')
  async function until(expression, name) {
    for (let i = 0; i < 150; i++) { if (await run(`(async () => (${expression}))()`)) return; await delay(50) }
    throw new Error('Ported replies: ' + name + '\n' + await run(`document.querySelector('.local-review')?.innerText`))
  }
  async function click(expression) {
    await run(`(${expression}).click()`)
    await delay(100)
  }
  const button = (text, scope = '.local-review') => click(`Array.from(document.querySelectorAll(${JSON.stringify(scope + ' button')})).find(b=>b.textContent.trim()===${JSON.stringify(text)})`)
  const thread = '[data-review-thread-id="historical"]'
  const field = '[aria-label="Draft comment"]'
  async function type(text) { await until(`document.querySelector('${field}')?.getBoundingClientRect().height > 0`, 'draft field is visible'); await run(`document.querySelector('${field}').focus()`); await until(`document.activeElement===document.querySelector('${field}')`, 'draft field receives focus'); await win.webContents.insertText(text) }
  async function saved() { await until(`(() => { const field=document.querySelector('${field}'); const checkbox=document.querySelector('.review-comment-compose input[type="checkbox"]'); return field && document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saved to Gerrit' && api.fixtureStats().then(s=>s.drafts[0]?.message.trim()===field.value.trim() && s.drafts[0]?.unresolved===!checkbox.checked) })()`, 'latest draft state saved') }
  function original(draft) {
    assert.ok(draft)
    assert.deepEqual([draft.patch_set, draft.path, draft.line, draft.side, draft.in_reply_to], [1, 'old-scheduler.ts', 9998, 'REVISION', 'historical'])
  }
  async function placed() {
    assert.equal(await run(`document.querySelector('[aria-label="Compared patch set"]').value`), '3')
    assert.equal(await run(`document.querySelector('[data-review-path][aria-current="true"]').dataset.reviewPath`), 'src/telemetry/batch-scheduler.ts')
    assert.equal(await run(`document.querySelectorAll('.review-comment-compose').length`), 1)
    assert.ok(await run(`Boolean(document.querySelector('${thread} ${field}')) && !document.querySelector('.review-send-dialog')`), 'one composer stays inside the mapped thread')
  }
  const before = await stats()
  for (const action of ['Ack', 'Done']) {
    await button(action, thread)
    await until(`(await api.fixtureStats()).drafts.length === 1 && Boolean(document.querySelector('${thread} .comment-draft'))`, action + ' saved inline')
    const draft = (await stats()).drafts[0]; original(draft)
    assert.equal(draft.message, action === 'Ack' ? 'Acknowledged' : 'Done'); assert.equal(draft.unresolved, false)
    await button('Discard draft', thread)
    await until(`(await api.fixtureStats()).drafts.length === 0`, 'quick reply discarded')
  }
  // Quote has the same write rules and can be canceled after autosave.
  await button('Quote', thread); await placed()
  assert.equal(await run(`document.querySelector('${field}').value`), '> Could we simplify timer cancellation?\n\n')
  await type('Quoted response.'); await saved(); original((await stats()).drafts[0])
  await button('Cancel', '.review-comment-compose')
  await until(`(await api.fixtureStats()).drafts.length === 0`, 'quoted draft canceled')

  // Start through the overview, then keep the renamed old anchor through a
  // failed save, retry, editing, resolution changes, and cancel restoration.
  await click(`document.querySelector('.review-comments summary')`)
  await click(`Array.from(document.querySelectorAll('.review-menu-items button')).find(b=>b.textContent.startsWith('All comments'))`)
  await button('Reply', '.review-comment-overview ' + thread)
  await placed(); await run('api.fixtureFailDraft()'); await type('Retain this older reply.')
  await until(`document.querySelector('.review-comment-notice [role="alert"]')?.textContent.includes('Fixture draft save failed')`, 'save failure visible')
  assert.equal(await run(`document.querySelector('${field}').value`), 'Retain this older reply.')
  await button('Save', '.review-comment-compose')
  await until(`(await api.fixtureStats()).drafts.length === 1 && !document.querySelector('.review-comment-compose')`, 'retry closes composer')
  const draft = (await stats()).drafts[0]; original(draft)
  assert.equal(await run(`document.querySelector('[aria-label="Compared patch set"]').value`), '3', 'Save preserves comparison with no draft-specific mapping')
  await button('Edit', thread); await placed(); await type(' Changed.'); await saved()
  await click(`document.querySelector('.review-comment-compose input[type="checkbox"]')`); await saved()
  assert.equal((await stats()).drafts[0].unresolved, false)
  await button('Cancel', '.review-comment-compose')
  await until(`!document.querySelector('.review-comment-compose')`, 'existing edit canceled')
  const restored = (await stats()).drafts[0]; original(restored)
  assert.deepEqual([restored.id, restored.message, restored.unresolved], [draft.id, draft.message, draft.unresolved])
  await button('Discard draft', thread); await until(`(await api.fixtureStats()).drafts.length === 0`, 'older saved reply discarded')

  // Continue typing while creation is pending, then Save must update that ID.
  await button('Reply', thread); await type('Keep the original anchor')
  await until(`document.querySelector('.review-comment-compose [role="status"]')?.textContent === 'Saving…'`, 'creation in flight')
  await win.webContents.insertText(' while typing.'); await saved(); await placed()
  const concurrent = (await stats()).drafts[0]; original(concurrent)
  assert.equal(concurrent.message, 'Keep the original anchor while typing.')
  await button('Save', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`, 'Save closes')
  assert.equal((await stats()).drafts[0].id, concurrent.id)
  assert.equal((await stats()).requests, before.requests, 'reply editing does not refetch source files')
  await button('Close review')
  await until(`Boolean(document.querySelector('.review-main'))`, 'dashboard restored')
  await click(`document.querySelector('.review-main')`)
  await until(`Boolean(document.querySelector('${thread} .comment-draft')) && document.querySelector('.review-editor')?.dataset.reviewReady === 'true'`, 'reply restored inline after reopen')

  const reopenedRequests = (await stats()).requests
  const reviewCount = (await stats()).reviews.length
  for (const [index, scope] of ['KEEP', 'PUBLISH', 'PUBLISH_ALL_REVISIONS'].entries()) {
    await click(`document.querySelector('.review-comments > button')`)
    await run(`(() => {const s=document.querySelector('[aria-label="Publish drafts"]');s.value=${JSON.stringify(scope)};s.dispatchEvent(new Event('change',{bubbles:true}))})()`)
    await delay(100)
    assert.equal(await run(`document.querySelectorAll('.review-publish-list li').length`), scope === 'PUBLISH_ALL_REVISIONS' ? 1 : 0)
    assert.ok(await run(`document.querySelector('.review-send-dialog').textContent.includes('${scope === 'PUBLISH_ALL_REVISIONS' ? 1 : 0} drafts will be published.')`))
    if (scope === 'PUBLISH_ALL_REVISIONS') {
      await click(`document.querySelector('.review-publish-list button')`); await placed()
      await button('Cancel', '.review-comment-compose'); await until(`!document.querySelector('.review-comment-compose')`, 'publish-list editing canceled')
      await click(`document.querySelector('.review-comments > button')`)
    }
    await button('Send review', '.review-send-dialog')
    await until(`(await api.fixtureStats()).reviews.length === ${reviewCount + index + 1} && !document.querySelector('.review-send-dialog')`, 'publication completed')
    const result = await stats(), input = result.reviews.at(-1).input
    assert.deepEqual(input.draft_ids_to_publish, scope === 'PUBLISH_ALL_REVISIONS' ? [concurrent.id] : [])
    assert.equal(input.drafts, scope)
    assert.equal(result.drafts.length, scope === 'PUBLISH_ALL_REVISIONS' ? 0 : 1)
  }
  const after = await stats()
  assert.equal(after.requests, reopenedRequests, 'publication and publish-list editing do not refetch source files')
  assert.ok(after.draftDeletes.slice(before.draftDeletes.length).every(deleted => deleted.patchSet === 1), 'reply deletions use the saved patch set')
  assert.ok(await run(`document.querySelectorAll('.review-editor .view-lines > div').length < 300`))

  // Cross-file placement also keeps a ranged, merge-parent-side write anchor.
  await run('api.fixtureOtherFileComment(true)')
  await click(`document.querySelector('.review-comments summary')`)
  await button('Refresh comments', '.review-menu-items')
  await until(`Array.from(document.querySelectorAll('.review-menu-items button')).some(b=>b.textContent==='All comments (4)')`, 'older cross-file comment loaded')
  await click(`document.querySelector('.review-comments summary')`)
  await button('All comments (4)', '.review-menu-items')
  await button('Reply', '.review-comment-overview [data-review-thread-id="other-file"]')
  await until(`document.querySelector('[data-review-path="src/telemetry/types.ts"]')?.getAttribute('aria-current')==='true' && document.querySelector('.review-editor')?.dataset.reviewReady==='true' && Boolean(document.querySelector('.review-editor [aria-label="Draft comment"]'))`, 'older cross-file composer mapped')
  await type('Keep the range and parent.'); await saved()
  const crossFile = (await stats()).drafts[0]
  assert.deepEqual([crossFile.patch_set, crossFile.path, crossFile.line, crossFile.side, crossFile.parent, crossFile.range, crossFile.in_reply_to], [1, 'old-types.ts', 4000, 'PARENT', 2, { start_line: 3999, start_character: 1, end_line: 4000, end_character: 4 }, 'other-file'])
  assert.equal(await run(`document.querySelectorAll('.review-comment-compose').length`), 1)
  assert.equal(await run(`document.querySelector('[aria-label="Compared patch set"]').value`), '3')
  await button('Cancel', '.review-comment-compose'); await until(`(await api.fixtureStats()).drafts.length===0`, 'cross-file reply canceled')
  await run('api.fixtureRemoveOtherFileComment()')
  await click(`document.querySelector('[data-review-path="src/telemetry/batch-scheduler.ts"]')`)
  await until(`document.querySelector('.review-editor')?.dataset.reviewReady==='true'`, 'original file restored')
  await click(`document.querySelector('.review-comments summary')`); await button('Refresh comments', '.review-menu-items')
  await until(`Array.from(document.querySelectorAll('.review-menu-items button')).some(b=>b.textContent==='All comments (3)')`, 'cross-file fixture removed')
}
