import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReviewedFilesState } from './reviewed-files.ts'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const changed = () => {}
async function loaded(paths = ['a', 'b', 'c', 'd', 'e']) {
  const state = new ReviewedFilesState()
  await state.refresh(async () => paths, changed)
  return state
}

test('rapid changes to different files update at once and all save independently', async () => {
  const state = await loaded()
  const writes = ['a', 'b', 'c'].map(path => {
    const result = deferred<void>()
    return { path, result, saved: state.change(path, false, () => result.promise, changed) }
  })
  assert.deepEqual([...state.paths!], ['d', 'e'])
  assert.deepEqual([...state.pending], ['a', 'b', 'c'])
  assert.equal(await state.change('a', true, async () => { assert.fail('duplicate write') }, changed), false)
  for (const write of [writes[1]!, writes[0]!, writes[2]!]) {
    write.result.resolve()
    assert.equal(await write.saved, true)
  }
  assert.equal(state.pending.size, 0)
  assert.deepEqual([...state.paths!], ['d', 'e'])
})

test('refresh keeps known flags and accepts only the latest read', async () => {
  const state = await loaded()
  const old = deferred<string[]>(), latest = deferred<string[]>()
  const first = state.refresh(() => old.promise, changed)
  const second = state.refresh(() => latest.promise, changed)
  assert.equal(state.paths?.size, 5)
  latest.resolve(['b', 'c', 'd', 'e'])
  await second
  old.resolve(['a', 'b', 'c', 'd', 'e'])
  await first
  assert.equal(state.paths?.has('a'), false)
})

test('a read started before a write cannot restore its old flag even after the write settles', async () => {
  const state = await loaded()
  const old = deferred<string[]>()
  const read = state.refresh(() => old.promise, changed)
  await state.change('a', false, async () => {}, changed)
  old.resolve(['a', 'b', 'c', 'd', 'e'])
  await read
  assert.equal(state.paths?.has('a'), false)
})

test('batch refresh waits for every pending write, then reconciles external changes', async () => {
  const state = await loaded()
  const result = deferred<void>()
  const write = state.change('a', false, () => result.promise, changed)
  await state.refresh(async () => { assert.fail('read during partial batch') }, changed)
  assert.equal(state.paths?.has('a'), false)
  result.resolve()
  await write
  await state.refresh(async () => ['b', 'c', 'e'], changed)
  assert.deepEqual([...state.paths!], ['b', 'c', 'e'])
})

test('failure rolls back only its file, keeps its error through background refresh, and permits retry', async () => {
  const state = await loaded()
  const result = deferred<void>()
  const a = state.change('a', false, () => result.promise, changed)
  assert.equal(await state.change('b', false, async () => { throw new Error('offline') }, changed), false)
  assert.equal(state.paths?.has('b'), true)
  assert.equal(state.paths?.has('a'), false)
  assert.match(state.error, /b: offline/)
  result.resolve()
  await a
  await state.refresh(async () => ['b', 'c', 'd', 'e'], changed)
  assert.match(state.error, /b: offline/)
  assert.equal(await state.change('b', false, async () => {}, changed), true)
  assert.equal(state.error, '')
  assert.deepEqual([...state.paths!], ['c', 'd', 'e'])
})

test('failed status reads preserve known flags and can be retried', async () => {
  const state = await loaded()
  await state.refresh(async () => { throw new Error('read failed') }, changed)
  assert.equal(state.paths?.size, 5)
  assert.equal(state.error, 'read failed')
  state.clearErrors()
  await state.refresh(async () => [], changed)
  assert.equal(state.paths?.size, 0)
  assert.equal(state.error, '')
  const initial = new ReviewedFilesState()
  await initial.refresh(async () => { throw new Error('initial failed') }, changed)
  assert.equal(initial.paths, null)
  assert.match(initial.error, /initial failed/)
  assert.equal(await initial.change('a', true, async () => { assert.fail('not loaded') }, changed), false)
})

test('late reads and writes remain in their original revision', async () => {
  const previous = await loaded(), selected = await loaded(['other'])
  const result = deferred<void>(), oldRead = deferred<string[]>()
  const read = previous.refresh(() => oldRead.promise, changed)
  const write = previous.change('a', false, () => result.promise, changed)
  result.reject(new Error('old revision failed'))
  await write
  oldRead.resolve([])
  await read
  assert.equal(previous.paths?.has('a'), true)
  assert.deepEqual([...selected.paths!], ['other'])
  assert.equal(selected.pending.size, 0)
  assert.equal(selected.error, '')
})

test('reset clears the full reviewed snapshot only after each confirmation', async () => {
  const paths = ['visible.ts', 'hidden-by-filter.ts', 'outside-comparison.ts', '/COMMIT_MSG']
  const state = await loaded(paths), other = await loaded(['other-patch-set.ts'])
  const requests: string[] = [], confirmations = paths.map(() => deferred<void>())
  const server = new Set(paths)
  const reset = state.resetAll(async path => {
    const index = requests.push(path) - 1
    await confirmations[index]!.promise
    server.delete(path)
  }, async () => [...server], () => true, changed)
  assert.equal(state.resetting, true)
  assert.deepEqual([...state.paths!], paths, 'no optimistic clears')
  for (let i = 0; i < paths.length; i++) {
    assert.deepEqual(requests, paths.slice(0, i + 1), 'one request at a time')
    confirmations[i]!.resolve()
    await new Promise(resolve => setImmediate(resolve))
    assert.deepEqual([...state.paths!], paths.slice(i + 1))
  }
  assert.equal(await reset, true)
  assert.equal(state.resetting, false)
  assert.deepEqual([...other.paths!], ['other-patch-set.ts'])
})

test('reset refuses unavailable, empty, failed-read, blocked, and pending status', async () => {
  const fail = async () => { assert.fail('write should not start') }
  const fresh = new ReviewedFilesState(), empty = await loaded([]), blocked = await loaded()
  assert.equal(await fresh.resetAll(fail, async () => [], () => true, changed), false)
  assert.equal(await empty.resetAll(fail, async () => [], () => true, changed), false)
  assert.equal(await blocked.resetAll(fail, async () => [], () => false, changed), false)
  const stale = await loaded()
  await stale.refresh(async () => { throw Error('read unavailable') }, changed)
  assert.equal(await stale.resetAll(fail, async () => [], () => true, changed), false)
  const pending = deferred<void>()
  const mark = blocked.change('a', false, () => pending.promise, changed)
  assert.equal(await blocked.resetAll(fail, async () => [], () => true, changed), false)
  pending.resolve(); await mark
})

test('reset guard spans writes and reconciliation, blocks duplicates and competing marks', async () => {
  const state = await loaded(['a']), write = deferred<void>(), read = deferred<string[]>()
  const reset = state.resetAll(() => write.promise, () => read.promise, () => true, changed)
  const fail = async () => { assert.fail('competing operation') }
  assert.equal(await state.resetAll(fail, async () => [], () => true, changed), false)
  assert.equal(await state.change('b', true, fail, changed), false)
  await state.refresh(async () => { assert.fail('background read during reset') }, changed)
  write.resolve()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.resetting, true, 'guard remains during final read')
  await state.refresh(async () => { assert.fail('background read during reconciliation') }, changed)
  assert.equal(await state.change('b', true, fail, changed), false)
  read.resolve([])
  assert.equal(await reset, true)
  assert.equal(state.resetting, false)
})

test('partial reset failure keeps confirmed clears, stops, and retries remaining flags', async () => {
  const state = await loaded(['a', 'b', 'c']), server = new Set(['a', 'b', 'c']), calls: string[] = []
  assert.equal(await state.resetAll(async path => {
    calls.push(path)
    if (path === 'b') throw Error('offline')
    server.delete(path)
  }, async () => [...server], () => true, changed), false)
  assert.deepEqual(calls, ['a', 'b'])
  assert.deepEqual([...state.paths!], ['b', 'c'])
  assert.match(state.error, /Could not mark all files unreviewed.*b: offline/)
  await state.refresh(async () => [...server], changed)
  assert.match(state.error, /offline/, 'background refresh keeps reset error')
  const retry: string[] = []
  assert.equal(await state.resetAll(async path => { retry.push(path); server.delete(path) }, async () => [...server], () => true, changed), true)
  assert.deepEqual(retry, ['b', 'c'])
  assert.equal(state.paths?.size, 0)
  assert.equal(state.error, '')
})

test('first reset write failure does not clear any flag', async () => {
  const state = await loaded(['a', 'b'])
  assert.equal(await state.resetAll(async () => { throw Error('denied') }, async () => ['a', 'b'], () => true, changed), false)
  assert.deepEqual([...state.paths!], ['a', 'b'])
  assert.match(state.error, /denied/)
})

test('old reads cannot restore a flag after reset and failed reconciliation disables another reset', async () => {
  const state = await loaded(['a']), old = deferred<string[]>()
  const read = state.refresh(() => old.promise, changed)
  assert.equal(await state.resetAll(async () => {}, async () => { throw Error('status offline') }, () => true, changed), false)
  old.resolve(['a']); await read
  assert.equal(state.paths?.size, 0)
  assert.equal(state.statusReady, false)
  assert.match(state.error, /status offline/)
  await state.refresh(async () => [], changed)
  assert.equal(state.statusReady, true)
})

test('connection change stops remaining reset writes and ignores late results', async () => {
  const state = await loaded(['a', 'b']), write = deferred<void>()
  let current = true, count = 0
  const reset = state.resetAll(async () => { count++; await write.promise }, async () => { assert.fail('old connection read') }, () => current, changed)
  current = false
  write.resolve()
  assert.equal(await reset, false)
  assert.equal(count, 1)
  assert.deepEqual([...state.paths!], ['a', 'b'])
  assert.equal(state.resetting, false)
})

test('connection change during final reset read ignores its response', async () => {
  const state = await loaded(['a']), read = deferred<string[]>()
  let current = true
  const reset = state.resetAll(async () => {}, () => read.promise, () => current, changed)
  await new Promise(resolve => setImmediate(resolve))
  current = false; read.resolve(['wrong-context'])
  assert.equal(await reset, false)
  assert.deepEqual([...state.paths!], [])
})
