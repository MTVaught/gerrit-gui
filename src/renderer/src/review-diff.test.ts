import { test } from 'node:test'
import assert from 'node:assert/strict'
import { computeReviewDiff } from './review-diff.ts'
import type { ReviewWhitespace } from './review-preferences.ts'
import { diffContents } from './review.ts'
const compute = (original: string[], modified: string[], whitespace: ReviewWhitespace) => computeReviewDiff({ id: 1, original, modified, whitespace, timeout: 10000 })

test('Gerrit anchors keep a rebased function intact when it repeats the old return and brace', () => {
  const file = diffContents({ content: [
    { ab: ['function existing() {'] },
    { a: ['  return false;'], b: ['  return true;'] },
    { ab: ['}', ''] },
    { b: ['function rebasedFunction() {', '  return false;', '}', ''], due_to_rebase: true },
  ] })
  const original = file.original.split('\n')
  const modified = file.modified.split('\n')
  // Reproduce the old whole-file algorithm stealing the existing function's tail.
  assert.deepEqual(compute(original, modified, 'IGNORE_NONE').changes.map(c => c.modified), [[2, 6]])
  for (const whitespace of ['IGNORE_NONE', 'IGNORE_TRAILING', 'IGNORE_LEADING_AND_TRAILING', 'IGNORE_ALL'] as const) {
    const result = computeReviewDiff({ id: 1, original, modified, whitespace, timeout: 10000, blocks: file.diffBlocks })
    assert.deepEqual(result.changes.map(c => [c.original, c.modified]), [[[2, 3], [2, 3]], [[5, 5], [5, 9]]])
    assert.deepEqual(file.rebaseChanges, [{ pane: 'modified', start: 5, end: 8 }])
    const reversed = computeReviewDiff({ id: 2, original: modified, modified: original, whitespace, timeout: 10000,
      blocks: file.diffBlocks!.map(block => ({ original: block.modified, modified: block.original })),
    })
    assert.deepEqual(reversed.changes.map(c => [c.original, c.modified]), [[[2, 3], [2, 3]], [[5, 9], [5, 5]]])
  }
})

test('server blocks still filter whitespace, retain source columns, and merge adjacent hunks', () => {
  const file = diffContents({ content: [
    { ab: ['context'] },
    { a: ['same   '], b: ['same'], due_to_rebase: true },
    { a: ['\treturn oldName;'], b: ['  return newName;'] },
    { b: ['added'], due_to_rebase: true },
    { ab: ['tail'] },
  ] })
  const run = (whitespace: ReviewWhitespace) => computeReviewDiff({ id: 1, original: file.original.split('\n'), modified: file.modified.split('\n'), whitespace, timeout: 10000, blocks: file.diffBlocks })
  assert.deepEqual(run('IGNORE_NONE').changes.map(c => [c.original, c.modified]), [[[2, 4], [2, 5]]])
  const filtered = run('IGNORE_ALL')
  assert.deepEqual(filtered.changes.map(c => [c.original, c.modified]), [[[3, 4], [3, 5]]])
  assert.equal(filtered.changes[0]!.innerChanges[0]!.original.startLineNumber, 3)
  assert.ok(filtered.changes[0]!.innerChanges[0]!.original.startColumn > 1)
  assert.ok(filtered.changes[0]!.innerChanges[0]!.modified.startColumn > 2)
})

test('all four whitespace modes preserve Gerrit comparison semantics', () => {
  assert.equal(compute(['foo  '], ['foo'], 'IGNORE_NONE').changes.length, 1)
  assert.equal(compute(['foo  '], ['foo'], 'IGNORE_TRAILING').changes.length, 0)
  assert.equal(compute([' foo'], ['foo'], 'IGNORE_TRAILING').changes.length, 1)
  assert.equal(compute([' foo  '], ['foo'], 'IGNORE_LEADING_AND_TRAILING').changes.length, 0)
  assert.equal(compute(['foo bar'], ['foobar'], 'IGNORE_LEADING_AND_TRAILING').changes.length, 1)
  assert.equal(compute(['\tfoo bar  '], ['foobar'], 'IGNORE_ALL').changes.length, 0)
})

test('tab indentation is ignored across adjacent Gerrit deletion and insertion chunks', () => {
  const code = ['function deliver() {', '  send(batch);', '}']
  for (const content of [
    [{ a: code, b: code.map(line => '\t' + line) }],
    [{ a: code }, { b: code.map(line => '\t' + line), due_to_rebase: true }],
    [{ b: code.map(line => '\t' + line) }, { a: code }],
  ]) {
    const file = diffContents({ content: [{ ab: ['// context'] }, ...content, { ab: ['// tail'] }] })
    for (const whitespace of ['IGNORE_NONE', 'IGNORE_TRAILING', 'IGNORE_LEADING_AND_TRAILING', 'IGNORE_ALL'] as const) {
      const result = computeReviewDiff({ id: 1, original: file.original.split('\n'), modified: file.modified.split('\n'), blocks: file.diffBlocks, whitespace, timeout: 10000 })
      assert.equal(result.changes.length, whitespace === 'IGNORE_NONE' || whitespace === 'IGNORE_TRAILING' ? 1 : 0, whitespace)
      assert.equal(result.quitEarly, false)
    }
  }
})

test('filtering adjacent chunks retains real edits, source columns, and unchanged anchors', () => {
  const file = diffContents({ content: [
    { ab: ['// context'] },
    { a: ['function deliver() {', '  send(oldBatch);', '}'] },
    { b: ['\tfunction deliver() {', '\t  send(newBatch);', '\t}'], due_to_rebase: true },
    { ab: ['', '// anchor'] },
    { a: ['removed();'] },
    { ab: ['// another anchor'] },
    { b: ['\tremoved();', '\tadded();'] },
    { ab: ['// tail'] },
  ] })
  for (const whitespace of ['IGNORE_LEADING_AND_TRAILING', 'IGNORE_ALL'] as const) {
    const result = computeReviewDiff({ id: 1, original: file.original.split('\n'), modified: file.modified.split('\n'), blocks: file.diffBlocks, whitespace, timeout: 10000 })
    assert.deepEqual(result.changes.map(c => [c.original, c.modified]), [
      [[3, 4], [3, 4]], [[7, 8], [7, 7]], [[9, 9], [8, 10]],
    ])
    const inner = result.changes[0]!.innerChanges[0]!
    assert.equal(inner.original.startLineNumber, 3)
    assert.equal(inner.modified.startLineNumber, 3)
    assert.equal(inner.modified.startColumn, inner.original.startColumn + 1)
  }
})

test('a new loop and braces stay changed while its tab-indented body is ignored', () => {
  const body = ['  const payload = prepare(event);', '  send(payload);', '  recordDelivery(payload);', '  flush();']
  const wrapped = ['  for (const event of events) {', ...body.map(line => '\t' + line), '  }']
  for (const content of [[{ a: body, b: wrapped }], [{ a: body }, { b: wrapped }]]) {
    const file = diffContents({ content: [
      { ab: ['function deliver(events: Event[]) {'] }, ...content, { ab: ['}', ''] },
    ] })
    for (const whitespace of ['IGNORE_LEADING_AND_TRAILING', 'IGNORE_ALL'] as const) {
      const result = computeReviewDiff({ id: 1, original: file.original.split('\n'), modified: file.modified.split('\n'), blocks: file.diffBlocks, whitespace, timeout: 10000 })
      assert.deepEqual(result.changes.map(c => [c.original, c.modified]), [[[2, 2], [2, 3]], [[6, 6], [7, 8]]])
    }
  }
})
test('switching whitespace modes leaves loaded source, blocks, and rebase ranges intact', () => {
  const file = diffContents({ content: [
    { ab: ['// context'] },
    { a: ['  send(event);', '  flush();'] },
    { b: ['  for (const event of events) {', '\t  send(event);', '\t  flush();', '  }'], due_to_rebase: true },
    { ab: ['// tail'] },
  ] })
  const snapshot = structuredClone(file)
  const original = file.original.split('\n')
  const modified = file.modified.split('\n')
  for (const whitespace of ['IGNORE_ALL', 'IGNORE_NONE', 'IGNORE_LEADING_AND_TRAILING', 'IGNORE_TRAILING'] as const) {
    computeReviewDiff({ id: 1, original, modified, blocks: file.diffBlocks, whitespace, timeout: 10000 })
    assert.deepEqual(file, snapshot)
    assert.equal(original.join('\n'), snapshot.original)
    assert.equal(modified.join('\n'), snapshot.modified)
  }
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
