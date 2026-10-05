import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffRows, visibleRows, findReviewRow } from './review.ts'

test('full-file rows preserve empty context, replacements, additions and deletions', () => {
  const rows = diffRows({ content: [{ ab: ['start', ''] }, { a: ['old', 'deleted'], b: ['new'] }, { b: ['added'] }, { ab: ['end'] }] })
  assert.deepEqual(rows.map((r) => [r.lineA, r.lineB, r.a, r.b]), [
    [1, 1, 'start', 'start'], [2, 2, '', ''], [3, 3, 'old', 'new'],
    [4, undefined, 'deleted', undefined], [undefined, 4, undefined, 'added'], [5, 5, 'end', 'end'],
  ])
  assert.throws(() => diffRows({ content: [{ skip: 10 }] }), /missing/)
  assert.equal(diffRows({ content: [{ b: [''] }] })[0]!.lineB, 1)
  assert.equal(diffRows({ content: [] }).length, 0)
})

test('100k-line file remains fully searchable while rendering a bounded viewport', () => {
  const rows = diffRows({ content: [{ ab: Array.from({ length: 100000 }, (_, i) => `line ${i + 1}`) }] })
  const [from, to] = visibleRows(99999 * 22, 600, rows.length)
  assert.equal(to, 100000)
  assert.ok(to - from < 60)
  assert.equal(findReviewRow(rows, 'LINE 100000', -1, 1), 99999)
  assert.equal(findReviewRow(rows, 'line 1', 99999, 1), 0)
  assert.equal(findReviewRow(rows, 'line 100000', 0, -1), 99999)
  assert.equal(findReviewRow(rows, 'no match', -1, 1), -1)
})
