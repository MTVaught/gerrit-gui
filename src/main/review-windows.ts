import type { AppWindowContext, ChangeLink } from '../shared/types.ts'

export function validateReviewLink(link: ChangeLink): void {
  if (!link || !Number.isSafeInteger(link.id) || link.id < 1 || typeof link.project !== 'string' || !link.project.trim()) throw new Error('Invalid review change')
  for (const number of [link.patchSet, link.basePatchSet]) {
    if (number !== undefined && (!Number.isSafeInteger(number) || number < 1)) throw new Error('Invalid patch set')
  }
}

/** Contents IDs identify instances. Identical reviews must never share an entry. */
export class ReviewWindows<T> {
  private entries = new Map<number, { window: T; context: Extract<AppWindowContext, { kind: 'review' }>; closeToken?: number }>()
  private sequence = 0
  add(id: number, window: T, context: Omit<Extract<AppWindowContext, { kind: 'review' }>, 'instanceId'>): void {
    this.entries.set(id, { window, context: { ...context, instanceId: id } })
  }
  delete(id: number): void { this.entries.delete(id) }
  get(id: number) { return this.entries.get(id) }
  get size(): number { return this.entries.size }
  requestClose(id: number): number | undefined {
    const entry = this.entries.get(id)
    if (!entry || entry.closeToken) return undefined
    return entry.closeToken = ++this.sequence
  }
  finishClose(id: number, token: number): T | undefined {
    const entry = this.entries.get(id)
    if (!entry || entry.closeToken !== token) return undefined
    entry.closeToken = undefined
    return entry.window
  }
  authorize(id: number, channel: string, args: unknown[], connection: number): void {
    const entry = this.entries.get(id)
    if (!entry) return
    const allowed = new Set(['window:context', 'window:close', 'window:closeReply', 'settings:get', 'settings:patch', 'preferences:get', 'preferences:patch', 'app:openUrl', 'gerrit:openChange', 'gerrit:changeUrl', 'gerrit:fetchChange', 'gerrit:reviewBlame', 'gerrit:previewReviewFix', 'gerrit:applyProvidedReviewFix', 'gerrit:reviewFiles', 'gerrit:reviewDiff', 'gerrit:reviewPatchSets', 'gerrit:reviewReviewedFiles', 'gerrit:setReviewFileReviewed', 'gerrit:reviewCommentPositions', 'gerrit:reviewDiscussion', 'gerrit:saveReviewDraft', 'gerrit:deleteReviewDraft', 'gerrit:deleteReviewComment', 'gerrit:applyReviewFix', 'gerrit:submitReview', 'gerrit:act', 'gerrit:suggestReviewers', 'gerrit:suggestAccounts', 'gerrit:lookupAccounts'])
    if (!allowed.has(channel)) throw new Error('This window is limited to its review')
    if (channel === 'settings:patch' && Object.keys((args[0] ?? {}) as object).some(key => !['diffTheme', 'theme'].includes(key))) throw new Error('Review windows can change only appearance settings')
    if (!channel.startsWith('gerrit:')) return
    if (entry.context.connection !== connection) throw new Error('Connection changed. Close and reopen this review. Unsaved text is kept here.')
    if (['gerrit:suggestAccounts', 'gerrit:lookupAccounts'].includes(channel)) return
    const target = args[0]
    const link = typeof target === 'object' && target ? target as ChangeLink : undefined
    if (!entry.context.link || (link?.id ?? target) !== entry.context.link.id || (link?.project !== undefined && link.project !== entry.context.link.project)) throw new Error('This window is limited to its selected change')
    if (channel === 'gerrit:act' && (args[0] as { type: string }).type !== 'removeReviewer') throw new Error('This board action is unavailable in a review window')
  }
}
