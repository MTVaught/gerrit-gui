import type {
  AccountInfo,
  ActionCategory,
  ActionCounts,
  ChangeInfo,
  ChangeLink,
  ChangeView,
  MergerRule,
  ReviewState,
  ReviewerStatus,
  TabId,
} from './types.ts'
import { CODE_REVIEW, MERGER_TAG_PREFIX, READY_TO_MERGE_TAG, REVIEWER_TAG_PREFIX, REVIEW_REQUESTED_KEY } from './constants.ts'

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

/** Trim, lower-case and de-duplicate a team list as typed in Settings. */
export function normalizeTeam(team: string[]): string[] {
  const out: string[] = []
  for (const raw of team) {
    const t = raw.trim().toLowerCase()
    if (t && !out.includes(t)) out.push(t)
  }
  return out
}

/**
 * Team entries are usernames or email addresses, compared case-insensitively.
 * The signed-in user is always a member, so a forgotten entry never hides
 * their own vote or their review requests.
 */
export function isTeamMember(a: AccountInfo, team: string[], selfId: number): boolean {
  if (a._account_id === selfId) return true
  const keys = [a.username, a.email].filter((k): k is string => Boolean(k)).map((k) => k.toLowerCase())
  return team.some((t) => keys.includes(t))
}

/** Does a project pattern from Settings (exact name, prefix ending in "*", or "*") match a project? */
export function projectMatches(pattern: string, project: string): boolean {
  const p = pattern.trim()
  if (p === '*') return true
  if (p.endsWith('*')) return project.startsWith(p.slice(0, -1))
  return p === project
}

/** Trim the patterns, normalize the people, drop empty rows. */
export function normalizeMergers(rules: MergerRule[]): MergerRule[] {
  return rules
    .map((r) => ({ project: r.project.trim(), people: normalizeTeam(r.people) }))
    .filter((r) => r.project.length > 0 && r.people.length > 0)
}

/**
 * The people to offer as mergers for a project: every matching rule, the
 * most specific first (exact name, then the longest prefix, then "*"), each
 * person once.
 */
export function mergersFor(project: string, rules: MergerRule[]): string[] {
  const specificity = (p: string) => (p === '*' ? 0 : p.endsWith('*') ? p.length : Number.MAX_SAFE_INTEGER)
  const out: string[] = []
  for (const r of rules.filter((r) => projectMatches(r.project, project)).sort((a, b) => specificity(b.project) - specificity(a.project))) {
    for (const p of r.people) if (!out.includes(p)) out.push(p)
  }
  return out
}

/** The rules with `person` added to the row for `project`, or a new exact row for it. */
export function addMerger(rules: MergerRule[], project: string, person: string): MergerRule[] {
  const key = accountKey(person)
  const i = rules.findIndex((r) => r.project === project)
  if (i < 0) return normalizeMergers([...rules, { project, people: [key] }])
  return normalizeMergers(rules.map((r, j) => (j === i ? { ...r, people: [...r.people, key] } : r)))
}

export function hasTag(change: ChangeInfo, tag: string): boolean {
  return change.hashtags?.includes(tag) ?? false
}

/** The `merger:` hashtags on a change, as written; usually none or one. */
export function mergerTags(change: ChangeInfo): string[] {
  return (change.hashtags ?? []).filter((t) => t.startsWith(MERGER_TAG_PREFIX) && t.length > MERGER_TAG_PREFIX.length)
}

/** The tag for one person: `merger:alice`. */
export function mergerTag(merger: string): string {
  return MERGER_TAG_PREFIX + accountKey(merger)
}

/** Who the author asked to merge: the first `merger:` tag, or null. */
export function requestedMerger(change: ChangeInfo): string | null {
  const t = mergerTags(change)[0]
  return t ? accountKey(t.slice(MERGER_TAG_PREFIX.length)) : null
}

/** The `reviewer:` hashtags on a change, as written: one per primary reviewer. */
export function reviewerTags(change: ChangeInfo): string[] {
  return (change.hashtags ?? []).filter((t) => t.startsWith(REVIEWER_TAG_PREFIX) && t.length > REVIEWER_TAG_PREFIX.length)
}

/** The tag for one primary reviewer: `reviewer:bob`. */
export function reviewerTag(reviewer: string): string {
  return REVIEWER_TAG_PREFIX + accountKey(reviewer)
}

/** The keys the `reviewer:` tags name, lower-case, in tag order, each once. */
export function primaryReviewerKeys(change: ChangeInfo): string[] {
  const out: string[] = []
  for (const t of reviewerTags(change)) {
    const k = accountKey(t.slice(REVIEWER_TAG_PREFIX.length))
    if (!out.includes(k)) out.push(k)
  }
  return out
}

/** The tags on a change that name this account, by username or email: what a demotion removes. */
export function reviewerTagsFor(change: ChangeInfo, a: AccountInfo): string[] {
  const keys = accountKeys(a)
  return reviewerTags(change).filter((t) => keys.includes(accountKey(t.slice(REVIEWER_TAG_PREFIX.length))))
}

/** A username or email address as stored in the team list and in the merger tag. */
export function accountKey(s: string): string {
  return s.trim().toLowerCase()
}

/** The keys that name this account: its username and its email, lower-case. */
export function accountKeys(a: AccountInfo): string[] {
  return [a.username, a.email].filter((k): k is string => Boolean(k)).map(accountKey)
}

export function requestedPatchSet(change: ChangeInfo): number | null {
  const n = parseInt(change.custom_keyed_values?.[REVIEW_REQUESTED_KEY] ?? '', 10)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** Highest Code-Review vote the user may cast on this change. */
function maxPermittedVote(change: ChangeInfo): number {
  const vals = (change.permitted_labels?.[CODE_REVIEW] ?? []).map((v) => parseInt(v, 10))
  return vals.length === 0 ? 0 : Math.max(...vals)
}

/**
 * The last patch set the user reviewed: the highest one they voted or replied
 * on, from the change messages. Gerrit's own messages (new patch set, rebase,
 * ready) are tagged autogenerated and do not count, so uploading or rebasing
 * someone else's change is not a review of it.
 */
export function lastReviewedPatchSet(change: ChangeInfo, selfId: number): number | null {
  let last: number | null = null
  for (const m of change.messages ?? []) {
    if (m.author?._account_id !== selfId) continue
    if (m.tag?.startsWith('autogenerated:')) continue
    if (m._revision_number === undefined) continue
    if (last === null || m._revision_number > last) last = m._revision_number
  }
  return last
}

/**
 * What the Review button opens: the diff from the last patch set the user
 * reviewed to the current one, or the current patch set against base when
 * they never reviewed it or already reviewed this one.
 */
export function reviewLink(view: ChangeView): ChangeLink {
  const link: ChangeLink = { id: view.change._number, project: view.change.project, patchSet: view.patchSet }
  const last = view.lastReviewedPatchSet
  if (last !== null && last < view.patchSet) link.basePatchSet = last
  return link
}

/**
 * Derive the workflow state for one change.
 *
 *  in-progress    author has not asked for review of the current patch set
 *  needs-review   review requested on this patch set; a primary reviewer has
 *                 not voted yet (early -1s do not change this; the last one
 *                 decides), or nobody is tagged as primary yet
 *  needs-changes  every primary reviewer has voted and at least one is negative
 *  approved       every primary reviewer voted +1 on the current patch set
 *  ready-to-merge approved and the author tagged it for the merger, whose
 *                 +2 and submit happen together (reviewers never +2)
 *
 * The primary reviewers are the people named by `reviewer:` hashtags. Anyone
 * else on the change in Gerrit is shown with their vote, but not waited for.
 * A tag names a person by username or email, like the merger tag; when the
 * person is not on the change in Gerrit, a stand-in account is built from
 * the tag so that they are still shown and waited for.
 *
 * WIP is not part of this. Review can happen on WIP patch sets, with
 * the WIP flag left to control when CI runs. Gerrit clears votes on a
 * new patch set, so a follow-up push the author did not re-request review for
 * drops back to in-progress instead of pinging everyone again.
 *
 * `team` (usernames or emails from Settings) decides only whether the owner
 * is on the team, which picks the tabs the change is listed on. `selfKeys`
 * is `accountKeys(self)`: the reviewer and merger tags are matched against it.
 */
export function classify(change: ChangeInfo, selfId: number, team: string[] = [], selfKeys: string[] = []): ChangeView {
  const votes = currentVotes(change)
  const everyone: ReviewerStatus[] = humanReviewers(change).map((account) => ({
    account,
    vote: votes.get(account._account_id) ?? 0,
  }))
  const ownerKeys = accountKeys(change.owner)
  const reviewers: ReviewerStatus[] = []
  const primaryIds = new Set<number>()
  for (const key of primaryReviewerKeys(change)) {
    if (ownerKeys.includes(key)) continue
    const known = everyone.find((r) => accountKeys(r.account).includes(key))
    if (known) {
      // One person tagged twice (username and email) is one primary reviewer.
      if (!primaryIds.has(known.account._account_id)) reviewers.push({ ...known, key })
      primaryIds.add(known.account._account_id)
      continue
    }
    // A bot tagged by mistake stays out, like a bot added as a reviewer.
    if ((change.reviewers?.REVIEWER ?? []).some((r) => isBot(r) && accountKeys(r).includes(key))) continue
    reviewers.push({ account: standIn(key, reviewers.length), vote: 0, key, tagOnly: true })
  }
  const otherReviewers = everyone.filter((r) => !primaryIds.has(r.account._account_id))
  const members = normalizeTeam(team)
  const teamScoped = members.length > 0
  const pending = reviewers.filter((r) => r.vote === 0).map((r) => r.account)
  const negatives = reviewers.filter((r) => r.vote < 0)
  const isMine = change.owner._account_id === selfId
  const iAmPrimary = reviewers.some((r) => r.account._account_id === selfId || (r.tagOnly === true && selfKeys.includes(r.key!)))
  const iAmReviewer = iAmPrimary || everyone.some((r) => r.account._account_id === selfId)
  const myVote = votes.get(selfId) ?? 0
  const tagged = hasTag(change, READY_TO_MERGE_TAG)
  const rev = change.current_revision ? change.revisions?.[change.current_revision] : undefined
  const patchSet = rev?._number ?? 0
  const requested = requestedPatchSet(change)
  const reviewRequested = requested !== null && requested === patchSet
  const open = change.status === 'NEW'
  const merger = requestedMerger(change)

  // The outcome is decided only when the last primary reviewer has voted;
  // until then a change stays under review no matter which way the early
  // votes went. With nobody tagged there is nobody to decide, so a request
  // waits until someone is.
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
    otherReviewers,
    teamScoped,
    externalOwner: teamScoped && !isTeamMember(change.owner, members, selfId),
    wip: change.work_in_progress === true,
    isPrivate: change.is_private === true,
    requestedPatchSet: requested,
    reviewRequested,
    isMine,
    iAmReviewer,
    iAmPrimary,
    needsMyReview: open && !isMine && iAmPrimary && reviewRequested && myVote === 0,
    myVote,
    patchSet,
    patchSetCreated: rev?.created ?? change.created,
    lastReviewedPatchSet: lastReviewedPatchSet(change, selfId),
    staleReadyToMerge: open && tagged && state !== 'ready-to-merge',
    requestedMerger: merger,
    mergeRequestedFromMe: merger !== null && selfKeys.includes(merger),
    canMerge: open && maxPermittedVote(change) >= 2,
  }
}

/**
 * An account for a tagged person who is not on the change in Gerrit. The id
 * is negative so it never collides with a real one; the UI resolves the name
 * from the key, as it does for the merger tag.
 */
function standIn(key: string, n: number): AccountInfo {
  return key.includes('@') ? { _account_id: -(n + 1), email: key } : { _account_id: -(n + 1), username: key }
}

/** `selfKeys` is `accountKeys(self)`: the merger tag is matched against it. */
export function classifyAll(changes: ChangeInfo[], selfId: number, team: string[] = [], selfKeys: string[] = []): ChangeView[] {
  return changes.map((c) => classify(c, selfId, team, selfKeys))
}

/**
 * The merge waits on this user: the author named them, or the tag names
 * nobody (an older version made it) and they can vote +2.
 */
export function mergeWaitsOnMe(v: ChangeView): boolean {
  return v.state === 'ready-to-merge' && (v.mergeRequestedFromMe || (v.requestedMerger === null && v.canMerge))
}

/**
 * Internal or external is decided by the owner alone, cross-referenced with
 * the team list in Settings. Who reviews does not matter, because CI and
 * maintainer lists add reviewers from outside the team to the team's own
 * changes, and those must stay on My Changes and Reviewing. Without a team
 * everything is internal.
 *
 * An internal change is listed on the five regular tabs and never on
 * External Reviews. An external change is listed on External Reviews only.
 */
export function isInternal(v: ChangeView): boolean {
  return !v.externalOwner
}

/** Open changes owned by someone outside the team: the External Reviews tab, and nowhere else. */
export function isExternalReview(v: ChangeView): boolean {
  return v.change.status === 'NEW' && v.externalOwner
}

/**
 * Open changes owned by a teammate: the Team Reviews tab, which lists them
 * whether or not the user reviews them. Unlike External Reviews this tab is
 * not exclusive: a teammate's change the user reviews is on Reviewing too.
 */
export function isTeamReview(v: ChangeView): boolean {
  return v.change.status === 'NEW' && v.teamScoped && !v.externalOwner && !v.isMine
}

export interface Group {
  title: string
  hint?: string
  items: ChangeView[]
}

function byState(items: ChangeView[], order: ReviewState[], titles?: Partial<Record<ReviewState, string>>): Group[] {
  return order
    .map((s) => ({ title: titles?.[s] ?? STATE_LABEL[s], items: items.filter((v) => v.state === s) }))
    .filter((g) => g.items.length > 0)
}

const REVIEWER_ORDER: ReviewState[] = ['needs-changes', 'approved', 'ready-to-merge', 'in-progress']
const REVIEWER_TITLES: Partial<Record<ReviewState, string>> = { 'in-progress': 'Author iterating, no review requested' }

/** Sections for the tabs that list other people's changes: the same on Reviewing, Team Reviews and External Reviews. */
function reviewerGroups(items: ChangeView[]): Group[] {
  return [
    { title: 'Waiting on you', items: items.filter((v) => v.needsMyReview && v.state === 'needs-review') },
    { title: 'Reviewed, waiting on others', items: items.filter((v) => !v.needsMyReview && v.state === 'needs-review') },
    ...byState(items, REVIEWER_ORDER, REVIEWER_TITLES),
  ].filter((g) => g.items.length > 0)
}

/**
 * The sections of one tab, before the View filter. Every tab except External
 * Reviews lists internal changes only (see isInternal); External Reviews
 * lists the open external ones. No change is on both kinds of tab. Team
 * Reviews lists every open internal change of somebody else, reviewed or not.
 */
export function groupsFor(tab: TabId, views: ChangeView[]): Group[] {
  const internal = views.filter(isInternal)
  const open = internal.filter((v) => v.change.status === 'NEW')
  switch (tab) {
    case 'needs-my-review':
      return [{ title: 'Waiting on you', items: open.filter((v) => v.needsMyReview) }].filter((g) => g.items.length > 0)
    case 'reviewing':
      return reviewerGroups(open.filter((v) => v.iAmReviewer && !v.isMine))
    case 'mine': {
      // Private changes are kept apart at the bottom, whatever their state:
      // nobody but the people on them can see them, so they are not part of
      // the team's picture of what is out for review.
      const mine = open.filter((v) => v.isMine)
      return [
        ...byState(
          mine.filter((v) => !v.isPrivate),
          ['needs-changes', 'approved', 'ready-to-merge', 'needs-review', 'in-progress'],
          { 'needs-review': 'Out for review', 'in-progress': 'In Progress, review not requested' },
        ),
        {
          title: 'Private',
          hint: 'Visible only to you, the reviewers and the CCs. The state of each is on its row.',
          items: mine.filter((v) => v.isPrivate),
        },
      ].filter((g) => g.items.length > 0)
    }
    case 'ready-to-merge':
      // The merger's queue: what the author asked of this user, and nothing asked of somebody else.
      return [
        { title: 'Asked of you', items: open.filter((v) => v.state === 'ready-to-merge' && v.mergeRequestedFromMe) },
        {
          title: 'Tagged without a merger',
          hint: 'Tagged by an older version of the application, which named nobody. Anyone who can vote +2 may merge these.',
          items: open.filter((v) => v.state === 'ready-to-merge' && v.requestedMerger === null && v.canMerge),
        },
        {
          title: 'Tagged but no longer approved',
          hint: 'A new patch set reset the votes. The owner should request review again or clear the tag.',
          items: open.filter((v) => v.staleReadyToMerge && (v.isMine || v.mergeRequestedFromMe)),
        },
      ].filter((g) => g.items.length > 0)
    case 'merged':
      return [{ title: 'Merged in the last 14 days', items: internal.filter((v) => v.change.status === 'MERGED') }]
    case 'team-reviews':
      return reviewerGroups(views.filter(isTeamReview))
    case 'external-reviews':
      return reviewerGroups(views.filter(isExternalReview))
  }
}

/**
 * The number on each tab: how many cards its sections list before the View
 * filter. A Change-Id family is one card wherever it is, so it counts once.
 */
export function tabCounts(views: ChangeView[]): Record<TabId, number> {
  const c = {} as Record<TabId, number>
  for (const tab of TAB_IDS) c[tab] = countFamilies(groupsFor(tab, views).flatMap((g) => g.items))
  return c
}

const TAB_IDS: readonly TabId[] = ['needs-my-review', 'reviewing', 'mine', 'ready-to-merge', 'merged', 'team-reviews', 'external-reviews']

/** How many cards a list of changes makes: each Change-Id once. */
export function countFamilies(views: ChangeView[]): number {
  return new Set(views.map((v) => familyKey(v.change))).size
}

export interface ActionCategoryInfo {
  id: ActionCategory
  /** Short name for the tray menu and tooltip. */
  label: string
  /** Menu bar pill color; white text passes 4.5:1 on each. */
  color: string
  /** Monochrome stand-in for the color, for the glyph badge style. */
  glyph: string
  /** Board tab that lists these changes. */
  tab: TabId
}

/** Fixed order everywhere the counts appear, so position carries meaning as well as color. */
export const ACTION_CATEGORIES: readonly ActionCategoryInfo[] = [
  { id: 'review', label: 'Needs Review', color: '#2563eb', glyph: '\u25c9', tab: 'needs-my-review' },
  { id: 'fix', label: 'Needs Changes', color: '#dc2626', glyph: '\u270e', tab: 'mine' },
  { id: 'ready', label: 'Approved', color: '#15803d', glyph: '\u25c6', tab: 'mine' },
  { id: 'merge', label: 'Ready to Merge', color: '#7c3aed', glyph: '\u21e7', tab: 'ready-to-merge' },
]

/**
 * How many cards wait on this user, by the action they need to take:
 *  review  I am a primary reviewer and the author asked for a review of the current patch set
 *  fix     my change got a negative outcome; push corrections
 *  ready   my change is approved; mark it ready to merge
 *  merge   the author asked me to merge (or nobody was named and I may +2)
 * A Change-Id family is one card, so it counts once per category however
 * many of its branches need that action, the same as the tabs and sections.
 * A family with a branch to fix and another to mark ready is in both.
 */
export function actionCounts(views: ChangeView[]): ActionCounts {
  const keys: Record<ActionCategory, Set<string>> = { review: new Set(), fix: new Set(), ready: new Set(), merge: new Set() }
  for (const v of views) {
    // Each category opens a regular tab, and those list internal changes only.
    if (v.change.status !== 'NEW' || !isInternal(v)) continue
    const key = familyKey(v.change)
    if (v.needsMyReview) keys.review.add(key)
    if (v.isMine && v.state === 'needs-changes') keys.fix.add(key)
    if (v.isMine && v.state === 'approved') keys.ready.add(key)
    if (mergeWaitsOnMe(v)) keys.merge.add(key)
  }
  return { review: keys.review.size, fix: keys.fix.size, ready: keys.ready.size, merge: keys.merge.size }
}

export function totalActions(c: ActionCounts): number {
  return c.review + c.fix + c.ready + c.merge
}

/** "Needs Review 3, Needs Changes 1" style summary; zero categories are left out. */
export function describeActions(c: ActionCounts): string {
  const parts = ACTION_CATEGORIES.filter((k) => c[k.id] > 0).map((k) => `${k.label} ${c[k.id]}`)
  return parts.length ? parts.join(', ') : 'Nothing waits on you'
}

/**
 * Categories to draw in the menu bar: those with something pending, plus,
 * with showZero, the ones a user always has at some point. Merge is left out
 * at zero even then, because only users with +2 rights ever get a merge
 * count, and for everyone else the pill would be a permanent zero.
 */
export function visibleCategories(c: ActionCounts, showZero = false): ActionCategoryInfo[] {
  return ACTION_CATEGORIES.filter((k) => c[k.id] > 0 || (showZero && k.id !== 'merge'))
}

/**
 * Menu bar title for the glyph style, e.g. "◉ 3  ✎ 1". Zero categories are
 * left out, so it is empty when nothing is pending, unless showZero keeps
 * them in place (merge excepted; see visibleCategories).
 */
export function glyphTitle(c: ActionCounts, showZero = false): string {
  return visibleCategories(c, showZero)
    .map((k) => `${k.glyph} ${c[k.id]}`)
    .join('  ')
}

export const STATE_LABEL: Record<ReviewState, string> = {
  'in-progress': 'In Progress',
  'needs-review': 'Needs Review',
  'needs-changes': 'Needs Changes',
  approved: 'Approved',
  'ready-to-merge': 'Ready to Merge',
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
 * only those where the user is a reviewer. A `reviewer:` tag naming the user
 * (`selfKeys`) is searched for as well, so a primary reviewer who was taken
 * off the change in Gerrit still sees it. The team query fetches the open
 * changes of every teammate for the Team Reviews tab; it is empty without a
 * team, and the caller then skips it.
 */
export function dashboardQueries(projects: string[] = [], selfKeys: string[] = [], team: string[] = []): { direct: string; wipScan: string; merged: string; team: string } {
  const mine = ['owner:self', 'reviewer:self', `hashtag:${READY_TO_MERGE_TAG}`, ...selfKeys.map((k) => `hashtag:${reviewerTag(k)}`)]
  const owners = normalizeTeam(team).map((k) => `owner:${k}`)
  return {
    direct: `is:open (${mine.join(' OR ')})`,
    wipScan: `is:open is:wip -owner:self${projectScope(projects)}`,
    merged: `is:merged (owner:self OR reviewer:self) -age:14d`,
    team: owners.length === 0 ? '' : `is:open -owner:self (${owners.join(' OR ')})${projectScope(projects)}`,
  }
}

/** Tagged as a primary reviewer, matched by username or email. */
export function isTaggedReviewer(change: ChangeInfo, keys: string[]): boolean {
  return primaryReviewerKeys(change).some((k) => keys.includes(k))
}

export function isReviewer(change: ChangeInfo, accountId: number): boolean {
  return (change.reviewers?.REVIEWER ?? []).some((r) => r._account_id === accountId)
}

/**
 * Changes that share one Change-Id. Gerrit makes a separate change for each
 * branch (or project) a commit is cherry-picked to, and all of them keep the
 * Change-Id of the original commit.
 */
export interface ChangeFamily {
  /** The shared Change-Id, or the change's own id when Gerrit did not send one. */
  key: string
  /** In the order the caller gave; the first member leads the family. */
  members: ChangeView[]
}

export function familyKey(change: ChangeInfo): string {
  return change.change_id || change.id
}

/**
 * Bucket views by Change-Id without changing their order: a family sits where
 * its first member sits, and members keep their relative order. A change with
 * no cherry-picks is a family of one. Merged members stay in the family, so a
 * card can say that the change is already in on another branch.
 */
export function groupByChangeId(views: ChangeView[]): ChangeFamily[] {
  const families = new Map<string, ChangeFamily>()
  for (const v of views) {
    const key = familyKey(v.change)
    const f = families.get(key)
    if (f) f.members.push(v)
    else families.set(key, { key, members: [v] })
  }
  return [...families.values()]
}

/** Copy sorted by project, then branch, then change number: the row order inside a family card. */
export function sortByBranch(views: ChangeView[]): ChangeView[] {
  return views
    .slice()
    .sort(
      (a, b) =>
        a.change.project.localeCompare(b.change.project) ||
        a.change.branch.localeCompare(b.change.branch) ||
        a.change._number - b.change._number,
    )
}

/**
 * Urgency of a state, most urgent first. The same for the owner and for a
 * reviewer: a negative outcome needs a fix, an open request needs a look, a
 * change being iterated may need attention soon, an approved change only
 * waits for the owner to mark it, and a ready change waits on the merger.
 * Used to decide which branch of a family leads the card.
 */
export const URGENCY: readonly ReviewState[] = [
  'needs-changes',
  'needs-review',
  'in-progress',
  'approved',
  'ready-to-merge',
  'merged',
  'abandoned',
]

export function urgency(state: ReviewState): number {
  return URGENCY.indexOf(state)
}

/**
 * How many members of a family are in each state, most urgent state first.
 * Shown on the card header, since the section only says where the lead is.
 */
export function stateTally(members: ChangeView[]): { state: ReviewState; count: number }[] {
  const n = new Map<ReviewState, number>()
  for (const v of members) n.set(v.state, (n.get(v.state) ?? 0) + 1)
  return URGENCY.filter((st) => n.has(st)).map((state) => ({ state, count: n.get(state)! }))
}

/** Short form of a Change-Id for labels: "I3f2a91c…". */
export function shortChangeId(key: string): string {
  return key.length > 9 ? key.slice(0, 8) + '\u2026' : key
}

/** Row order inside each group. Applies to every tab. */
export type SortId = 'updated' | 'age' | 'patchset'

export const SORT_OPTIONS: { id: SortId; label: string; title: string }[] = [
  { id: 'updated', label: 'Most recent update', title: 'Changes with the newest activity first' },
  { id: 'age', label: 'Overall age, oldest first', title: 'Oldest changes first, by the date the change was created' },
  { id: 'patchset', label: 'Last patch set, oldest first', title: 'Changes whose current patch set has waited longest first, by the date it was pushed' },
]

export const DEFAULT_SORT: SortId = 'updated'

/** Return a sorted copy. Gerrit timestamps are zero-padded UTC strings, so string order is time order. */
export function sortViews(views: ChangeView[], sort: SortId): ChangeView[] {
  const byNumber = (a: ChangeView, b: ChangeView) => a.change._number - b.change._number
  return views.slice().sort((a, b) => {
    if (sort === 'age') {
      return a.change.created.localeCompare(b.change.created) || byNumber(a, b)
    }
    if (sort === 'patchset') {
      return a.patchSetCreated.localeCompare(b.patchSetCreated) || byNumber(a, b)
    }
    return b.change.updated.localeCompare(a.change.updated) || byNumber(b, a)
  })
}

/**
 * Owner groups a filter can name without picking accounts: the user's own
 * changes. Inside or outside the team is not a scope, because the tabs already
 * split on it (see groupsFor): every row on a regular tab is owned by the
 * team, and every row on External Reviews by someone else.
 */
export type AuthorScope = 'me'

export const AUTHOR_SCOPES: { id: AuthorScope; label: string; title: string }[] = [{ id: 'me', label: 'Me', title: 'Changes you own' }]

/**
 * What the View menu narrows the rows to. Authors and scopes are one
 * condition: a change passes if its owner is a picked account or falls in a
 * picked scope. The search matches the subject, or the change number exactly.
 * Rows are filtered inside each section, so the sections and their order stay.
 */
export interface ViewFilter {
  search: string
  authors: AccountInfo[]
  scopes: AuthorScope[]
}

export const EMPTY_FILTER: ViewFilter = { search: '', authors: [], scopes: [] }

export function isFilterActive(f: ViewFilter): boolean {
  return f.search.trim().length > 0 || f.authors.length > 0 || f.scopes.length > 0
}

function inScope(v: ChangeView, scope: AuthorScope): boolean {
  switch (scope) {
    case 'me':
      return v.isMine
  }
}

export function matchesFilter(v: ChangeView, f: ViewFilter): boolean {
  const q = f.search.trim().toLowerCase()
  if (q && !v.change.subject.toLowerCase().includes(q) && String(v.change._number) !== q) return false
  if (f.authors.length === 0 && f.scopes.length === 0) return true
  const owner = v.change.owner._account_id
  return f.authors.some((a) => a._account_id === owner) || f.scopes.some((s) => inScope(v, s))
}

export function filterViews(views: ChangeView[], f: ViewFilter): ChangeView[] {
  return isFilterActive(f) ? views.filter((v) => matchesFilter(v, f)) : views
}

export interface OwnerCount {
  account: AccountInfo
  count: number
}

/** The owners of these changes, most changes first, then by name: the first suggestions in the author picker. */
export function ownersOf(views: ChangeView[]): OwnerCount[] {
  const m = new Map<number, OwnerCount>()
  for (const v of views) {
    const o = v.change.owner
    const cur = m.get(o._account_id)
    if (cur) cur.count++
    else m.set(o._account_id, { account: o, count: 1 })
  }
  return [...m.values()].sort((a, b) => b.count - a.count || displayName(a.account).localeCompare(displayName(b.account)))
}

/** Case-insensitive prefix match on any word of the name, or on the username or email. */
export function accountMatches(a: AccountInfo, q: string): boolean {
  const t = q.trim().toLowerCase()
  if (!t) return true
  const words = displayName(a).toLowerCase().split(/\s+/)
  return words.some((w) => w.startsWith(t)) || (a.username?.toLowerCase().startsWith(t) ?? false) || (a.email?.toLowerCase().startsWith(t) ?? false)
}
