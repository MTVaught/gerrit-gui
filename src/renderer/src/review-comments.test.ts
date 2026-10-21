import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commentAnchor, commentThreads, commentPane, displayCommentAnchor, commentReply, commentSelection } from './review-comments.ts'
import type { ReviewComment } from '../../shared/types.ts'

test('new comment selections exclude a final newline and preserve ordinary ranges', () => {
  const selection = { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 }
  const expected = { line: 1, range: { start_line: 1, start_character: 0, end_line: 1, end_character: 27 } }
  assert.deepEqual(commentSelection(selection, () => 27), expected)
  // Monaco orders the range bounds independently of the active cursor.
  assert.deepEqual(commentSelection({ ...selection, ...{ positionLineNumber: 1, positionColumn: 1 } }, () => 27), expected)
  assert.deepEqual(selection, { startLineNumber: 1, startColumn: 1, endLineNumber: 2, endColumn: 1 })
  const noRead = () => { throw new Error('ordinary selections must not read source lengths') }
  assert.deepEqual(commentSelection({ ...selection, endLineNumber: 1, endColumn: 1 }, noRead), { line: 1 })
  assert.deepEqual(commentSelection({ ...selection, endLineNumber: 1, endColumn: 8 }, noRead), {
    line: 1, range: { start_line: 1, start_character: 0, end_line: 1, end_character: 7 },
  })
  assert.deepEqual(commentSelection({ ...selection, startColumn: 4, endColumn: 3 }, noRead), {
    line: 2, range: { start_line: 1, start_character: 3, end_line: 2, end_character: 2 },
  })
  assert.deepEqual(commentSelection({ ...selection, startColumn: 28 }, () => 27), { line: 1 }, 'newline only')
  assert.deepEqual(commentSelection(selection, () => 0), { line: 1 }, 'empty line newline only')
})

test('boundary comments read one source line and retain blank lines and source columns', () => {
  for (const newline of ['\n', '\r\n']) {
    const lines = ['first', 'start', '', '\t😀 end  ', ''].join(newline).split(/\r?\n/)
    const reads: number[] = []
    const length = (line: number) => { reads.push(line); return lines[line - 1]!.length }
    assert.deepEqual(commentSelection({ startLineNumber: 2, startColumn: 3, endLineNumber: 5, endColumn: 1 }, length), {
      line: 4, range: { start_line: 2, start_character: 2, end_line: 4, end_character: '\t😀 end  '.length },
    }, 'tabs, Unicode, trailing spaces, and EOF newline use source lengths')
    assert.deepEqual(reads, [4], 'only the final included line is read')
    reads.length = 0
    assert.deepEqual(commentSelection({ startLineNumber: 1, startColumn: 2, endLineNumber: 4, endColumn: 1 }, length), {
      line: 3, range: { start_line: 1, start_character: 1, end_line: 3, end_character: 0 },
    }, 'a final blank line is retained')
    assert.deepEqual(reads, [3])
  }
})

test('reply writes preserve the immediate parent ID and complete original anchor', () => {
  const range = { start_line: 10, start_character: 2, end_line: 12, end_character: 7 }
  const root: ReviewComment = { id: 'root', patch_set: 1, path: 'before.ts', line: 12, range, side: 'PARENT', parent: 2, updated: '1' }
  const reply: ReviewComment = { ...root, id: 'last', in_reply_to: root.id, patch_set: 2, updated: '2' }
  assert.deepEqual(commentReply(root), { anchor: { patchSet: 1, path: 'before.ts', line: 12, range, side: 'PARENT', parent: 2 }, inReplyTo: 'root' })
  assert.deepEqual(commentReply(reply), { anchor: { patchSet: 2, path: 'before.ts', line: 12, range, side: 'PARENT', parent: 2 }, inReplyTo: 'last' })
  assert.equal(commentReply({ ...root, side: undefined, parent: undefined }).anchor.side, 'REVISION')
  assert.deepEqual(commentReply({ ...root, line: undefined, range: undefined }).anchor.range, undefined)
})
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


test('ported display coordinates preserve canonical anchors and require server mapping', () => {
  const link = { id: 42, project: 'p', patchSet: 5, basePatchSet: 2 }
  const comment: ReviewComment = { id: 'old', patch_set: 1, path: 'before.ts', line: 10000, updated: 'now' }
  const mapped = { patchSet: 5, path: 'new.ts', side: 'REVISION' as const, line: 7, range: { start_line: 6, end_line: 7, start_character: 1, end_character: 4 } }
  assert.equal(displayCommentAnchor(link, 'new.ts', 'old.ts', comment, []), null)
  assert.deepEqual(displayCommentAnchor(link, 'new.ts', 'old.ts', comment, [{ id: 'old', anchor: mapped }]), mapped)
  assert.equal(comment.line, 10000)
  assert.equal(comment.patch_set, 1)
  assert.equal(displayCommentAnchor(link, 'other.ts', 'other.ts', comment, [{ id: 'old', anchor: mapped }]), null)
  const base = { ...mapped, patchSet: 2, path: 'old.ts', line: 8 }
  assert.deepEqual(displayCommentAnchor(link, 'new.ts', 'old.ts', comment, [{ id: 'old', anchor: base }]), base)
  assert.equal(displayCommentAnchor(link, 'new.ts', 'old.ts', comment, [{ id: 'old', anchor: { ...mapped, side: 'PARENT' } }]), null)
  const selected = { ...comment, patch_set: 2, path: 'old.ts' }
  assert.equal(displayCommentAnchor(link, 'new.ts', 'old.ts', selected, [{ id: 'old', anchor: mapped }])?.line, 10000)
})

test('new reply composers and drafts inherit a known parent mapping without changing write coordinates', () => {
  const link = { id: 42, project: 'p', patchSet: 3 }
  const parent: ReviewComment = { id: 'parent', patch_set: 1, path: 'old.ts', line: 9998, updated: '1' }
  const draft: ReviewComment = { ...parent, id: 'draft', in_reply_to: parent.id, updated: '2' }
  const mapped = { patchSet: 3, path: 'new.ts', side: 'REVISION' as const, line: 14 }
  const positions = [{ id: parent.id, anchor: mapped }]
  for (const comment of [{ ...draft, id: '' }, draft]) {
    assert.deepEqual(displayCommentAnchor(link, 'new.ts', 'new.ts', comment, positions, [parent]), mapped)
    assert.equal(commentReply(comment).anchor.patchSet, 1)
    assert.equal(commentReply(comment).anchor.line, 9998)
    assert.equal(displayCommentAnchor({ ...link, patchSet: 4 }, 'new.ts', 'new.ts', comment, positions, [parent]), null)
    assert.equal(displayCommentAnchor(link, 'elsewhere.ts', 'elsewhere.ts', comment, positions, [parent]), null)
    assert.equal(displayCommentAnchor(link, 'new.ts', 'new.ts', comment, [], [parent]), null)
  }
  const direct = { ...mapped, line: 18 }
  assert.deepEqual(displayCommentAnchor(link, 'new.ts', 'new.ts', draft, [...positions, { id: draft.id, anchor: direct }], [parent]), direct, 'a draft-specific server mapping wins')
  assert.deepEqual(displayCommentAnchor({ ...link, basePatchSet: 1 }, 'new.ts', 'old.ts', draft, positions, [parent])?.line, 9998, 'an anchor already visible on the selected base is preserved')
})

test('reply display can follow known chains, but missing parents and cycles do not invent positions', () => {
  const link = { id: 42, project: 'p', patchSet: 3 }
  const root: ReviewComment = { id: 'root', patch_set: 1, path: 'old.ts', line: 7, updated: '1' }
  const parent = { ...root, id: 'parent', in_reply_to: root.id }
  const reply = { ...root, id: 'reply', in_reply_to: parent.id }
  const anchor = { patchSet: 3, path: 'new.ts', side: 'REVISION' as const, line: 20 }
  assert.deepEqual(displayCommentAnchor(link, 'new.ts', 'new.ts', reply, [{ id: root.id, anchor }], [root, parent]), anchor)
  assert.equal(displayCommentAnchor(link, 'new.ts', 'new.ts', reply, [], []), null)
  assert.equal(displayCommentAnchor(link, 'new.ts', 'new.ts', reply, [], [{ ...parent, in_reply_to: reply.id }, reply]), null)
  assert.equal(displayCommentAnchor(link, 'new.ts', 'new.ts', { ...reply, in_reply_to: reply.id }, [], [reply]), null)
})
