import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DashboardRefresh } from './dashboard-refresh.ts'

function deferred() {
  let resolve!: (identity: string) => void
  let reject!: (error: Error) => void
  const promise = new Promise<string>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

function board() {
  const requests = new DashboardRefresh()
  const state = { identity: '', error: '', busy: false, notifications: [] as string[] }
  const refresh = async (load: () => Promise<string>) => {
    const isCurrent = requests.begin()
    if (!isCurrent) return
    state.busy = true
    try {
      const identity = await load()
      if (!isCurrent()) return
      state.identity = identity
      state.error = ''
      state.notifications.push(identity)
    } catch (e) {
      if (isCurrent()) state.error = (e as Error).message
    } finally {
      if (isCurrent()) state.busy = false
    }
  }
  return { requests, state, refresh }
}

test('a delayed real-user refresh cannot overwrite the debug board after switching', async () => {
  const { requests, state, refresh } = board()
  const old = deferred()
  const pending = refresh(() => old.promise)
  assert.equal(requests.pause(), true)
  assert.equal(requests.pause(), false, 'a second switch must not resume the first')
  await refresh(() => { throw new Error('refresh must not run during the switch') })
  requests.resume()
  await refresh(async () => 'bob')
  old.resolve('alice')
  await pending
  assert.equal(state.identity, 'bob')
  assert.deepEqual(state.notifications, ['bob'])
  assert.equal(state.busy, false)

  const debug = deferred()
  const debugPending = refresh(() => debug.promise)
  requests.pause()
  requests.resume()
  await refresh(async () => 'alice')
  debug.resolve('bob')
  await debugPending
  assert.equal(state.identity, 'alice', 'stopping pretend also discards old responses')
})

test('a stale refresh error cannot replace the current error or clear loading', async () => {
  const { state, refresh } = board()
  const old = deferred()
  const latest = deferred()
  const first = refresh(() => old.promise)
  const second = refresh(() => latest.promise)
  old.reject(new Error('stale failure'))
  await first
  assert.equal(state.error, '')
  assert.equal(state.busy, true)
  latest.resolve('bob')
  await second
  assert.equal(state.identity, 'bob')
  assert.equal(state.busy, false)
})

test('reconnecting discards outstanding responses and a failed switch can resume refreshing', async () => {
  const { requests, state, refresh } = board()
  const old = deferred()
  const pending = refresh(() => old.promise)
  requests.invalidate()
  old.resolve('old server')
  await pending
  assert.equal(state.identity, '')
  requests.pause()
  requests.resume()
  await refresh(async () => 'unchanged identity')
  assert.equal(state.identity, 'unchanged identity')
  assert.equal(state.busy, false)
})
