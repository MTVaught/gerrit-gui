import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DashboardCache } from './dashboard-cache.ts'
import { accountKeys, classifyAll, NO_TEAMS, tabSegments } from '../../shared/model.ts'
import type { ChangeInfo, DashboardData } from '../../shared/types.ts'

const alice = { _account_id: 1, username: 'alice' }
const bob = { _account_id: 2, username: 'bob' }
function change(id = 1, requested = '1'): ChangeInfo {
  return { id: `demo~${id}`, _number: id, project: 'demo', branch: 'main', subject: 'review', status: 'NEW',
    owner: alice, created: '2026-10-12 00:00:00.000000000', updated: '2026-10-12 01:00:00.000000000',
    hashtags: ['reviewer:bob'], reviewers: { REVIEWER: [bob] }, current_revision: 'ps2',
    revisions: { ps1: { _number: 1, created: '2026-10-12 00:00:00.000000000' }, ps2: { _number: 2, created: '2026-10-12 01:00:00.000000000' } },
    custom_keyed_values: { 'review-requested-ps': requested },
    messages: [{ id: 'vote', author: bob, date: '2026-10-12 00:30:00.000000000', message: 'Patch Set 1: Code-Review-1', _revision_number: 1 }] }
}
function dashboard(open: ChangeInfo[], truncated = false): DashboardData {
  return { self: alice, open, merged: [], fetchedAt: new Date().toISOString(), truncated }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
async function seed(read: (id: number) => Promise<ChangeInfo>, changes = [change()]) {
  const snapshots: DashboardData[] = []
  const cache = new DashboardCache(read, data => { if (data) snapshots.push(data) })
  await cache.acceptDashboard(dashboard(changes), cache.beginRefresh())
  return { cache, snapshots }
}
function states(data: DashboardData) {
  return classifyAll(data.open, alice._account_id, NO_TEAMS, accountKeys(alice)).map(v => v.state)
}

test('pre-write and post-write stale searches never roll back the section or tab count', async () => {
  for (const before of [true, false]) {
    const fresh = change(1, '1,2')
    const { cache, snapshots } = await seed(async () => fresh)
    let ticket = before ? cache.beginRefresh() : undefined
    await cache.mutate([1], async () => {})
    const start = snapshots.length
    ticket ??= cache.beginRefresh()
    await cache.acceptDashboard(dashboard([change()]), ticket)
    assert.ok(snapshots.slice(start).every(d => states(d)[0] === 'needs-review'))
    const views = classifyAll(cache.snapshot!.open, 1, NO_TEAMS, accountKeys(alice))
    assert.deepEqual(tabSegments(views).mine, [{ n: 1, tone: 'pending', label: 'out for review' }])
  }
})

test('an outstanding search cannot replace a change while its write is pending', async () => {
  const write = deferred<void>()
  const { cache } = await seed(async () => change(1, '1,2'))
  await cache.mutate([1], async () => {})
  const operation = cache.mutate([1], () => write.promise)
  await Promise.resolve()
  await cache.acceptDashboard(dashboard([change()]), cache.beginRefresh())
  assert.deepEqual(states(cache.snapshot!), ['needs-review'])
  write.resolve()
  await operation
})

test('index catch-up settles, then an external vote or patch set reaches the board', async () => {
  let server = change(1, '1,2')
  let reads = 0
  const { cache } = await seed(async () => { reads++; return server })
  await cache.mutate([1], async () => {})
  await cache.acceptDashboard(dashboard([server]), cache.beginRefresh())
  const settledReads = reads
  await cache.acceptDashboard(dashboard([server]), cache.beginRefresh())
  assert.equal(reads, settledReads)
  server = { ...server, updated: '2026-10-12 02:00:00.000000000', labels: { 'Code-Review': { all: [{ ...bob, value: 1 }] } } }
  await cache.acceptDashboard(dashboard([server]), cache.beginRefresh())
  assert.deepEqual(states(cache.snapshot!), ['approved'])
  server = { ...server, updated: '2026-10-12 03:00:00.000000000', current_revision: 'ps3', revisions: { ...server.revisions, ps3: { _number: 3, created: '2026-10-12 03:00:00.000000000' } }, labels: {} }
  await cache.acceptDashboard(dashboard([server]), cache.beginRefresh())
  assert.equal(cache.snapshot!.open[0]!.current_revision, 'ps3')
})

test('equal-timestamp conflicts revalidate even after index catch-up; computed fields do not conflict', async () => {
  let server = change(1, '1,2')
  let reads = 0
  const { cache } = await seed(async () => { reads++; return server })
  await cache.mutate([1], async () => {})
  const reordered = { ...server, custom_keyed_values: { extra: 'x', ...server.custom_keyed_values } }
  server = { ...server, custom_keyed_values: { ...server.custom_keyed_values, extra: 'x' } }
  await cache.mutate([1], async () => {})
  await cache.acceptDashboard(dashboard([{ ...reordered, _more_changes: true, review_delta: { basePatchSet: 1, patchSet: 2, insertions: 5, deletions: 2 } }]), cache.beginRefresh())
  assert.equal(reads, 2)
  server = change(1, '1')
  await cache.acceptDashboard(dashboard([server]), cache.beginRefresh())
  assert.equal(reads, 3)
  assert.deepEqual(states(cache.snapshot!), ['iterating'])
})

test('detail-only fields and omitted false flags do not prevent search catch-up', async () => {
  let reads = 0
  const detail = { ...change(1, '1,2'), reviewer_updates: [{ state: 'REVIEWER', updated: 'now' }], work_in_progress: false, is_private: false }
  const { cache } = await seed(async () => { reads++; return detail })
  await cache.mutate([1], async () => {})
  await cache.acceptDashboard(dashboard([change(1, '1,2')]), cache.beginRefresh())
  assert.equal(reads, 1)
})

test('a partial write failure reconciles actual state and preserves the write error', async () => {
  let server = change()
  const { cache } = await seed(async () => server)
  await assert.rejects(cache.mutate([1], async () => {
    server = { ...server, hashtags: [] }
    throw new Error('second write failed')
  }), /second write failed/)
  assert.deepEqual(cache.snapshot!.open[0]!.hashtags, [])
})

test('failed detail after a write remains dirty even when search matches the old entity', async () => {
  let failed = true
  const { cache } = await seed(async () => { if (failed) throw new Error('offline'); return change(1, '1,2') })
  await assert.rejects(cache.mutate([1], async () => {}), /offline/)
  await assert.rejects(cache.acceptDashboard(dashboard([change()]), cache.beginRefresh()), /offline/)
  assert.deepEqual(states(cache.snapshot!), ['iterating'])
  failed = false
  await cache.acceptDashboard(dashboard([change()]), cache.beginRefresh())
  assert.deepEqual(states(cache.snapshot!), ['needs-review'])
})

test('an older search cannot undo a settled detail result, and old detail cannot lower its freshness', async () => {
  const fresh = { ...change(1, '1,2'), updated: '2026-10-12 02:00:00.000000000' }
  let server = fresh
  const { cache } = await seed(async () => server)
  await cache.mutate([1], async () => {})
  await cache.acceptDashboard(dashboard([fresh]), cache.beginRefresh())
  server = change()
  await cache.acceptDashboard(dashboard([change()]), cache.beginRefresh())
  assert.deepEqual(states(cache.snapshot!), ['needs-review'])
  assert.equal(cache.snapshot!.open[0]!.updated, fresh.updated)
})

test('failed partial writes keep the original error even when the recovery read also fails', async () => {
  const { cache } = await seed(async () => { throw new Error('read unavailable') })
  await assert.rejects(cache.mutate([1], async () => { throw new Error('partial write failed') }), /partial write failed/)
  await assert.rejects(cache.acceptDashboard(dashboard([change()]), cache.beginRefresh()), /read unavailable/)
})

test('intersecting writes serialize through detail, while different changes proceed', async () => {
  const firstWrite = deferred<void>()
  const firstRead = deferred<ChangeInfo>()
  let reads = 0
  const calls: string[] = []
  const { cache } = await seed(async id => id === 1 && reads++ === 0 ? firstRead.promise : change(id, '1,2'), [change(1), change(2)])
  const first = cache.mutate([1], async () => { calls.push('first'); await firstWrite.promise })
  const second = cache.mutate([1], async () => { calls.push('second') })
  await cache.mutate([2], async () => { calls.push('independent') })
  assert.deepEqual(calls, ['first', 'independent'])
  firstWrite.resolve()
  await Promise.resolve()
  assert.ok(!calls.includes('second'))
  firstRead.resolve(change(1, '1,2'))
  await Promise.all([first, second])
  assert.deepEqual(calls, ['first', 'independent', 'second'])
})

test('detail reads deduplicate and an obsolete detail cannot undo a later mutation', async () => {
  const oldRead = deferred<ChangeInfo>()
  let reads = 0
  const { cache } = await seed(async () => ++reads === 1 ? oldRead.promise : change(1, '1,2'))
  const first = cache.revalidate(1)
  const duplicate = cache.revalidate(1)
  assert.equal(first, duplicate)
  await cache.mutate([1], async () => {})
  oldRead.resolve(change())
  await first
  assert.deepEqual(states(cache.snapshot!), ['needs-review'])
  assert.equal(reads, 2)
})

test('removal and permission loss cannot resurrect an entity from stale search', async () => {
  for (const removed of ['abandoned', 'reviewer', 'private', '404', '403', 'ipc403']) {
    let server = change()
    let denied = false
    const { cache } = await seed(async () => {
      if (denied) throw new Error(removed === 'ipc403'
        ? "Error invoking remote method 'gerrit:fetchChange': Error: GET /changes/1/detail: 403 unavailable"
        : `GET /changes/1/detail: ${removed} unavailable`)
      return server
    })
    await cache.mutate([1], async () => {
      if (removed === 'abandoned') server = { ...server, status: 'ABANDONED' }
      if (removed === 'reviewer') server = { ...server, owner: bob, reviewers: {}, hashtags: [] }
      if (removed === 'private') server = { ...server, owner: bob, is_private: true }
      if (removed === '403' || removed === '404' || removed === 'ipc403') denied = true
    })
    await cache.acceptDashboard(dashboard([change()]), cache.beginRefresh())
    assert.equal(cache.snapshot!.open.length, 0, removed)
  }
})

test('omitted locally changed entities revalidate, while truncated membership is preserved', async () => {
  let server = change(1, '1,2')
  const { cache } = await seed(async () => server, [change(1), change(2)])
  await cache.mutate([1], async () => {})
  await cache.acceptDashboard(dashboard([], true), cache.beginRefresh())
  assert.deepEqual(cache.snapshot!.open.map(c => c._number), [1, 2])
  server = { ...server, status: 'ABANDONED' }
  await cache.acceptDashboard(dashboard([]), cache.beginRefresh())
  assert.equal(cache.snapshot!.open.length, 0)
})

test('sequence edits reconcile every affected ID even after a partial failure', async () => {
  const server = new Map([1, 2, 3].map(id => [id, change(id)]))
  const { cache } = await seed(async id => server.get(id)!, [...server.values()])
  await assert.rejects(cache.mutate([1, 2, 3], async () => {
    server.set(1, { ...server.get(1)!, hashtags: ['sequence', 'reviewer:bob'] })
    server.set(2, { ...server.get(2)!, hashtags: ['sequence', 'reviewer:bob'] })
    throw new Error('third failed')
  }), /third failed/)
  await cache.acceptDashboard(dashboard([change(1), change(2), change(3)]), cache.beginRefresh())
  assert.deepEqual(cache.snapshot!.open.map(c => c.hashtags?.includes('sequence')), [true, true, false])
})

test('scope changes filter team-only entities and invalidate outstanding searches', async () => {
  const teamChange = { ...change(), owner: bob, hashtags: [], reviewers: {} }
  const { cache } = await seed(async () => teamChange, [])
  cache.setScope(['bob'], ['demo'])
  await cache.mutate([1], async () => {})
  assert.equal(cache.snapshot!.open.length, 1)
  const oldScope = cache.beginRefresh()
  cache.setScope(['bob'], ['other'])
  assert.equal(cache.snapshot!.open.length, 0)
  await cache.acceptDashboard(dashboard([teamChange]), oldScope)
  assert.equal(cache.snapshot!.open.length, 0)
  cache.setScope([], [])
  assert.equal(cache.snapshot!.open.length, 0)
})

test('reset rejects outstanding reads, searches, and queued writes from the previous context', async () => {
  const oldRead = deferred<ChangeInfo>()
  const oldWrite = deferred<void>()
  const { cache } = await seed(async () => oldRead.promise)
  const ticket = cache.beginRefresh()
  const read = cache.revalidate(1)
  const write = cache.mutate([2], () => oldWrite.promise)
  let queuedRan = false
  const queued = cache.mutate([2], async () => { queuedRan = true })
  await Promise.resolve()
  cache.reset()
  await cache.acceptDashboard(dashboard([change(3)]), cache.beginRefresh())
  oldRead.resolve(change(1, '1,2'))
  oldWrite.resolve()
  await Promise.all([read, write, queued])
  await cache.acceptDashboard(dashboard([change(1)]), ticket)
  assert.deepEqual(cache.snapshot!.open.map(c => c._number), [3])
  assert.equal(queuedRan, false)
})

test('a dashboard for a different account discards the previous account cache', async () => {
  const { cache } = await seed(async () => change(1, '1,2'))
  await cache.mutate([1], async () => {})
  const old = cache.beginRefresh()
  await cache.acceptDashboard({ ...dashboard([]), self: bob }, cache.beginRefresh())
  assert.equal(cache.snapshot!.self._account_id, bob._account_id)
  assert.equal(cache.snapshot!.open.length, 0)
  await cache.acceptDashboard(dashboard([change()]), old)
  assert.equal(cache.snapshot!.self._account_id, bob._account_id)
})

test('conflicting detail revalidation is bounded to six requests', async () => {
  let active = 0
  let maximum = 0
  let gated = false
  const gate = deferred<void>()
  const old = Array.from({ length: 12 }, (_, i) => change(i + 1))
  const { cache } = await seed(async id => {
    active++; maximum = Math.max(maximum, active)
    if (gated) await gate.promise
    active--
    return change(id, '1,2')
  }, old)
  for (const c of old) await cache.mutate([c._number], async () => {})
  gated = true
  const refresh = cache.acceptDashboard(dashboard(old), cache.beginRefresh())
  assert.equal(active, 6)
  gate.resolve()
  await refresh
  assert.equal(maximum, 6)
  assert.ok(states(cache.snapshot!).every(state => state === 'needs-review'))
})

test('multi-change mutations also share the six-request detail limit', async () => {
  let active = 0
  let maximum = 0
  const gate = deferred<void>()
  const old = Array.from({ length: 12 }, (_, i) => change(i + 1))
  const { cache } = await seed(async id => {
    active++; maximum = Math.max(maximum, active)
    await gate.promise
    active--
    return change(id, '1,2')
  }, old)
  const mutation = cache.mutate(old.map(c => c._number), async () => {})
  await Promise.resolve()
  await Promise.resolve()
  assert.equal(active, 6)
  gate.resolve()
  await mutation
  assert.equal(maximum, 6)
  assert.ok(states(cache.snapshot!).every(state => state === 'needs-review'))
})
