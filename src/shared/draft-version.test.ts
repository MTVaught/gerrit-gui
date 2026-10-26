import { test } from 'node:test'
import assert from 'node:assert/strict'
import { draftVersion, requireDraftVersion } from './draft-version.ts'
import type { ReviewComment } from './types.ts'

const saved: ReviewComment = {
  id: 'draft', path: 'review.ts', patch_set: 2, side: 'REVISION', line: 1,
  message: 'Line draft', unresolved: true, updated: '2026-10-26 14:13:53.072000000',
  range: { start_line: 1, start_character: 0, end_line: 1, end_character: 6 },
  fix_suggestions: [{ description: 'Limit', replacements: [{ path: 'review.ts', range: { start_line: 1, start_character: 0, end_line: 1, end_character: 6 }, replacement: 'const' }] }],
}

test('a saved draft and its persisted read have the same version despite fractional precision', () => {
  for (const updated of ['2026-10-26 14:13:53', '2026-10-26 14:13:53.000000000', '2026-10-26 14:13:53.999']) {
    requireDraftVersion([{ ...saved, updated }], saved.id, draftVersion(saved))
  }
  assert.equal(saved.updated, '2026-10-26 14:13:53.072000000', 'keep display precision')
  assert.notEqual(draftVersion(saved), draftVersion({ ...saved, updated: '2026-10-26 14:13:54.000000000' }))
})

test('same-second content and source changes still reject stale updates and deletes', () => {
  const changes: Partial<ReviewComment>[] = [
    { message: 'Changed in another window' }, { unresolved: false }, { path: 'another.ts' },
    { patch_set: 3 }, { side: 'PARENT' }, { line: 2 },
    { range: { ...saved.range!, end_character: 7 } },
    { fix_suggestions: [{ ...saved.fix_suggestions![0]!, description: 'Changed fix' }] },
  ]
  for (const change of changes) {
    assert.throws(() => requireDraftVersion([{ ...saved, updated: '2026-10-26 14:13:53.000000000', ...change }], saved.id, draftVersion(saved)), /Draft conflict/)
  }
  assert.throws(() => requireDraftVersion([], saved.id, draftVersion(saved)), /Draft conflict/, 'deleted or published draft')
  assert.throws(() => requireDraftVersion([saved], saved.id), /Draft conflict/, 'missing expected version')
})

test('unknown timestamp formats do not collapse into a shared version', () => {
  for (const updated of ['now', '1', '2', '', '2026-10-26T14:13:53.072Z', '2026-10-26 14:13:53.fraction', '2026-10-26 14:13:53.0720000000']) {
    assert.equal(JSON.parse(draftVersion({ ...saved, updated }))[1], updated)
  }
})
