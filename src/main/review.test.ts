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
