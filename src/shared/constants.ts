/** Hashtag the author sets once a change is approved and they want it merged. */
export const READY_TO_MERGE_TAG = 'ready-to-merge'
/**
 * Hashtag prefix naming the person the author asked to merge: `merger:alice`,
 * with the Gerrit username (or the email address for an account without one)
 * in lower case. Set together with `ready-to-merge`; one per change.
 */
export const MERGER_TAG_PREFIX = 'merger:'
/**
 * Hashtag prefix naming a primary reviewer: `reviewer:bob`, one tag per
 * person, keyed like the merger tag. The votes of the tagged people decide
 * the state; every other reviewer on the change is shown but not waited for.
 */
export const REVIEWER_TAG_PREFIX = 'reviewer:'
/**
 * Custom keyed value listing every patch set the author asked to have
 * reviewed, comma-separated in the order asked: "2,4,5". Each request appends;
 * only the last entry can be the open request, and only when it equals the
 * current patch set. The earlier entries say which rounds the change has been
 * through, so a change pushed after a review is told from one nobody has
 * looked at. Only the change owner (or an admin) can write it. An older
 * version wrote a single number, which reads as a one-entry list.
 */
export const REVIEW_REQUESTED_KEY = 'review-requested-ps'
/**
 * Custom keyed value holding the patch set number the author tagged
 * ready-to-merge. Written with the tag; the tag only counts while it matches
 * the current patch set, so a push after the request (even one that keeps
 * the votes, like a trivial rebase) takes the change off the merger's queue.
 */
export const READY_TO_MERGE_KEY = 'ready-to-merge-ps'
export const CODE_REVIEW = 'Code-Review'
/** CI's label: a +1 on the current patch set is required before the author may ask for the merge. */
export const VERIFIED = 'Verified'
export const POLL_INTERVAL_MS = 45_000
