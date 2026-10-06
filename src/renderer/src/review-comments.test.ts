import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentAnchor, commentThreads, commentPane } from './review-comments.ts'
import type { ReviewComment } from '../../shared/types.ts'
test('unchanged lines and ranges attach to the correct patch set and side, including renames', () => {
  const link = { id: 42, project: 'p', patchSet: 5 }
  const range = { start_line: 10, start_character: 2, end_line: 12, end_character: 7 }
  assert.deepEqual(commentAnchor(link, 'new.ts', 'old.ts', 'original', 12, range), { patchSet: 5, path: 'new.ts', side: 'PARENT', line: 12, range })
  assert.deepEqual(commentAnchor({ ...link, basePatchSet: 2 }, 'new.ts', 'old.ts', 'original', 12), { patchSet: 2, path: 'old.ts', side: 'REVISION', line: 12, range: undefined })
  assert.equal(commentAnchor({ ...link, basePatchSet: 2 }, 'new.ts', 'old.ts', 'modified', 100000).patchSet, 5)
})
test('threads retain orphan comments and order replies independently of API map ordering', () => {
  const comment = (id: string, updated: string, in_reply_to?: string): ReviewComment => ({ id, updated, in_reply_to, patch_set: 1, path: 'a', message: id })
  assert.deepEqual(commentThreads([comment('reply2', '3', 'reply1'), comment('root', '1'), comment('reply1', '2', 'root'), comment('orphan', '0', 'missing')]).map(t => t.map(c => c.id)), [['root', 'reply1', 'reply2'], ['orphan']])
})

test('existing comments reveal the correct pane and never confuse parent with an older patch set', () => {
  const link = { id: 42, project: 'p', patchSet: 5, basePatchSet: 2 }
  const comment: ReviewComment = { id: 'c', patch_set: 2, path: 'old.ts', line: 10000, updated: 'now' }
  assert.equal(commentPane(link, 'new.ts', 'old.ts', comment), 'original')
  assert.equal(commentPane(link, 'new.ts', 'old.ts', { ...comment, patch_set: 5, path: 'new.ts' }), 'modified')
  assert.equal(commentPane(link, 'new.ts', 'old.ts', { ...comment, patch_set: 5, path: 'new.ts', side: 'PARENT' }), null)
  assert.equal(commentPane({ ...link, basePatchSet: undefined }, 'new.ts', 'old.ts', { ...comment, patch_set: 5, path: 'new.ts', side: 'PARENT' }), 'original')
})
