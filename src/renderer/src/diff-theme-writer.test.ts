import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DiffThemeWriter } from './diff-theme-writer.ts'

test('theme writes run in input order and stale errors cannot replace the newest choice', async () => {
  const writes: string[] = []
  const results: (string | undefined)[] = []
  let failFirst!: (error: Error) => void
  let finishSecond!: () => void
  const writer = new DiffThemeWriter(theme => {
    writes.push(theme)
    return new Promise<void>((resolve, reject) => {
      if (writes.length === 1) failFirst = reject
      else finishSecond = resolve
    })
  }, error => results.push(error?.message))
  const first = writer.change('dark')
  const second = writer.change('light')
  await Promise.resolve()
  assert.deepEqual(writes, ['dark'])
  failFirst(new Error('Old failure'))
  await first
  await Promise.resolve()
  assert.deepEqual(writes, ['dark', 'light'])
  assert.deepEqual(results, [])
  finishSecond()
  await second
  assert.deepEqual(results, [undefined])
})

test('a failed final theme keeps the last confirmed value and the same choice can be retried', async () => {
  let confirmed = 'application'
  let fail = false
  const results: (string | undefined)[] = []
  const writer = new DiffThemeWriter(async theme => {
    if (fail) throw new Error('Disk full')
    confirmed = theme
  }, error => results.push(error?.message))
  await writer.change('light')
  fail = true
  await writer.change('dark')
  assert.equal(confirmed, 'light')
  assert.deepEqual(results, [undefined, 'Disk full'])
  fail = false
  await writer.change('dark')
  assert.equal(confirmed, 'dark')
  assert.deepEqual(results, [undefined, 'Disk full', undefined])
})
