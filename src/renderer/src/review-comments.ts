import type { ChangeLink, CommentAnchor, ReviewComment, ReviewCommentPosition } from '../../shared/types.ts'
export function originalCommentAnchor(comment: ReviewComment): CommentAnchor {
  return { patchSet: comment.patch_set, path: comment.path, side: comment.side ?? 'REVISION', parent: comment.parent, line: comment.line, range: comment.range }
}
export function commentReply(comment: ReviewComment): { anchor: CommentAnchor; inReplyTo: string } {
  return { anchor: originalCommentAnchor(comment), inReplyTo: comment.id }
}
export function commentAnchor(link: ChangeLink, path: string, originalPath: string, pane: 'original' | 'modified', line?: number, range?: CommentAnchor['range']): CommentAnchor {
  return { patchSet: pane === 'original' && link.basePatchSet ? link.basePatchSet : link.patchSet!, path: pane === 'original' && link.basePatchSet ? originalPath : path, side: pane === 'original' && !link.basePatchSet ? 'PARENT' : 'REVISION', line, range }
}
export function commentThreads(comments: ReviewComment[]): ReviewComment[][] {
  const byId = new Map(comments.map(c => [c.id, c]))
  const groups = new Map<string, ReviewComment[]>()
  for (const comment of comments) {
    let root = comment
    const seen = new Set([root.id])
    while (root.in_reply_to && byId.has(root.in_reply_to) && !seen.has(root.in_reply_to)) {
      root = byId.get(root.in_reply_to)!
      seen.add(root.id)
    }
    const group = groups.get(root.id) ?? []
    group.push(comment); groups.set(root.id, group)
  }
  return [...groups.values()].map(group => group.sort((a, b) => a.updated.localeCompare(b.updated) || a.id.localeCompare(b.id)))
}

export function commentPane(link: ChangeLink, path: string, originalPath: string, comment: ReviewComment): 'original' | 'modified' | null {
  if (comment.side === 'PARENT') return !link.basePatchSet && comment.patch_set === link.patchSet && comment.path === path ? 'original' : null
  if (comment.patch_set === link.patchSet && comment.path === path) return 'modified'
  return comment.patch_set === link.basePatchSet && comment.path === originalPath ? 'original' : null
}

export function displayCommentAnchor(link: ChangeLink, path: string, originalPath: string, comment: ReviewComment, positions: ReviewCommentPosition[], comments: ReviewComment[] = []): CommentAnchor | null {
  // A new reply has no mapping of its own yet. Its known parent can place it
  // in the thread without changing the anchor that is sent to Gerrit.
  const seen = new Set<string>()
  let current: ReviewComment | undefined = comment
  while (current && !seen.has(current.id)) {
    seen.add(current.id)
    if (commentPane(link, path, originalPath, current)) return originalCommentAnchor(current)
    const mapped = positions.find(position => position.id === current!.id && commentPane(link, path, originalPath, { ...position.anchor, patch_set: position.anchor.patchSet, id: current!.id, updated: '' }))
    if (mapped) return mapped.anchor
    current = current.in_reply_to ? comments.find(parent => parent.id === current!.in_reply_to) : undefined
  }
  return null
}
