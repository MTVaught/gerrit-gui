import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffContents, reviewLanguage, visibleRebaseRanges } from './review.ts'

test('whole-file models preserve context, whitespace, blank lines and both sides of edits', () => {
  const contents = diffContents({ content: [{ ab: ['start', ''] }, { a: ['old', 'deleted'], b: ['new'] }, { b: ['\tadded  '] }, { ab: ['end', ''] }] })
  assert.equal(contents.original, 'start\n\nold\ndeleted\nend\n')
  assert.equal(contents.modified, 'start\n\nnew\n\tadded  \nend\n')
  assert.equal(contents.originalLines, 6)
  assert.equal(contents.modifiedLines, 6)
  assert.throws(() => diffContents({ content: [{ skip: 10 }] }), /missing/)
  assert.deepEqual(diffContents({ content: [] }), { original: '', modified: '', originalLines: 0, modifiedLines: 0, diffBlocks: [] })
  assert.equal(diffContents({ content: [{ b: ['added'] }] }).original, '')
  assert.equal(diffContents({ content: [{ a: ['deleted'] }] }).modified, '')
})

test('large context chunks reconstruct fully without JS argument-count limits', () => {
  const lines = Array.from({ length: 200000 }, (_, i) => `line ${i + 1}`)
  const contents = diffContents({ content: [{ ab: lines }, { a: ['old last'], b: ['new last'] }] })
  assert.equal(contents.originalLines, 200001)
  assert.equal(contents.modifiedLines, 200001)
  assert.ok(contents.original.endsWith('line 200000\nold last'))
  assert.ok(contents.modified.endsWith('line 200000\nnew last'))
})

test('file names pick tokenizers and unknown extensions fall back to plain text', () => {
  assert.equal(reviewLanguage('src/main.cpp'), 'cpp')
  assert.equal(reviewLanguage('src/App.TSX'), 'typescript')
  assert.equal(reviewLanguage('Dockerfile'), 'dockerfile')
  assert.equal(reviewLanguage('logs/output.unknown'), 'plaintext')
  assert.equal(reviewLanguage('/COMMIT_MSG'), 'plaintext')
})

test('rebase metadata preserves independent side coordinates through additions and deletions', () => {
  const contents = diffContents({ content: [
    { ab: ['context'] }, { b: ['regular addition'] },
    { a: ['old base', 'removed base'], b: ['new base'], due_to_rebase: true },
    { ab: ['context 2'] }, { a: ['deleted base'], due_to_rebase: true },
    { b: ['added base'], due_to_rebase: true }, { a: ['regular deletion'] },
  ] })
  assert.deepEqual(contents.rebaseChanges, [
    { pane: 'original', start: 2, end: 3 }, { pane: 'modified', start: 3, end: 3 },
    { pane: 'original', start: 5, end: 5 }, { pane: 'modified', start: 5, end: 5 },
  ])
  assert.equal(contents.original, 'context\nold base\nremoved base\ncontext 2\ndeleted base\nregular deletion')
})

test('rebase colors only cover classified edits remaining in the local whitespace diff', () => {
  const ranges = [{ pane: 'original' as const, start: 2, end: 4 }, { pane: 'modified' as const, start: 2, end: 4 }]
  assert.deepEqual(visibleRebaseRanges(ranges, []), [])
  assert.deepEqual(visibleRebaseRanges(ranges, [
    { originalStartLineNumber: 3, originalEndLineNumber: 3, modifiedStartLineNumber: 3, modifiedEndLineNumber: 3 },
    { originalStartLineNumber: 4, originalEndLineNumber: 0, modifiedStartLineNumber: 4, modifiedEndLineNumber: 4 },
  ]), [
    { pane: 'original', start: 3, end: 3 }, { pane: 'modified', start: 3, end: 3 }, { pane: 'modified', start: 4, end: 4 },
  ])
})
