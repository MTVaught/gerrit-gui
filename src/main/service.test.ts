import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createService, type SettingsStore } from './service.ts'
import type { FetchLike } from './gerrit.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

const bob = { _account_id: 2, username: 'bob' }
const credentials = { serverUrl: 'http://gerrit.test', username: 'alice', password: 'test' }
function service(fetchImpl: FetchLike, getCredentials: SettingsStore['getCredentials'] = async () => credentials) {
  return createService({
    getCredentials,
    getStatus: async () => { throw new Error('unused') },
    save: async () => { throw new Error('unused') },
  }, fetchImpl)
}

test('pretend waits for every write in outstanding actions and closes admission while waiting', async () => {
  const firstStarted = deferred()
  const firstRelease = deferred()
  const secondStarted = deferred()
  const secondRelease = deferred()
  const writes: string[] = []
  const svc = service(async (url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify(bob))
    assert.equal(await svc.getPretend(), null, 'writes finish before the mode changes')
    writes.push(url)
    if (url.includes('/changes/1/')) {
      firstStarted.resolve()
      await firstRelease.promise
    }
    if (url.includes('/changes/3/')) {
      secondStarted.resolve()
      await secondRelease.promise
    }
    return new Response('{}')
  })
  const sequence = svc.act({ type: 'setSequence', id: 1, add: [1, 2], remove: [] })
  const other = svc.act({ type: 'hashtag', id: 3, add: ['tag'] })
  await Promise.all([firstStarted.promise, secondStarted.promise])
  const switching = svc.setPretend('bob')
  await assert.rejects(svc.act({ type: 'hashtag', id: 4, add: ['tag'] }), /waiting for outstanding actions/)
  await assert.rejects(svc.setPretend(null), /already switching/)
  firstRelease.resolve()
  await sequence
  assert.equal(await svc.getPretend(), null, 'the other action still needs to finish')
  secondRelease.resolve()
  await other
  assert.deepEqual(await switching, bob)
  assert.equal(writes.length, 3)
  await assert.rejects(svc.act({ type: 'hashtag', id: 4, add: ['tag'] }), /read-only/)
  await svc.setPretend(null)
  await svc.act({ type: 'hashtag', id: 4, add: ['tag'] })
  assert.equal(writes.length, 4)
})

test('pretend also waits for actions still obtaining credentials', async () => {
  const credentialsRelease = deferred()
  let calls = 0
  let writes = 0
  const svc = service(async (_url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify(bob))
    assert.equal(await svc.getPretend(), null)
    writes++
    return new Response('{}')
  }, async () => {
    if (++calls === 1) await credentialsRelease.promise
    return credentials
  })
  const action = svc.act({ type: 'hashtag', id: 1, add: ['tag'] })
  const switching = svc.setPretend('bob')
  assert.equal(await svc.getPretend(), null)
  credentialsRelease.resolve()
  await action
  assert.deepEqual(await switching, bob)
  assert.equal(writes, 1)
})

test('failed outstanding actions release the switch; failed lookups restore admission', async () => {
  const writeStarted = deferred()
  const writeRelease = deferred()
  let failWrite = true
  const svc = service(async (url, init) => {
    if (init.method === 'GET') {
      return url.includes('/missing/')
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(bob))
    }
    if (failWrite) {
      writeStarted.resolve()
      await writeRelease.promise
      throw new Error('write failed')
    }
    return new Response('{}')
  })
  const actionFailed = assert.rejects(svc.act({ type: 'hashtag', id: 1, add: ['tag'] }), /write failed/)
  await writeStarted.promise
  const switchFailed = assert.rejects(svc.setPretend('missing'), /No account matches/)
  writeRelease.resolve()
  await Promise.all([actionFailed, switchFailed])
  assert.equal(await svc.getPretend(), null)
  failWrite = false
  await svc.act({ type: 'hashtag', id: 1, add: ['tag'] })
  assert.deepEqual(await svc.setPretend('bob'), bob)
})

test('reviewed flag writes drain before pretend mode and cannot enter while switching', async () => {
  const started = deferred()
  const release = deferred()
  let writes = 0
  const svc = service(async (_url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify(bob))
    writes++
    started.resolve()
    await release.promise
    return new Response(null, { status: 204 })
  })
  const link = { id: 1, project: 'test', patchSet: 3 }
  const marking = svc.setReviewFileReviewed(link, 'file', true)
  await started.promise
  const switching = svc.setPretend('bob')
  await assert.rejects(svc.setReviewFileReviewed(link, 'another', true), /waiting for outstanding actions/)
  release.resolve()
  await marking
  assert.deepEqual(await switching, bob)
  await assert.rejects(svc.setReviewFileReviewed(link, 'file', false), /read-only/)
  assert.equal(writes, 1)
})

test('comment and review writes participate in the impersonation write barrier', async () => {
  const started = deferred(), release = deferred()
  let writes = 0
  const svc = service(async (_url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify(bob))
    writes++; started.resolve(); await release.promise
    return new Response(JSON.stringify({ id: 'draft', updated: 'now' }))
  })
  const draft = svc.saveReviewDraft(1, 3, { path: 'file', line: 10000, message: 'unchanged line', unresolved: true })
  await started.promise
  const switching = svc.setPretend('bob')
  await assert.rejects(svc.deleteReviewDraft(1, 3, 'draft'), /waiting/)
  release.resolve(); await draft; await switching
  await assert.rejects(svc.saveReviewDraft(1, 3, { path: 'file', message: 'reply', unresolved: true }), /read-only/)
  await assert.rejects(svc.deleteReviewDraft(1, 3, 'draft'), /read-only/)
  await assert.rejects(svc.deleteReviewComment(1, 3, 'published', 'reason'), /read-only/)
  await assert.rejects(svc.applyReviewFix(1, 3, 'fix'), /read-only/)
  await assert.rejects(svc.submitReview({ id: 1, project: 'p', patchSet: 3 }, { labels: {}, drafts: 'PUBLISH_ALL_REVISIONS', notify: 'ALL' }), /read-only/)
  assert.equal(writes, 1)
})

test('ported comments and private drafts are mapped for both comparison revisions', async () => {
  const requests: string[] = []
  const svc = service(async (url) => {
    requests.push(url)
    return new Response(JSON.stringify({ 'new.ts': [{ id: url.includes('ported_drafts') ? 'draft' : 'published', patch_set: 1, line: 7, side: 'REVISION' }] }))
  })
  const positions = await svc.reviewCommentPositions({ id: 42, project: 'p', patchSet: 5, basePatchSet: 2 })
  assert.equal(requests.length, 4)
  assert.ok(requests.some(url => url.endsWith('/revisions/5/ported_comments')))
  assert.ok(requests.some(url => url.endsWith('/revisions/2/ported_drafts')))
  assert.deepEqual(positions.map(p => [p.id, p.anchor.patchSet, p.anchor.path, p.anchor.line]), [['published', 5, 'new.ts', 7], ['draft', 5, 'new.ts', 7], ['published', 2, 'new.ts', 7], ['draft', 2, 'new.ts', 7]])
  await assert.rejects(svc.reviewCommentPositions({ id: 42, project: 'p' }), /patch set/)
})

test('pretend comment mapping never fetches private drafts', async () => {
  const requests: string[] = []
  const svc = service(async url => {
    requests.push(url)
    return new Response(JSON.stringify(url.includes('/accounts/') ? bob : {}))
  })
  await svc.setPretend('bob')
  await svc.reviewCommentPositions({ id: 42, project: 'p', patchSet: 5 })
  assert.ok(requests.some(url => url.includes('ported_comments')))
  assert.ok(!requests.some(url => url.includes('ported_drafts')))
})

test('review detail APIs preserve file paths and separate fix previews from writes', async () => {
  const requests: { url: string; method: string; body: unknown }[] = []
  const svc = service(async (url, init) => {
    requests.push({ url, method: init.method!, body: init.body ? JSON.parse(init.body as string) : null })
    return new Response(JSON.stringify(url.includes('/accounts/bob') ? bob : url.includes('/blame') ? [] : {}))
  })
  const link = { id: 42, project: 'p', patchSet: 3 }
  const fix = { description: 'Fix', replacements: [{ path: 'src/a file.ts', range: { start_line: 2, start_character: 0, end_line: 2, end_character: 8 }, replacement: 'new()' }] }
  await svc.reviewBlame(link, 'src/a file.ts')
  await svc.reviewDiffPreferences()
  await svc.saveReviewDiffPreferences({ context: -1, manual_review: false })
  await svc.previewReviewFix(42, 2, fix)
  await svc.previewReviewFix(42, 2, { ...fix, fix_id: 'fix/id' })
  await svc.applyProvidedReviewFix(42, 2, fix)
  assert.ok(requests.some(r => r.url.endsWith('/files/src%2Fa%20file.ts/blame')))
  assert.ok(requests.some(r => r.url.endsWith('/preferences.diff') && r.method === 'PUT' && (r.body as { context: number }).context === -1))
  assert.ok(requests.some(r => r.url.endsWith('/fixes/fix%2Fid/preview') && r.method === 'GET'))
  assert.ok(requests.some(r => r.url.endsWith('/revisions/2/fix:preview') && r.method === 'POST'))
  assert.deepEqual(requests.find(r => r.url.endsWith('/revisions/current/fix:apply'))?.body, { originalPatchsetForFix: 2, fix_replacement_infos: fix.replacements })
  await svc.setPretend('bob')
  await svc.previewReviewFix(42, 2, fix)
  await assert.rejects(svc.saveReviewDiffPreferences({ context: 10 }), /read-only/)
  await assert.rejects(svc.applyProvidedReviewFix(42, 2, fix), /read-only/)
})

test('a rejected reviewer is reported even when Gerrit returns HTTP 200', async () => {
  const svc = service(async () => new Response(JSON.stringify({ reviewers: { 'missing@example.com': { error: 'Account not found' } } })))
  await assert.rejects(svc.submitReview({ id: 42, project: 'p', patchSet: 3 }, { labels: {}, drafts: 'KEEP', notify: 'NONE', reviewers: [{ reviewer: 'missing@example.com' }] }), /missing@example.com: Account not found/)
})
