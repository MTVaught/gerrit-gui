/** Hashtag the author sets once a change is approved and they want it merged. */
export const READY_TO_MERGE_TAG = 'ready-to-merge'
/**
 * Custom keyed value holding the patch set number the author asked to have
 * reviewed. Only the change owner (or an admin) can write it. When it does not
 * match the current patch set, no review is outstanding.
 */
export const REVIEW_REQUESTED_KEY = 'review-requested-ps'
export const CODE_REVIEW = 'Code-Review'
export const POLL_INTERVAL_MS = 45_000
