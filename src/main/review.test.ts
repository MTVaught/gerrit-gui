import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GerritClient } from './gerrit.ts'
import { fileSettings } from '../server/file-settings.ts'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

test('review requests full context, preserves whitespace and pins both patch sets', async () => {
  const urls: URL[] = []
  const g = new GerritClient('http://gerrit.test', 'alice', 'test', async (url) => {
    urls.push(new URL(url))
    return new Response(")]}'\n" + JSON.stringify({ content: [{ ab: ['whole', 'file'] }] }))
  })
  const link = { id: 42, project: 'test', patchSet: 5, basePatchSet: 2 }
  assert.equal((await g.diff(link, 'dir/a #%.ts')).content[0]!.ab!.length, 2)
  assert.equal(decodeURIComponent(urls[0]!.pathname), '/a/changes/42/revisions/5/files/dir/a #%.ts/diff')
  assert.equal(urls[0]!.searchParams.get('context'), 'ALL')
  assert.equal(urls[0]!.searchParams.get('whitespace'), 'IGNORE_NONE')
  assert.equal(urls[0]!.searchParams.get('base'), '2')
  await g.files(42, 5)
  assert.equal(urls[1]!.searchParams.has('base'), false)
  await g.files(42, 5, 2)
  assert.equal(urls[2]!.searchParams.get('base'), '2')
})

test('incomplete and binary diffs fail instead of pretending to show the whole file', async () => {
  for (const result of [{ content: [{ skip: 5 }] }, { binary: true, content: [] }]) {
    const g = new GerritClient('http://gerrit.test', 'alice', 'test', async () => new Response(JSON.stringify(result)))
    await assert.rejects(g.diff({ id: 1, project: 'test', patchSet: 1 }, 'file'))
  }
})

test('beta defaults off and persists opt-in across reopening settings', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'review-settings-'))
  try {
    const file = path.join(dir, 'settings.json')
    const store = fileSettings(file)
    const initial = await store.getStatus()
    assert.equal(initial.localReview, false)
    await store.save({ ...initial, localReview: true })
    assert.equal((await fileSettings(file).getStatus()).localReview, true)
    await store.save({ ...initial, localReview: false })
    assert.equal((await store.getStatus()).localReview, false)
  } finally { await rm(dir, { recursive: true, force: true }) }
})

test('reviewed flags are Gerrit state, scoped to revision and encoded file path', async () => {
  const calls: { url: URL; method: string }[] = []
  const g = new GerritClient('http://gerrit.test', 'alice', 'test', async (url, init) => {
    calls.push({ url: new URL(url), method: init.method! })
    return init.method === 'GET' ? new Response(JSON.stringify(['dir/a #%.ts'])) : new Response(null, { status: 204 })
  })
  const link = { id: 42, project: 'test', patchSet: 3, basePatchSet: 1 }
  assert.deepEqual(await g.reviewedFiles(link), ['dir/a #%.ts'])
  assert.equal(calls[0]!.url.searchParams.has('reviewed'), true)
  assert.equal(calls[0]!.url.searchParams.has('base'), false)
  await g.setFileReviewed(link, 'dir/a #%.ts', true)
  await g.setFileReviewed(link, 'dir/a #%.ts', false)
  assert.equal(decodeURIComponent(calls[1]!.url.pathname), '/a/changes/42/revisions/3/files/dir/a #%.ts/reviewed')
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'PUT', 'DELETE'])
  g.pretendAs = { _account_id: 7, name: 'Someone else' }
  await assert.rejects(g.setFileReviewed(link, 'file', true), /refused/)
  assert.equal(calls.length, 3, 'no writes escape pretend mode')
})

test('comment CRUD preserves encoded IDs, range coordinates, draft privacy and publish scope', async () => {
  const calls: { url: URL; method: string; body: any }[] = []
  const g = new GerritClient('http://gerrit.test', 'alice', 'test', async (url, init) => {
    calls.push({ url: new URL(url), method: init.method!, body: init.body ? JSON.parse(init.body as string) : undefined })
    if (init.method === 'DELETE') return new Response(null, { status: 204 })
    return new Response(JSON.stringify({ id: 'draft%2Fid', message: 'Draft', updated: 'now' }))
  })
  const input = { path: 'dir/a #%.ts', side: 'PARENT' as const, line: 12, range: { start_line: 10, start_character: 2, end_line: 12, end_character: 7 }, message: 'Draft', unresolved: true, in_reply_to: 'published%2Fid' }
  assert.equal((await g.saveDraft(42, 5, input)).patch_set, 5)
  await g.saveDraft(42, 5, { ...input, id: 'draft%2Fid', message: 'Edited' })
  await g.deleteDraft(42, 5, 'draft%2Fid')
  await g.submitReview({ id: 42, project: 'p', patchSet: 5 }, { labels: { 'Code-Review': 1 }, drafts: 'PUBLISH_ALL_REVISIONS', draft_ids_to_publish: ['draft%2Fid'], notify: 'NONE' })
  assert.deepEqual(calls.map(c => [c.method, c.url.pathname]), [['PUT', '/a/changes/42/revisions/5/drafts'], ['PUT', '/a/changes/42/revisions/5/drafts/draft%2Fid'], ['DELETE', '/a/changes/42/revisions/5/drafts/draft%2Fid'], ['POST', '/a/changes/42/revisions/5/review']])
  assert.deepEqual(calls[0]!.body, input)
  assert.equal('id' in calls[1]!.body, false)
  assert.deepEqual(calls[3]!.body.draft_ids_to_publish, ['draft%2Fid'])
  g.pretendAs = { _account_id: 7 }
  await assert.rejects(g.saveDraft(42, 5, input), /refused/)
  await assert.rejects(g.deleteDraft(42, 5, 'id'), /refused/)
  await assert.rejects(g.submitReview({ id: 42, project: 'p', patchSet: 5 }, { labels: {}, drafts: 'KEEP', notify: 'NONE' }), /refused/)
  assert.equal(calls.length, 4)
})

test('published comment redaction and suggested fixes use revision-pinned Gerrit endpoints', async () => {
  const calls: { method: string; path: string; body: unknown }[] = []
  const g = new GerritClient('http://gerrit.test', 'alice', 'test', async (url, init) => {
    calls.push({ method: init.method!, path: new URL(url).pathname, body: init.body ? JSON.parse(init.body as string) : undefined })
    return new Response(JSON.stringify({ id: 'published', updated: 'now' }))
  })
  await g.deleteComment(42, 2, 'comment%2Fid', 'Remove personal data')
  await g.applyFix(42, 2, 'fix/id')
  assert.deepEqual(calls, [
    { method: 'POST', path: '/a/changes/42/revisions/2/comments/comment%2Fid/delete', body: { reason: 'Remove personal data' } },
    { method: 'POST', path: '/a/changes/42/revisions/2/fixes/fix%2Fid/apply', body: undefined },
  ])
})
