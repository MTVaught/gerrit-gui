import type { AccountInfo, ChangeInfo, ChangeView, ReviewState, ReviewerStatus } from './types.ts'
import { CODE_REVIEW, READY_TO_MERGE_TAG, REVIEW_REQUESTED_KEY } from './constants.ts'

export function isBot(a: AccountInfo): boolean {
  return a.tags?.includes('SERVICE_USER') ?? false
}

export function displayName(a: AccountInfo | undefined): string {
  if (!a) return '?'
  return a.name || a.username || a.email || `#${a._account_id}`
}

/** Code-Review votes on the current patch set, keyed by account id. */
export function currentVotes(change: ChangeInfo): Map<number, number> {
  const votes = new Map<number, number>()
  for (const a of change.labels?.[CODE_REVIEW]?.all ?? []) {
    votes.set(a._account_id, a.value ?? 0)
  }
  return votes
}

export function humanReviewers(change: ChangeInfo): AccountInfo[] {
  return (change.reviewers?.REVIEWER ?? []).filter(
    (r) => !isBot(r) && r._account_id !== change.owner._account_id,
  )
}

export function hasTag(change: ChangeInfo, tag: string): boolean {
  return change.hashtags?.includes(tag) ?? false
}

export function requestedPatchSet(change: ChangeInfo): number | null {
  const n = parseInt(change.custom_keyed_values?.[REVIEW_REQUESTED_KEY] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

function permittedRange(change: ChangeInfo): { min: number; max: number } {
  const vals = (change.permitted_labels?.[CODE_REVIEW] ?? []).map((v) => parseInt(v, 10))
  if (vals.length === 0) return { min: 0, max: 0 }
  return { min: Math.min(...vals), max: Math.max(...vals) }
}

/**
 * Derive the workflow state for one change.
 *
 *  in-progress    author has not asked for review of the current patch set
 *  needs-review   review requested on this patch set; someone has not voted yet
 *                 (early -1s do not change this; the last reviewer decides)
 *  needs-changes  every reviewer has voted and at least one is negative
 *  approved       every reviewer voted +1 on the current patch set
 *  ready-to-merge approved and the author tagged it for the merger, whose
 *                 +2 and submit happen together (reviewers never +2)
 *
 * WIP is not part of this. Review can happen on WIP patch sets, with
 * the WIP flag left to control when CI runs. Gerrit clears votes on a
 * new patch set, so a follow-up push the author did not re-request review for
 * drops back to in-progress instead of pinging everyone again.
 */
export function classify(change: ChangeInfo, selfId: number): ChangeView {
  const votes = currentVotes(change)
  const reviewers: ReviewerStatus[] = humanReviewers(change).map((account) => ({
    account,
    vote: votes.get(account._account_id) ?? 0,
  }))
  const pending = reviewers.filter((r) => r.vote === 0).map((r) => r.account)
  const negatives = reviewers.filter((r) => r.vote < 0)
  const isMine = change.owner._account_id === selfId
  const iAmReviewer = reviewers.some((r) => r.account._account_id === selfId)
  const myVote = votes.get(selfId) ?? 0
  const tagged = hasTag(change, READY_TO_MERGE_TAG)
  const rev = change.current_revision ? change.revisions?.[change.current_revision] : undefined
  const patchSet = rev?._number ?? 0
  const requested = requestedPatchSet(change)
  const reviewRequested = requested !== null && requested === patchSet
  const open = change.status === 'NEW'
  const canVote = permittedRange(change)

  // The outcome is decided only when the last reviewer has voted; until then a
  // change stays under review no matter which way the early votes went.
  const everyoneVoted = reviewers.length > 0 && pending.length === 0
  let state: ReviewState
  if (change.status === 'MERGED') state = 'merged'
  else if (change.status === 'ABANDONED') state = 'abandoned'
  else if (everyoneVoted && negatives.length > 0) state = 'needs-changes'
  else if (everyoneVoted) state = tagged ? 'ready-to-merge' : 'approved'
  else if (reviewRequested) state = 'needs-review'
  else state = 'in-progress'

  return {
    change,
    state,
    reviewers,
    pending,
    wip: change.work_in_progress === true,
    requestedPatchSet: requested,
    reviewRequested,
    isMine,
    iAmReviewer,
    needsMyReview: open && !isMine && iAmReviewer && reviewRequested && myVote === 0,
    myVote,
    patchSet,
    staleReadyToMerge: open && tagged && state !== 'ready-to-merge',
    canMerge: open && canVote.max >= 2,
    canVote,
  }
}

export function classifyAll(changes: ChangeInfo[], selfId: number): ChangeView[] {
  return changes.map((c) => classify(c, selfId))
}

export const STATE_LABEL: Record<ReviewState, string> = {
  'in-progress': 'In progress',
  'needs-review': 'Needs review',
  'needs-changes': 'Needs changes',
  approved: 'Approved',
  'ready-to-merge': 'Ready to merge',
  merged: 'Merged',
  abandoned: 'Abandoned',
}

function projectScope(projects: string[]): string {
  const terms = projects
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.endsWith('*') ? `projects:${p.slice(0, -1)}` : `project:${p}`))
  return terms.length === 0 ? '' : ` (${terms.join(' OR ')})`
}

/**
 * Searches that together cover everything the board shows.
 *
 * Gerrit's reviewer:/reviewerin: operators exclude WIP changes (observed on
 * 3.11.2; not in the Gerrit docs), and review can happen on WIP patch sets, so
 * the second query scans open WIP changes owned by others; the caller keeps
 * only those where the user is a reviewer.
 */
export function dashboardQueries(projects: string[] = []): { direct: string; wipScan: string; merged: string } {
  return {
    direct: `is:open (owner:self OR reviewer:self OR hashtag:${READY_TO_MERGE_TAG})`,
    wipScan: `is:open is:wip -owner:self${projectScope(projects)}`,
    merged: `is:merged (owner:self OR reviewer:self) -age:14d`,
  }
}

export function isReviewer(change: ChangeInfo, accountId: number): boolean {
  return (change.reviewers?.REVIEWER ?? []).some((r) => r._account_id === accountId)
}
