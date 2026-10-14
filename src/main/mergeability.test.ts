import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GerritClient, GerritError } from './gerrit.ts'
import { attachMergeability, fetchChange, fetchDashboard } from './dashboard.ts'
import type { ChangeInfo } from '../shared/types.ts'

const alice = { _account_id: 1, username: 'alice' }
function change(id: number, extra: Partial<ChangeInfo> = {}): ChangeInfo {
  return { id: `demo~main~I${id}`, _number: id, project: 'demo', branch: 'main', subject: 'Example',
    status: 'NEW', owner: alice, created: '2026-10-14 00:00:00', updated: '2026-10-14 00:00:00',
    current_revision: `sha${id}`, ...extra }
}

test('mergeability reads the specified revision and preserves both boolean outcomes', async () => {
  for (const mergeable of [true, false]) {
    const client = new GerritClient('https://gerrit.test', 'alice', 'test', async (url, init) => {
      assert.equal(url, 'https://gerrit.test/a/changes/42/revisions/sha%2Fone/mergeable')
      assert.equal(init.method, 'GET')
      assert.equal(init.body, undefined)
      return new Response(")]}'\n" + JSON.stringify({ mergeable }))
    })
    assert.deepEqual(await client.mergeability(42, 'sha/one'), { mergeable })
  }
})

test('mergeability preserves HTTP errors for the caller to handle', async () => {
  const client = new GerritClient('https://gerrit.test', 'alice', 'test', async () => new Response('Not found', { status: 404 }))
  await assert.rejects(client.mergeability(42, 'old-sha'), error => error instanceof GerritError && error.status === 404)
})

test('enrichment checks missing values once per change and revision without caching across reads', async () => {
  const calls: string[] = []
  let mergeable = false
  const client = new GerritClient('https://gerrit.test', 'alice', 'test', async url => {
    calls.push(url)
    return new Response(JSON.stringify({ mergeable }))
  })
  const input = [change(1), change(1), change(1, { current_revision: 'sha1b' }),
    change(2, { mergeable: true }), change(3, { mergeable: false }),
    change(4, { status: 'MERGED' }), change(5, { status: 'ABANDONED' })]
  await attachMergeability(client, input)
  assert.equal(calls.length, 2)
  assert.ok(calls.some(url => url.endsWith('/sha1/mergeable')))
  assert.ok(calls.some(url => url.endsWith('/sha1b/mergeable')))
  assert.deepEqual(input.slice(0, 3).map(c => c.mergeable), [false, false, false])
  mergeable = true
  const next = change(1)
  await attachMergeability(client, [next])
  assert.equal(calls.length, 3)
  assert.equal(next.mergeable, true, 'a branch-only update is read again for the same revision')
})

test('individual failures and malformed outcomes stay unknown and do not stop other checks', async () => {
  const client = new GerritClient('https://gerrit.test', 'alice', 'test', async url => {
    if (url.includes('/changes/1/')) throw new Error('offline')
    return new Response(JSON.stringify(url.includes('/changes/2/') ? {} : { mergeable: false }))
  })
  const input = [change(1), change(2), change(3)]
  await attachMergeability(client, input)
  assert.deepEqual(input.map(c => c.mergeable), [undefined, undefined, false])
})

test('mergeability enrichment bounds concurrent reads to six', async () => {
  let active = 0
  let maximum = 0
  let calls = 0
  const client = new GerritClient('https://gerrit.test', 'alice', 'test', async () => {
    calls++
    maximum = Math.max(maximum, ++active)
    await new Promise(resolve => setTimeout(resolve, 5))
    active--
    return new Response('{"mergeable":true}')
  })
  const input = Array.from({ length: 15 }, (_, i) => change(i))
  await attachMergeability(client, input)
  assert.equal(calls, 15)
  assert.equal(maximum, 6)
  assert.ok(input.every(c => c.mergeable === true))
})

test('dashboard enriches only visible open members, including owned private changes', async () => {
  const reads: number[] = []
  const hidden = change(9, { owner: { _account_id: 2 }, is_private: true })
  const client = new GerritClient('https://gerrit.test', 'alice', 'test', async url => {
    const path = new URL(url).pathname
    if (path === '/a/accounts/self') return new Response(JSON.stringify(alice))
    if (path === '/a/changes/') return new Response(JSON.stringify([
      [change(1), change(2, { is_private: true }), change(3, { mergeable: true }), hidden],
      [], [change(4, { status: 'MERGED' })],
    ]))
    reads.push(Number(path.split('/')[3]))
    return new Response('{"mergeable":false}')
  })
  const data = await fetchDashboard(client, [])
  assert.deepEqual(reads.sort(), [1, 2])
  assert.deepEqual(data.open.map(c => c.mergeable), [false, false, true])
  assert.equal(data.open.some(c => c._number === 9), false)
  assert.equal(data.merged[0]!.mergeable, undefined)
})

test('detail uses the same enrichment and a failed lookup still returns the change', async () => {
  let fail = false
  const client = new GerritClient('https://gerrit.test', 'alice', 'test', async url => {
    if (url.endsWith('/accounts/self')) return new Response(JSON.stringify(alice))
    if (url.includes('/detail?')) return new Response(JSON.stringify(change(1, { submittable: false })))
    assert.ok(url.endsWith('/revisions/sha1/mergeable'))
    return fail ? new Response('Unavailable', { status: 503 }) : new Response('{"mergeable":true}')
  })
  assert.equal((await fetchChange(client, 1)).mergeable, true, 'submit approval is independent')
  fail = true
  assert.equal((await fetchChange(client, 1)).mergeable, undefined)
})
