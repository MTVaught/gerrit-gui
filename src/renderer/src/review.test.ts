import { test } from 'node:test'
import assert from 'node:assert/strict'
import { diffContents, reviewLanguage } from './review.ts'

test('whole-file models preserve context, whitespace, blank lines and both sides of edits', () => {
  const contents = diffContents({ content: [{ ab: ['start', ''] }, { a: ['old', 'deleted'], b: ['new'] }, { b: ['\tadded  '] }, { ab: ['end', ''] }] })
  assert.equal(contents.original, 'start\n\nold\ndeleted\nend\n')
  assert.equal(contents.modified, 'start\n\nnew\n\tadded  \nend\n')
  assert.equal(contents.originalLines, 6)
  assert.equal(contents.modifiedLines, 6)
  assert.throws(() => diffContents({ content: [{ skip: 10 }] }), /missing/)
  assert.deepEqual(diffContents({ content: [] }), { original: '', modified: '', originalLines: 0, modifiedLines: 0 })
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
