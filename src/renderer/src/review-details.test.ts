import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentSuggestions, relativeCommentDate, reviewOutline } from './review-details.ts'
import type { ReviewComment } from '../../shared/types.ts'
const comment: ReviewComment = { id: 'c', patch_set: 2, path: 'src/a.ts', updated: '', line: 8, range: { start_line: 7, start_character: 2, end_line: 8, end_character: 9 }, message: 'Try this:\n```suggestion\nconst limit = 10;\n```', unresolved: true }
test('fenced suggestions preserve exact anchors, refuse parent-side writes and retain structured fixes', () => {
  const fixes = commentSuggestions(comment)
  assert.deepEqual(fixes[0]?.replacements, [{ path: comment.path, range: comment.range, replacement: 'const limit = 10;' }])
  assert.equal(commentSuggestions({ ...comment, side: 'PARENT' }).length, 0)
  assert.equal(commentSuggestions({ ...comment, message: '```suggestion:-2+1\nunsafe offset\n```' }).length, 0)
  assert.equal(commentSuggestions({ ...comment, fix_suggestions: fixes }).length, 2)
  assert.deepEqual(commentSuggestions({ ...comment, range: undefined, context_lines: [{ line_number: 8, context_line: '  old();' }] })[0]?.replacements[0]?.range, { start_line: 8, start_character: 0, end_line: 8, end_character: 8 })
  assert.equal(commentSuggestions({ ...comment, range: undefined }).length, 0, 'line length must be known before replacing the whole line')
})
test('relative times use Gerrit UTC timestamps with nanosecond precision', () => {
  assert.equal(relativeCommentDate('2026-10-06 12:00:00.123456789', Date.parse('2026-10-06T12:03:00Z')), '2 minutes ago')
  assert.equal(relativeCommentDate('broken timestamp'), 'broken timestamp')
})
test('local outline finds declarations and methods without indexing every fixture constant', () => {
  assert.deepEqual(reviewOutline('export class Scheduler {\n  enqueue(event: Event): void {\n  }\n}\nexport const case1 = { retries: 1 };\ndef python_task():\n  pass'), [{ line: 1, name: 'export class Scheduler {' }, { line: 2, name: 'enqueue(event: Event): void {' }, { line: 6, name: 'def python_task():' }])
})
