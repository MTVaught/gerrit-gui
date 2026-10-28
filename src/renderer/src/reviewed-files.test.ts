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
