import type { ReviewComment } from './types.ts'

export function draftVersion(comment: ReviewComment): string {
  return JSON.stringify([comment.id, comment.updated, comment.message ?? '', Boolean(comment.unresolved), comment.fix_suggestions ?? [], comment.path, comment.patch_set, comment.side ?? 'REVISION', comment.line, comment.range])
}

export function requireDraftVersion(drafts: ReviewComment[], id: string, expected?: string): void {
  const current = drafts.find(comment => comment.id === id)
  if (!current || !expected || draftVersion(current) !== expected) throw new Error('Draft conflict: another window changed, deleted, or published this draft. Your text is kept.')
}
