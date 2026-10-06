import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReviewDiff } from './review-diff.ts'
import type { ReviewWhitespace } from './review-preferences.ts'
const compute = (original: string[], modified: string[], whitespace: ReviewWhitespace) => computeReviewDiff({ id: 1, original, modified, whitespace, timeout: 10000 })

test('all four whitespace modes preserve Gerrit comparison semantics', () => {
  assert.equal(compute(['foo  '], ['foo'], 'IGNORE_NONE').changes.length, 1)
  assert.equal(compute(['foo  '], ['foo'], 'IGNORE_TRAILING').changes.length, 0)
  assert.equal(compute([' foo'], ['foo'], 'IGNORE_TRAILING').changes.length, 1)
  assert.equal(compute([' foo  '], ['foo'], 'IGNORE_LEADING_AND_TRAILING').changes.length, 0)
  assert.equal(compute(['foo bar'], ['foobar'], 'IGNORE_LEADING_AND_TRAILING').changes.length, 1)
  assert.equal(compute(['\tfoo bar  '], ['foobar'], 'IGNORE_ALL').changes.length, 0)
})
test('normalized diffs keep line alignment and intraline ranges in the actual source', () => {
  const original = ['foo   bar', '\treturn oldName;  ', 'last line']
  const modified = ['foobar', '   return newName;', 'last line']
  const result = compute(original, modified, 'IGNORE_ALL')
  assert.equal(result.changes.length, 1)
  assert.deepEqual(result.changes[0]!.original, [2, 3])
  assert.deepEqual(result.changes[0]!.modified, [2, 3])
  for (const inner of result.changes[0]!.innerChanges) {
    assert.ok(inner.original.startColumn > 1)
    assert.ok(inner.modified.startColumn > 3)
    assert.ok(inner.original.endColumn <= original[1]!.length + 1)
    assert.ok(inner.modified.endColumn <= modified[1]!.length + 1)
  }
  assert.deepEqual(original, ['foo   bar', '\treturn oldName;  ', 'last line'])
})
test('worker handles additions, deletions and empty files with valid line ranges', () => {
  for (const [a, b] of [[[''], ['one', 'two']], [['one', 'two'], ['']], [['one'], ['one', 'two']], [['one', 'two'], ['one']]]) {
    const result = compute(a!, b!, 'IGNORE_ALL')
    assert.equal(result.quitEarly, false)
    assert.equal(result.changes.length, 1)
    const c = result.changes[0]!
    assert.ok(c.original[0] >= 1 && c.original[1] <= a!.length + 1)
    assert.ok(c.modified[0] >= 1 && c.modified[1] <= b!.length + 1)
  }
})
