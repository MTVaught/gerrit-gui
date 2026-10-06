import type { ChangeLink, CommentAnchor, ReviewComment, ReviewCommentPosition } from '../../shared/types.ts'
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

export function displayCommentAnchor(link: ChangeLink, path: string, originalPath: string, comment: ReviewComment, positions: ReviewCommentPosition[]): CommentAnchor | null {
  const anchor: CommentAnchor = { patchSet: comment.patch_set, path: comment.path, side: comment.side ?? 'REVISION', parent: comment.parent, line: comment.line, range: comment.range }
  if (commentPane(link, path, originalPath, comment)) return anchor
  return positions.find(position => position.id === comment.id && commentPane(link, path, originalPath, { ...position.anchor, patch_set: position.anchor.patchSet, id: comment.id, updated: '' }))?.anchor ?? null
}
