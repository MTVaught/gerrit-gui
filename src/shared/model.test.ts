import { test } from 'node:test'
import assert from 'node:assert/strict'
import { accountKeys, accountMatches, requestedPatchSets, requestedPatchSetsValue, preferredKey, actionCounts, actionMenu, addMerger, cardGroups, classify, classifyAll, dashboardQueries, describeActions, filterViews, glyphTitle, groupByChangeId, groupsFor, isExternalReview, linkedSlackUrl, slackTag, slackTags, slackUrl, slackDeepLink, normalizeSlackWorkspaces, slackWorkspacesReflect, isSlackTeamId, isInternal, isTaggedReviewer, isTeamReview, isVisibleOnBoard, lastReviewedPatchSet, mergeWaitsOnMe, mergerTag, mergerTags, mergersFor, mergersReflect, normalizeMergers, normalizeTeam, ownersOf, primaryReviewerKeys, projectMatches, requestedMerger, reviewLink, reviewerTag, reviewerTags, reviewerTagsFor, shortChangeId, sortByBranch, sortViews, stateTally, tabCounts, tabSegments, urgency, pastDraft, type ViewFilter } from './model.ts'
import { IN_PERSON_REVIEW_KEY, READY_TO_MERGE_KEY, REVIEW_REQUESTED_KEY } from './constants.ts'
import type { AccountInfo, ChangeInfo, ChangeMessageInfo } from './types.ts'

const alice: AccountInfo = { _account_id: 1, name: 'Alice', username: 'alice', email: 'alice@example.com' }
const bob: AccountInfo = { _account_id: 2, name: 'Bob', username: 'bob', email: 'bob@example.com' }
const carol: AccountInfo = { _account_id: 3, name: 'Carol', username: 'carol', email: 'carol@example.com' }
const bot: AccountInfo = { _account_id: 9, name: 'CI', tags: ['SERVICE_USER'] }
/** Outside the team in the team tests below. */
const erin: AccountInfo = { _account_id: 5, name: 'Erin', username: 'erin', email: 'erin@other.example' }
/** Bob and Carol; Alice is on it only when she is the signed-in user. */
const TEAM = ['bob', 'Carol@Example.com']

function change(opts: {
  reviewers?: AccountInfo[]
  /**
   * Who is tagged `reviewer:`; every reviewer unless given. Tagged people
   * need not be reviewers, and reviewers need not be tagged.
   */
  primary?: AccountInfo[]
  votes?: Record<number, number>
  wip?: boolean
  private?: boolean
  hashtags?: string[]
  status?: ChangeInfo['status']
  patchSet?: number
  /** The patch sets requested, in order; a number is one entry, as an older version wrote it. */
  requested?: number | number[]
  /** Patch set recorded as asked for an in-person review. */
  inPersonPs?: number
  owner?: AccountInfo
  number?: number
  /** Highest Code-Review vote the caller may cast. */
  maxVote?: number
  created?: string
  updated?: string
  /** When the current patch set was pushed. */
  patchSetCreated?: string
  subject?: string
  messages?: ChangeMessageInfo[]
  branch?: string
  /** Patch set recorded with the ready-to-merge tag; the current one when a tagged fixture leaves it out. */
  readyPs?: number | null
  /** Verified votes on the current patch set, by account id. */
  verified?: Record<number, number>
  /** Change-Id shared by cherry-picks; left out to mimic a server that does not send it. */
  changeId?: string
}): ChangeInfo {
  const reviewers = opts.reviewers ?? []
  const keyed: Record<string, string> = {}
  if (opts.requested) keyed[REVIEW_REQUESTED_KEY] = Array.isArray(opts.requested) ? opts.requested.join(',') : String(opts.requested)
  const readyPs = opts.readyPs === undefined ? (opts.hashtags?.includes('ready-to-merge') ? (opts.patchSet ?? 3) : null) : opts.readyPs
  if (readyPs !== null) keyed[READY_TO_MERGE_KEY] = String(readyPs)
  if (opts.inPersonPs !== undefined) keyed[IN_PERSON_REVIEW_KEY] = String(opts.inPersonPs)
  const primary = (opts.primary ?? reviewers).filter((a) => !a.tags?.includes('SERVICE_USER')).map((a) => `reviewer:${a.username ?? a.email}`)
  return {
    id: `demo~${opts.number ?? 1}`,
    change_id: opts.changeId,
    _number: opts.number ?? 1,
    project: 'demo',
    branch: opts.branch ?? 'master',
    subject: opts.subject ?? 's',
    status: opts.status ?? 'NEW',
    owner: opts.owner ?? alice,
    work_in_progress: opts.wip,
    is_private: opts.private,
    hashtags: [...primary, ...(opts.hashtags ?? [])],
    custom_keyed_values: keyed,
    created: opts.created ?? '',
    updated: opts.updated ?? '',
    reviewers: { REVIEWER: reviewers },
    labels: {
      'Code-Review': {
        all: reviewers.map((r) => ({ ...r, value: opts.votes?.[r._account_id] ?? 0 })),
      },
      Verified: {
        all: Object.entries(opts.verified ?? {}).map(([id, value]) => ({ _account_id: Number(id), value })),
      },
    },
    permitted_labels: { 'Code-Review': opts.maxVote === 2 ? ['-2', '-1', ' 0', '+1', '+2'] : ['-1', ' 0', '+1'] },
    current_revision: 'abc',
    revisions: { abc: { _number: opts.patchSet ?? 3, created: opts.patchSetCreated ?? '' } },
    messages: opts.messages,
  }
}

function msg(author: AccountInfo, ps: number, tag?: string): ChangeMessageInfo {
  return { id: `${author._account_id}-${ps}-${tag ?? ''}`, author, date: '', message: '', _revision_number: ps, tag }
}

/** The message Gerrit writes when `author` votes on patch set `ps`. */
function vote(author: AccountInfo, ps: number, value: number): ChangeMessageInfo {
  return { ...msg(author, ps), id: `${author._account_id}-${ps}-vote`, message: `Patch Set ${ps}: Code-Review${value > 0 ? '+' : ''}${value}\n\n(1 comment)` }
}

test('requested patch sets: a list in the order asked, a bare number from an older version, junk dropped', () => {
  assert.deepEqual(requestedPatchSets(change({ requested: [2, 4, 5] })), [2, 4, 5])
  assert.deepEqual(requestedPatchSets(change({ requested: 2 })), [2])
  assert.deepEqual(requestedPatchSets(change({})), [])
  const c = change({})
  c.custom_keyed_values = { [REVIEW_REQUESTED_KEY]: ' 2, x,0,4,4 ' }
  assert.deepEqual(requestedPatchSets(c), [2, 4])
  assert.equal(requestedPatchSetsValue([2, 4], 5), '2,4,5')
  assert.equal(requestedPatchSetsValue([2, 4], 4), '2,4', 'asking again for the same patch set does not duplicate it')
})

test('iterating: a new patch set after a primary reviewer voted on a requested one', () => {
  // Bob voted -1 on patch set 2, which Alice had asked about; patch set 3 is up and not yet requested.
  const c = change({ reviewers: [bob, carol], requested: [1, 2], patchSet: 3, messages: [vote(bob, 2, -1)] })
  const v = classify(c, alice._account_id)
  assert.equal(v.state, 'iterating')
  assert.deepEqual(v.requestedPatchSets, [1, 2])
  assert.deepEqual(v.reviewedPatchSets, [2])
  assert.equal(v.requestedPatchSet, 2)
  assert.equal(v.reviewRequested, false)
  assert.equal(v.canWithdrawReview, false, 'no request is open on this patch set')
})

test('a request nobody answered before the next push leaves the change in progress, not iterating', () => {
  const v = classify(change({ reviewers: [bob], requested: 1, patchSet: 2, messages: [msg(bob, 1)] }), alice._account_id)
  assert.equal(v.state, 'in-progress', 'a comment without a vote is not a review')
  assert.deepEqual(v.reviewedPatchSets, [])
})

test('reviewed: only a primary reviewer counts, and not Gerrit\'s own messages or a removed vote', () => {
  const ci = { ...bot }
  const base = { reviewers: [bob, carol], primary: [bob], requested: [1, 2], patchSet: 3 }
  assert.equal(classify(change({ ...base, messages: [vote(carol, 2, 1)] }), 1).state, 'in-progress', 'Carol is not primary')
  assert.equal(classify(change({ ...base, messages: [{ ...vote(bob, 2, 1), tag: 'autogenerated:gerrit:newPatchSet' }] }), 1).state, 'in-progress')
  assert.equal(classify(change({ ...base, messages: [{ ...vote(bob, 2, 1), message: 'Patch Set 2: -Code-Review' }] }), 1).state, 'in-progress')
  assert.equal(classify(change({ ...base, messages: [vote(ci, 2, 1)] }), 1).state, 'in-progress')
  assert.equal(classify(change({ ...base, messages: [vote(bob, 2, 1)] }), 1).state, 'iterating')
  assert.equal(classify(change({ ...base, messages: [vote(bob, 3, 1)] }), 1).state, 'in-progress', 'a vote on a patch set that was never requested is not a round')
})

test('a re-requested patch set is needs-review; once every reviewer voted the outcome decides, iterating or not', () => {
  const history = { reviewers: [bob], requested: [1, 3], patchSet: 3, messages: [vote(bob, 1, -1)] }
  const open = classify(change(history), 1)
  assert.equal(open.state, 'needs-review')
  assert.equal(open.canWithdrawReview, true, 'a later round can be taken back too; the first stays on record')
  assert.equal(classify(change({ ...history, votes: { 2: 1 } }), 1).state, 'approved')
  assert.deepEqual(classify(change({ ...history, votes: { 2: 1 } }), 1).reviewedPatchSets, [1, 3], 'the current vote comes from the labels')
})

test('withdraw: the owner\'s open request on the current patch set, whichever round and whoever has voted', () => {
  const first = change({ reviewers: [bob, carol], requested: 3 })
  assert.equal(classify(first, alice._account_id).canWithdrawReview, true)
  assert.equal(classify(first, bob._account_id).canWithdrawReview, false, 'not the owner')
  assert.equal(classify(change({ reviewers: [bob, carol], requested: 3, votes: { 2: 1 } }), 1).canWithdrawReview, true, 'Bob voted; his vote stays')
  assert.equal(classify(change({ reviewers: [bob, carol], requested: [2, 3] }), 1).canWithdrawReview, true, 'second request')
  assert.equal(classify(change({ reviewers: [bob, carol], requested: 2, patchSet: 3 }), 1).canWithdrawReview, false, 'request is stale')
  assert.equal(classify(change({ reviewers: [bob, carol], requested: 3, votes: { 2: 1, 3: 1 } }), 1).canWithdrawReview, true, 'everyone voted')
})

test('groupsFor: My Changes lists iterating above in progress; reviewer tabs fold both into one section', () => {
  const iter = change({ number: 1, reviewers: [bob], requested: [1, 2], patchSet: 3, messages: [vote(bob, 2, -1)] })
  const fresh = change({ number: 2, reviewers: [bob], patchSet: 1 })
  const views = classifyAll([iter, fresh], alice._account_id)
  assert.deepEqual(groupsFor('mine', views).map((g) => [g.title, g.items.map((v) => v.change._number)]), [['Iterating', [1]], ['In Progress', [2]]])
  const bobs = classifyAll([iter, fresh], bob._account_id)
  assert.deepEqual(groupsFor('reviewing', bobs).map((g) => [g.title, g.items.map((v) => v.change._number)]), [['Author iterating, no review requested', [1, 2]]])
  assert.deepEqual(tabSegments(views).mine, [{ n: 2, tone: 'wip', label: 'in progress' }].filter(() => false), 'in progress alone is the whole tab, so no segment')
  const withReview = classifyAll([iter, fresh, change({ number: 3, reviewers: [bob], requested: 3 })], alice._account_id)
  assert.deepEqual(tabSegments(withReview).mine, [{ n: 1, tone: 'pending', label: 'out for review' }, { n: 2, tone: 'wip', label: 'in progress' }])
})

test('reviewers with no request are in-progress, nobody is asked, WIP or not', () => {
  for (const wip of [true, false]) {
    const v = classify(change({ wip, reviewers: [bob] }), bob._account_id)
    assert.equal(v.state, 'in-progress')
    assert.equal(v.needsMyReview, false)
    assert.equal(v.wip, wip)
  }
})

test('request on the current patch set asks every reviewer, even on a WIP change', () => {
  const v = classify(change({ wip: true, reviewers: [bob, carol], requested: 3 }), bob._account_id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.reviewRequested, true)
  assert.deepEqual(v.pending.map((a) => a._account_id), [2, 3])
  assert.equal(v.needsMyReview, true)
})

test('a request for an older patch set is not outstanding', () => {
  const v = classify(change({ reviewers: [bob], requested: 2, patchSet: 3 }), bob._account_id)
  assert.equal(v.state, 'in-progress')
  assert.equal(v.requestedPatchSet, 2)
  assert.equal(v.reviewRequested, false)
  assert.equal(v.needsMyReview, false)
})

test('a vote removes that reviewer from pending', () => {
  const v = classify(change({ reviewers: [bob, carol], votes: { 2: 1 }, requested: 3 }), bob._account_id)
  assert.equal(v.state, 'needs-review')
  assert.deepEqual(v.pending.map((a) => a._account_id), [3])
  assert.equal(v.needsMyReview, false)
  assert.equal(v.myVote, 1)
})

test('an early -1 does not decide anything while others are pending', () => {
  const v = classify(change({ reviewers: [bob, carol], votes: { 3: -1 }, requested: 3 }), bob._account_id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.needsMyReview, true, 'bob is still asked to review')
})

test('once everyone has voted, any negative vote means needs changes', () => {
  const v = classify(change({ reviewers: [bob, carol], votes: { 2: 1, 3: -1 }, requested: 3 }), 1)
  assert.equal(v.state, 'needs-changes')
  assert.equal(v.isMine, true)
})

test('sticky -2 from the only reviewer is needs-changes even after a new patch set', () => {
  const v = classify(change({ reviewers: [bob], votes: { 2: -2 }, requested: 2, patchSet: 3 }), 1)
  assert.equal(v.state, 'needs-changes')
})

test('sticky -2 with another reviewer cleared by a new patch set is in-progress', () => {
  const v = classify(change({ reviewers: [bob, carol], votes: { 2: -2 }, requested: 2, patchSet: 3 }), 1)
  assert.equal(v.state, 'in-progress')
})

test('all positive votes means approved; hashtag promotes to ready-to-merge', () => {
  const c = change({ reviewers: [bob, carol], votes: { 2: 1, 3: 2 }, requested: 3 })
  assert.equal(classify(c, 1).state, 'approved')
  c.hashtags!.push('ready-to-merge')
  assert.equal(classify(c, 1).state, 'approved', 'the tag alone is not enough')
  c.custom_keyed_values![READY_TO_MERGE_KEY] = '3'
  assert.equal(classify(c, 1).state, 'ready-to-merge')
  assert.equal(classify(c, 1).readyPatchSet, 3)
  assert.equal(classify(c, 1).staleReadyToMerge, false)
})

test('ready-to-merge tag for an earlier patch set is stale even when copied votes keep the change approved', () => {
  const v = classify(change({ reviewers: [bob], votes: { 2: 2 }, requested: 2, patchSet: 3, hashtags: ['ready-to-merge', 'merger:dave'], readyPs: 2 }), 1)
  assert.equal(v.state, 'approved')
  assert.equal(v.readyPatchSet, 2)
  assert.equal(v.staleReadyToMerge, true)
})

test('ready-to-merge tag without a recorded patch set (older version) is stale', () => {
  const v = classify(change({ reviewers: [bob], votes: { 2: 1 }, requested: 3, hashtags: ['ready-to-merge'], readyPs: null }), 1)
  assert.equal(v.state, 'approved')
  assert.equal(v.readyPatchSet, null)
  assert.equal(v.staleReadyToMerge, true)
})

test('verified: a Verified +1 on the current patch set, unless someone voted it down', () => {
  assert.equal(classify(change({ reviewers: [bob] }), 1).verified, false)
  assert.equal(classify(change({ reviewers: [bob], verified: { 9: 1 } }), 1).verified, true)
  assert.equal(classify(change({ reviewers: [bob], verified: { 9: 0 } }), 1).verified, false)
  assert.equal(classify(change({ reviewers: [bob], verified: { 9: 1, 2: -1 } }), 1).verified, false)
})

test('copied votes after a trivial rebase keep the change approved without a new request', () => {
  const v = classify(change({ reviewers: [bob], votes: { 2: 2 }, requested: 2, patchSet: 3 }), 1)
  assert.equal(v.state, 'approved')
})

test('ready-to-merge tag with votes reset is flagged stale', () => {
  const v = classify(change({ reviewers: [bob], hashtags: ['ready-to-merge'] }), 1)
  assert.equal(v.state, 'in-progress')
  assert.equal(v.staleReadyToMerge, true)
})

test('bots and the owner do not count as reviewers', () => {
  const v = classify(change({ reviewers: [bob, bot, alice], votes: { 2: 1 }, requested: 3 }), 1)
  assert.equal(v.state, 'approved')
  assert.deepEqual(v.reviewers.map((r) => r.account._account_id), [2])
})

test('request with no reviewers is needs-review with nobody pending (UI prevents this)', () => {
  const v = classify(change({ requested: 3 }), 1)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.pending.length, 0)
})

test('merged and abandoned override everything', () => {
  assert.equal(classify(change({ status: 'MERGED', requested: 3 }), 1).state, 'merged')
  assert.equal(classify(change({ status: 'ABANDONED' }), 1).state, 'abandoned')
})

test('garbage in the marker is ignored', () => {
  const c = change({ reviewers: [bob] })
  c.custom_keyed_values = { [REVIEW_REQUESTED_KEY]: 'nope' }
  assert.equal(classify(c, 1).requestedPatchSet, null)
})

test('primary: only tagged votes decide; an untagged -1 does not block approval', () => {
  const c = change({ reviewers: [bob, erin], primary: [bob], votes: { 2: 1, 5: -1 }, requested: 3 })
  const v = classify(c, 1)
  assert.equal(v.state, 'approved')
  assert.deepEqual(v.reviewers.map((r) => [r.account._account_id, r.vote, r.key]), [[2, 1, 'bob']])
  assert.deepEqual(v.otherReviewers.map((r) => [r.account._account_id, r.vote]), [[5, -1]])
  // The team has no say: the same change reads the same with any team.
  assert.equal(classify(c, 1, ['erin']).state, 'approved')
  // Tagged the other way round, erin decides and bob is shown.
  const w = classify(change({ reviewers: [bob, erin], primary: [erin], votes: { 2: 1, 5: -1 }, requested: 3 }), 1)
  assert.equal(w.state, 'needs-changes')
  assert.deepEqual(w.otherReviewers.map((r) => r.account._account_id), [2])
})

test('primary: a pending untagged reviewer is not waited for', () => {
  const v = classify(change({ reviewers: [bob, erin], primary: [bob], votes: { 2: 1 }, requested: 3 }), 1)
  assert.equal(v.state, 'approved')
  assert.deepEqual(v.pending, [])
})

test('primary: with nobody tagged there is nobody to decide, so a request waits', () => {
  const v = classify(change({ reviewers: [bob, erin], primary: [], votes: { 2: 1, 5: 1 }, requested: 3 }), 1)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.reviewers.length, 0)
  assert.equal(v.otherReviewers.length, 2)
  assert.equal(classify(change({ reviewers: [bob], primary: [] }), 1).state, 'in-progress')
})

test('primary: a tag matches username or email without regard to case; one person tagged twice is one reviewer', () => {
  const c = change({ reviewers: [bob, carol], primary: [], votes: { 2: 1, 3: 1 }, requested: 3, hashtags: ['reviewer:BOB', 'reviewer:Carol@Example.com', 'reviewer:carol'] })
  const v = classify(c, 1)
  assert.equal(v.state, 'approved')
  assert.deepEqual(v.reviewers.map((r) => [r.account._account_id, r.key]), [[2, 'bob'], [3, 'carol@example.com']])
  assert.deepEqual(v.otherReviewers, [])
  assert.deepEqual(primaryReviewerKeys(c), ['bob', 'carol@example.com', 'carol'])
  assert.deepEqual(reviewerTagsFor(c, carol), ['reviewer:Carol@Example.com', 'reviewer:carol'])
  assert.deepEqual(reviewerTags(c), ['reviewer:BOB', 'reviewer:Carol@Example.com', 'reviewer:carol'])
  assert.equal(reviewerTag(' Bob '), 'reviewer:bob')
  assert.equal(isTaggedReviewer(c, accountKeys(carol)), true)
  assert.equal(isTaggedReviewer(c, accountKeys(erin)), false)
})

test('primary: tagged but not on the change in Gerrit is a stand-in, still waited for', () => {
  const c = change({ reviewers: [bob], primary: [bob, carol], votes: { 2: 1 }, requested: 3 })
  const v = classify(c, 1)
  assert.equal(v.state, 'needs-review')
  assert.deepEqual(v.reviewers.map((r) => [r.key, r.tagOnly ?? false, r.vote]), [['bob', false, 1], ['carol', true, 0]])
  const standIn = v.reviewers[1]!.account
  assert.ok(standIn._account_id < 0, 'never collides with a real account')
  assert.equal(standIn.username, 'carol')
  assert.deepEqual(v.pending, [standIn])
  // Tagged by email, the stand-in carries the email.
  const byEmail = classify(change({ primary: [], hashtags: ['reviewer:dave@example.com'], requested: 3 }), 1)
  assert.deepEqual(byEmail.reviewers[0]!.account, { _account_id: -1, email: 'dave@example.com' })
  // Carol, signed in, is asked although Gerrit does not list her.
  const asCarol = classify(c, carol._account_id, [], accountKeys(carol))
  assert.equal(asCarol.iAmPrimary, true)
  assert.equal(asCarol.iAmReviewer, true)
  assert.equal(asCarol.needsMyReview, true)
})

test('primary: the tag alone puts a request on my Needs Review tab; a plain reviewer is not asked', () => {
  const c = change({ reviewers: [bob, carol], primary: [carol], requested: 3 })
  const asBob = classify(c, bob._account_id, [], accountKeys(bob))
  assert.equal(asBob.iAmReviewer, true, 'a reviewer in Gerrit')
  assert.equal(asBob.iAmPrimary, false)
  assert.equal(asBob.needsMyReview, false)
  const on = (tab: Parameters<typeof groupsFor>[0]) => groupsFor(tab, [asBob]).flatMap((g) => g.items.map((v) => v.change._number))
  assert.deepEqual(on('reviewing'), [1], 'listed under Reviewing all the same')
  assert.deepEqual(on('needs-my-review'), [])
  assert.equal(actionCounts([asBob]).review, 0)
  const asCarol = classify(c, carol._account_id, [], accountKeys(carol))
  assert.equal(asCarol.needsMyReview, true)
  assert.equal(actionCounts([asCarol]).review, 1)
})

test('primary: the owner and bots are ignored even when tagged', () => {
  const ci: AccountInfo = { ...bot, username: 'ci-bot' }
  const c = change({ reviewers: [bob, ci, alice], primary: [bob], votes: { 2: 1 }, requested: 3, hashtags: ['reviewer:alice', 'reviewer:ci-bot'] })
  const v = classify(c, 1)
  assert.equal(v.state, 'approved')
  assert.deepEqual(v.reviewers.map((r) => r.account._account_id), [2])
  assert.deepEqual(v.otherReviewers, [])
})

test('team: an external owner is flagged; no team means nobody is external', () => {
  const c = change({ owner: erin, reviewers: [bob], requested: 3 })
  assert.equal(classify(c, bob._account_id, TEAM).externalOwner, true)
  assert.equal(classify(c, bob._account_id, TEAM).needsMyReview, true, 'their request still reaches me')
  const none = classify(change({ reviewers: [bob, erin], requested: 3 }), 1)
  assert.equal(none.teamScoped, false)
  assert.equal(none.externalOwner, false)
})

test('team: the signed-in user is always a member', () => {
  // Alice is not on the list, but her own change is not external to her.
  const v = classify(change({ owner: alice, reviewers: [bob], requested: 3 }), alice._account_id, TEAM)
  assert.equal(v.externalOwner, false)
  assert.equal(isInternal(v), true)
})

test('team: only the owner makes a change external, not its reviewers', () => {
  const theirs = classify(change({ owner: erin, reviewers: [bob], requested: 3 }), bob._account_id, TEAM)
  assert.equal(isExternalReview(theirs), true)
  assert.equal(isTeamReview(theirs), false)
  // My change with an outside reviewer (CI adds maintainers) stays mine.
  const mine = classify(change({ reviewers: [bob, erin], requested: 3 }), 1, TEAM)
  assert.equal(isExternalReview(mine), false)
  assert.equal(isTeamReview(mine), false, 'my own changes are on My Changes, not Team Reviews')
  // A team member's change I review, with an outside reviewer, is not external either.
  const teammates = classify(change({ owner: bob, reviewers: [alice, erin], requested: 3 }), 1, TEAM)
  assert.equal(isExternalReview(teammates), false)
  assert.equal(isTeamReview(teammates), true)
  // Closed changes never show, and without a team nobody is external and there is no team tab.
  const merged = classify({ ...change({ owner: erin, reviewers: [bob] }), status: 'MERGED' }, bob._account_id, TEAM)
  assert.equal(isExternalReview(merged), false)
  assert.equal(isExternalReview(classify(change({ owner: erin, reviewers: [bob] }), bob._account_id)), false)
  assert.equal(isTeamReview(classify(change({ owner: carol, reviewers: [bob] }), bob._account_id)), false)
})

test('team: an external change is on the External Reviews tab and on no other; a teammate\'s is on Team Reviews as well', () => {
  // Bob is signed in. Carol is on the team; Alice and Erin are not.
  const changes = [
    // 1: Erin asked Bob to review, and Bob has not voted: external, waiting on Bob.
    change({ number: 1, owner: erin, reviewers: [bob], requested: 3 }),
    // 2: Erin's change, Bob voted +1 and it is tagged: external, ready to merge.
    change({ number: 2, owner: erin, reviewers: [bob], votes: { 2: 1 }, requested: 3, hashtags: ['ready-to-merge'], maxVote: 2 }),
    // 3: Erin's change that merged: external, so not on Recently Merged.
    change({ number: 3, owner: erin, reviewers: [bob], status: 'MERGED' }),
    // 4: Carol asked Bob, with Erin also on it: internal, waiting on Bob.
    change({ number: 4, owner: carol, reviewers: [bob, erin], requested: 3 }),
    // 5: Bob's own change, reviewed by Erin only: internal, mine.
    change({ number: 5, owner: bob, reviewers: [erin], requested: 3 }),
    // 6: Carol's merged change: internal, on Recently Merged.
    change({ number: 6, owner: carol, reviewers: [bob], status: 'MERGED' }),
    // 7: Carol's change that Bob is not on, approved by Alice: on Team Reviews only.
    change({ number: 7, owner: carol, reviewers: [alice], votes: { 1: 1 }, requested: 3 }),
  ]
  const views = classifyAll(changes, bob._account_id, TEAM)
  assert.deepEqual(views.map(isInternal), [false, false, false, true, true, true, true])
  const on = (tab: Parameters<typeof groupsFor>[0]) => groupsFor(tab, views).flatMap((g) => g.items.map((v) => v.change._number))
  assert.deepEqual(on('needs-my-review'), [4])
  assert.deepEqual(on('reviewing'), [4])
  assert.deepEqual(on('mine'), [5])
  assert.deepEqual(on('merged'), [6])
  assert.deepEqual(on('team-reviews'), [4, 7])
  assert.deepEqual(
    groupsFor('team-reviews', views).map((g) => [g.title, g.items.map((v) => v.change._number)]),
    [
      ['Waiting on you', [4]],
      ['Approved', [7]],
    ],
  )
  assert.deepEqual(on('external-reviews'), [1, 2])
  assert.deepEqual(tabCounts(views), { 'needs-my-review': 1, reviewing: 1, mine: 1, merged: 1, 'team-reviews': 2, 'external-reviews': 2 })
  assert.deepEqual(
    tabSegments(views),
    { 'needs-my-review': [{ n: 1, tone: 'hot', label: 'pass around' }], merged: [], mine: [{ n: 1, tone: 'pending', label: 'out for review' }] },
    'nothing waits on Bob: Erin\'s ready change is external',
  )
  // The tray counts follow the regular tabs, so Erin's request and her ready change are left out.
  assert.deepEqual(actionCounts(views), { review: 1, fix: 0, ready: 0, merge: 0 })
  // Without a team the same changes are all internal and both team tabs are empty.
  const none = classifyAll(changes, bob._account_id)
  assert.equal(none.every(isInternal), true)
  assert.deepEqual(groupsFor('external-reviews', none), [])
  assert.deepEqual(groupsFor('team-reviews', none), [])
  assert.deepEqual(groupsFor('needs-my-review', none).flatMap((g) => g.items.map((v) => v.change._number)), [1, 4])
  // Erin's unnamed ready change waits on anyone with +2, so it heads the Merged tab ahead of the merges.
  assert.deepEqual(groupsFor('merged', none).flatMap((g) => g.items.map((v) => v.change._number)), [2, 3, 6])
  assert.equal(actionCounts(none).review, 2)
  assert.equal(actionCounts(none).merge, 1)
})

test('groupsFor: the tabs are sectioned by state and empty sections are left out', () => {
  const views = classifyAll(
    [
      change({ number: 1, reviewers: [bob], requested: 3 }),
      change({ number: 2, reviewers: [bob], votes: { 2: -1 }, requested: 3 }),
      change({ number: 3, reviewers: [bob] }),
    ],
    alice._account_id,
  )
  assert.deepEqual(
    groupsFor('mine', views).map((g) => [g.title, g.items.map((v) => v.change._number)]),
    [
      ['Needs Changes', [2]],
      ['Pass Around', [1]],
      ['In Progress', [3]],
    ],
  )
  // The pill: one segment per section, private apart; in progress is dropped once it is the only state.
  assert.deepEqual(tabSegments(views).mine, [
    { n: 1, tone: 'neg', label: 'need changes' },
    { n: 1, tone: 'pending', label: 'out for review' },
    { n: 1, tone: 'wip', label: 'in progress' },
  ])
  const quiet = classifyAll([change({ number: 1, reviewers: [bob] }), change({ number: 2, reviewers: [bob], private: true })], alice._account_id)
  assert.deepEqual(tabSegments(quiet).mine, [{ n: 1, tone: 'private', label: 'private' }])
  const asBob = classifyAll(
    [
      change({ number: 1, reviewers: [bob], requested: 3 }),
      change({ number: 2, reviewers: [bob, carol], votes: { 2: 1 }, requested: 3 }),
      change({ number: 3, reviewers: [bob] }),
    ],
    bob._account_id,
  )
  assert.deepEqual(
    groupsFor('reviewing', asBob).map((g) => [g.title, g.items.map((v) => v.change._number)]),
    [
      ['Waiting on you', [1]],
      ['Reviewed, waiting on others', [2]],
      ['Author iterating, no review requested', [3]],
    ],
  )
  assert.deepEqual(groupsFor('needs-my-review', asBob).map((g) => [g.title, g.items.map((v) => v.change._number)]), [['Pass Around', [1]]])
  assert.deepEqual(groupsFor('mine', asBob), [])
})

test('in-person review: its own state while the request on the current patch set is for it; a later pass-around request drops it', () => {
  const inPerson = classify(change({ reviewers: [bob], requested: 3, inPersonPs: 3 }), alice._account_id)
  assert.equal(inPerson.state, 'in-person-review')
  assert.equal(inPerson.inPerson, true)
  assert.equal(inPerson.reviewRequested, true)
  assert.equal(inPerson.canWithdrawReview, true, 'a first unanswered request can be taken back whatever its kind')
  // The record is for one patch set: a request for the next one is pass-around unless it says otherwise.
  const later = classify(change({ reviewers: [bob], requested: [3, 4], inPersonPs: 3, patchSet: 4 }), alice._account_id)
  assert.equal(later.state, 'needs-review')
  assert.equal(later.inPerson, false)
  // Without an open request the record means nothing.
  const pushed = classify(change({ reviewers: [bob], requested: 3, inPersonPs: 3, patchSet: 4 }), alice._account_id)
  assert.equal(pushed.state, 'in-progress')
  assert.equal(pushed.inPerson, false)
  // The votes decide the outcome the same way as for a pass-around review.
  assert.equal(classify(change({ reviewers: [bob], requested: 3, inPersonPs: 3, votes: { 2: 1 } }), alice._account_id).state, 'approved')
  assert.equal(classify(change({ reviewers: [bob], requested: 3, inPersonPs: 3, votes: { 2: -1 } }), alice._account_id).state, 'needs-changes')
  // The reviewer is waited for, and the change leads a family: only a branch needing changes comes before it.
  assert.equal(classify(change({ reviewers: [bob], requested: 3, inPersonPs: 3 }), bob._account_id).needsMyReview, true)
  assert.ok(urgency('needs-changes') < urgency('in-person-review') && urgency('in-person-review') < urgency('needs-review'))
  const family = [
    change({ number: 1, changeId: 'Iaaa', branch: 'master', reviewers: [bob], requested: 3 }),
    change({ number: 2, changeId: 'Iaaa', branch: 'release-1.0', reviewers: [bob], requested: 3, inPersonPs: 3 }),
  ].map((c) => classify(c, bob._account_id))
  assert.deepEqual(cardGroups('needs-my-review', family).map((g) => [g.title, g.items.map((v) => v.change._number)]), [['In Person', [2]]])
  assert.deepEqual(stateTally(family), [
    { state: 'in-person-review', count: 1 },
    { state: 'needs-review', count: 1 },
  ])
  assert.equal(pastDraft('in-person-review'), true)
})

test('in-person review: its own section on each tab, after the pass-around one; plain grey on the Needs Review pill; not in the tray', () => {
  const changes = [
    change({ number: 1, reviewers: [bob], requested: 3 }),
    change({ number: 2, reviewers: [bob], requested: 3, inPersonPs: 3 }),
    change({ number: 3, reviewers: [bob, carol], requested: 3, inPersonPs: 3, votes: { 2: 1 } }),
    change({ number: 4, reviewers: [bob, carol], requested: 3, votes: { 2: 1 } }),
    change({ number: 5, reviewers: [bob] }),
  ]
  const asBob = classifyAll(changes, bob._account_id)
  const titles = (tab: Parameters<typeof groupsFor>[0], views = asBob) => groupsFor(tab, views).map((g) => [g.title, g.items.map((v) => v.change._number)])
  assert.deepEqual(titles('needs-my-review'), [
    ['Pass Around', [1]],
    ['In Person', [2]],
  ])
  // Reviewing keeps its pass-around split by vote; in-person changes are one section, voted or not.
  assert.deepEqual(titles('reviewing'), [
    ['Waiting on you', [1]],
    ['Reviewed, waiting on others', [4]],
    ['In Person', [2, 3]],
    ['Author iterating, no review requested', [5]],
  ])
  assert.deepEqual(tabSegments(asBob)['needs-my-review'], [
    { n: 1, tone: 'hot', label: 'pass around' },
    { n: 1, tone: 'plain', label: 'in person' },
  ])
  assert.deepEqual(actionCounts(asBob), { review: 1, fix: 0, ready: 0, merge: 0 }, 'the in-person request is not in the tray')
  // Only in-person requests waiting: the pill is plain, not the accent.
  const quiet = classifyAll([changes[1]!], bob._account_id)
  assert.deepEqual(tabSegments(quiet)['needs-my-review'], [{ n: 1, tone: 'plain', label: 'in person' }])
  assert.deepEqual(actionCounts(quiet), { review: 0, fix: 0, ready: 0, merge: 0 })
  // The author sees both kinds, each in its own section, and one "out for review" segment for both.
  const asAlice = classifyAll(changes, alice._account_id)
  assert.deepEqual(titles('mine', asAlice), [
    ['Pass Around', [1, 4]],
    ['In Person', [2, 3]],
    ['In Progress', [5]],
  ])
  assert.deepEqual(tabSegments(asAlice).mine, [
    { n: 4, tone: 'pending', label: 'out for review' },
    { n: 1, tone: 'wip', label: 'in progress' },
  ])
})

test('private: the flag is read from Gerrit; absent means public', () => {
  assert.equal(classify(change({ private: true }), alice._account_id).isPrivate, true)
  assert.equal(classify(change({ private: false }), alice._account_id).isPrivate, false)
  assert.equal(classify(change({}), alice._account_id).isPrivate, false)
})

test('private: My Changes lists private changes in one section at the bottom, whatever their state; other tabs do not split', () => {
  const views = classifyAll(
    [
      change({ number: 1, reviewers: [bob], requested: 3 }),
      change({ number: 2, reviewers: [bob], votes: { 2: -1 }, requested: 3, private: true }),
      change({ number: 3, reviewers: [bob], private: true }),
      change({ number: 4, reviewers: [bob] }),
    ],
    alice._account_id,
  )
  assert.deepEqual(
    groupsFor('mine', views).map((g) => [g.title, g.items.map((v) => v.change._number)]),
    [
      ['Pass Around', [1]],
      ['In Progress', [4]],
      ['Private', [2, 3]],
    ],
  )
  // Only private changes: the Private section alone, no empty state sections.
  const onlyPrivate = classifyAll([change({ number: 5, private: true })], alice._account_id)
  assert.deepEqual(groupsFor('mine', onlyPrivate).map((g) => g.title), ['Private'])
  assert.deepEqual(tabCounts(views).mine, 4)
})

test('a private change of another author is never visible, reviewer or not', () => {
  const theirs = change({ number: 2, reviewers: [bob], requested: 3, private: true })
  assert.equal(isVisibleOnBoard(theirs, bob._account_id), false, 'reviewer on it')
  assert.equal(isVisibleOnBoard({ ...theirs, reviewers: { CC: [bob] } }, bob._account_id), false, 'CC on it')
  assert.equal(isVisibleOnBoard(theirs, alice._account_id), true, 'the owner')
  assert.equal(isVisibleOnBoard(change({ number: 3, reviewers: [bob] }), bob._account_id), true, 'not private')
})

test('dashboard queries search for my reviewer tags and for the team\'s changes', () => {
  const q = dashboardQueries(['platform/*'], accountKeys(bob), ['Carol@Example.com', 'dave', ''])
  assert.equal(q.direct, 'is:open (owner:self OR reviewer:self OR hashtag:ready-to-merge OR hashtag:reviewer:bob OR hashtag:reviewer:bob@example.com) (owner:self OR -is:private)')
  assert.equal(q.wipScan, 'is:open is:wip -owner:self -is:private (projects:platform/)')
  assert.equal(q.merged, 'is:merged (owner:self OR reviewer:self) -age:14d (owner:self OR -is:private)')
  assert.equal(q.team, 'is:open -owner:self -is:private (owner:carol@example.com OR owner:dave) (projects:platform/)')
  assert.equal(dashboardQueries().team, '', 'no team, no team query')
  assert.equal(dashboardQueries().direct, 'is:open (owner:self OR reviewer:self OR hashtag:ready-to-merge) (owner:self OR -is:private)')
})

test('normalizeTeam trims, lower-cases and de-duplicates', () => {
  assert.deepEqual(normalizeTeam([' Bob ', 'bob', '', 'Carol@Example.com', 'carol@example.com']), ['bob', 'carol@example.com'])
})

test('action counts: one per kind of thing waiting on me', () => {
  const me = bob
  const changes = [
    // Alice asked me to review: review
    change({ number: 1, reviewers: [me], requested: 3 }),
    // I already voted: nothing
    change({ number: 2, reviewers: [me], requested: 3, votes: { 2: 1 } }),
    // My change, Carol voted -1: fix
    change({ number: 3, owner: me, reviewers: [carol], requested: 3, votes: { 3: -1 } }),
    // My change, approved, not yet tagged: mark ready
    change({ number: 4, owner: me, reviewers: [carol], requested: 3, votes: { 3: 1 } }),
    // Alice's change, tagged, I may +2: merge
    change({ number: 5, reviewers: [carol], requested: 3, votes: { 3: 1 }, hashtags: ['ready-to-merge'], maxVote: 2 }),
    // Same but I may only +1: nothing
    change({ number: 6, reviewers: [carol], requested: 3, votes: { 3: 1 }, hashtags: ['ready-to-merge'] }),
    // Merged already: nothing, even though it looks approved
    change({ number: 7, owner: me, reviewers: [carol], requested: 3, votes: { 3: 1 }, status: 'MERGED' }),
  ]
  const c = actionCounts(classifyAll(changes, me._account_id))
  assert.deepEqual(c, { review: 1, fix: 1, ready: 1, merge: 1 })
  assert.equal(describeActions(c), 'Needs Review 1, Needs Changes 1, Approved 1, Ready to Merge 1')
})

test('summaries skip empty categories', () => {
  assert.equal(describeActions({ review: 0, fix: 0, ready: 0, merge: 0 }), 'Nothing waits on you')
  assert.equal(describeActions({ review: 3, fix: 0, ready: 0, merge: 2 }), 'Needs Review 3, Ready to Merge 2')
  assert.equal(glyphTitle({ review: 3, fix: 0, ready: 0, merge: 2 }), '\u25c9 3  \u21e7 2')
  assert.equal(glyphTitle({ review: 0, fix: 0, ready: 0, merge: 0 }), '')
  assert.equal(glyphTitle({ review: 3, fix: 0, ready: 0, merge: 2 }, true), '\u25c9 3  \u270e 0  \u25c6 0  \u21e7 2')
  // Merge stays hidden at zero even with showZero: most users never have +2 rights.
  assert.equal(glyphTitle({ review: 0, fix: 0, ready: 0, merge: 0 }, true), '\u25c9 0  \u270e 0  \u25c6 0')
})

test('sortViews: most recent update first, then oldest review first', () => {
  const views = [
    change({ number: 1, created: '2026-09-01 10:00:00.000', updated: '2026-09-05 10:00:00.000' }),
    change({ number: 2, created: '2026-08-20 10:00:00.000', updated: '2026-09-07 10:00:00.000' }),
    change({ number: 3, created: '2026-09-03 10:00:00.000', updated: '2026-09-06 10:00:00.000' }),
  ].map((c) => classify(c, alice._account_id))
  assert.deepEqual(sortViews(views, 'updated').map((v) => v.change._number), [2, 3, 1])
  assert.deepEqual(sortViews(views, 'age').map((v) => v.change._number), [2, 1, 3])
  // Input is not mutated.
  assert.deepEqual(views.map((v) => v.change._number), [1, 2, 3])
})

test('sortViews: ties fall back to change number', () => {
  const same = { created: '2026-09-01 10:00:00.000', updated: '2026-09-01 10:00:00.000' }
  const views = [change({ number: 5, ...same }), change({ number: 4, ...same })].map((c) =>
    classify(c, alice._account_id),
  )
  assert.deepEqual(sortViews(views, 'age').map((v) => v.change._number), [4, 5])
  assert.deepEqual(sortViews(views, 'updated').map((v) => v.change._number), [5, 4])
})

test('sortViews: oldest current patch set first', () => {
  const views = [
    change({ number: 1, created: '2026-09-01 10:00:00.000', patchSetCreated: '2026-09-08 10:00:00.000' }),
    change({ number: 2, created: '2026-08-20 10:00:00.000', patchSetCreated: '2026-09-09 10:00:00.000' }),
    change({ number: 3, created: '2026-09-03 10:00:00.000', patchSetCreated: '2026-09-04 10:00:00.000' }),
  ].map((c) => classify(c, alice._account_id))
  assert.deepEqual(sortViews(views, 'patchset').map((v) => v.change._number), [3, 1, 2])
  // A change whose only patch set is the first one is as old as the change.
  assert.equal(views[2]!.patchSetCreated, '2026-09-04 10:00:00.000')
})

test('the patch set date falls back to the change date when Gerrit sent no revision', () => {
  const c = { ...change({ created: '2026-09-01 10:00:00.000' }), current_revision: undefined, revisions: undefined }
  assert.equal(classify(c, alice._account_id).patchSetCreated, '2026-09-01 10:00:00.000')
})

const NONE: ViewFilter = { search: '', authors: [], scopes: [] }

test('filterViews: the search matches the subject without regard to case, or the change number exactly', () => {
  const views = [
    change({ number: 12, subject: 'Fix tray icon on Linux' }),
    change({ number: 120, subject: 'Rotate CA bundle' }),
  ].map((c) => classify(c, alice._account_id))
  const nums = (f: Partial<ViewFilter>) => filterViews(views, { ...NONE, ...f }).map((v) => v.change._number)
  assert.deepEqual(nums({ search: 'TRAY' }), [12])
  assert.deepEqual(nums({ search: ' ca ' }), [120])
  assert.deepEqual(nums({ search: '12' }), [12])
  assert.deepEqual(nums({ search: 'nothing' }), [])
  // No filter returns the same list, not a copy.
  assert.equal(filterViews(views, NONE), views)
})

test('filterViews: picked authors and scopes are one condition; the search is another', () => {
  const views = [
    change({ number: 1, owner: alice, subject: 'a' }),
    change({ number: 2, owner: bob, subject: 'b' }),
    change({ number: 3, owner: carol, subject: 'c' }),
    change({ number: 4, owner: erin, subject: 'd' }),
  ].map((c) => classify(c, bob._account_id, TEAM))
  const nums = (f: Partial<ViewFilter>) => filterViews(views, { ...NONE, ...f }).map((v) => v.change._number)
  assert.deepEqual(nums({ authors: [alice] }), [1])
  assert.deepEqual(nums({ authors: [alice], scopes: ['me'] }), [1, 2])
  assert.deepEqual(nums({ scopes: ['me'] }), [2])
  assert.deepEqual(nums({ scopes: ['me'], search: 'a' }), [])
  assert.deepEqual(nums({ authors: [carol], search: 'c' }), [3])
})

test('ownersOf: most changes first, then by name', () => {
  const views = [
    change({ number: 1, owner: carol }),
    change({ number: 2, owner: alice }),
    change({ number: 3, owner: bob }),
    change({ number: 4, owner: bob }),
  ].map((c) => classify(c, alice._account_id))
  assert.deepEqual(
    ownersOf(views).map((o) => [o.account.name, o.count]),
    [['Bob', 2], ['Alice', 1], ['Carol', 1]],
  )
})

test('accountMatches: prefix of any name word, the username or the email', () => {
  const a: AccountInfo = { _account_id: 7, name: 'Dana Whitfield', username: 'dwhit', email: 'dana@example.com' }
  assert.ok(accountMatches(a, 'whit'))
  assert.ok(accountMatches(a, 'DW'))
  assert.ok(accountMatches(a, 'dana@'))
  assert.ok(accountMatches(a, ''))
  assert.ok(!accountMatches(a, 'ana'))
})

test('last reviewed patch set is the highest one I voted or replied on', () => {
  const c = change({ reviewers: [bob], patchSet: 5, messages: [msg(alice, 1, 'autogenerated:gerrit:newPatchSet'), msg(bob, 1), msg(bob, 3), msg(carol, 4)] })
  assert.equal(lastReviewedPatchSet(c, bob._account_id), 3)
  assert.equal(lastReviewedPatchSet(c, carol._account_id), 4)
  assert.equal(lastReviewedPatchSet(c, alice._account_id), null, "Gerrit's own upload message is not a review")
  assert.equal(classify(c, bob._account_id).lastReviewedPatchSet, 3)
})

test('uploading or rebasing a change is not reviewing it', () => {
  const c = change({
    reviewers: [bob],
    patchSet: 3,
    messages: [msg(bob, 1), msg(bob, 2, 'autogenerated:gerrit:newPatchSet'), msg(bob, 3, 'autogenerated:gerrit:rebase')],
  })
  assert.equal(lastReviewedPatchSet(c, bob._account_id), 1)
})

test('messages without a patch set, or with no messages at all, mean never reviewed', () => {
  const noPs: ChangeMessageInfo = { id: 'x', author: bob, date: '', message: 'hashtag added' }
  assert.equal(lastReviewedPatchSet(change({ messages: [noPs] }), bob._account_id), null)
  assert.equal(lastReviewedPatchSet(change({}), bob._account_id), null)
})

test('review link spans from my last review to the current patch set', () => {
  const v = classify(change({ number: 42, reviewers: [bob], patchSet: 5, messages: [msg(bob, 3)] }), bob._account_id)
  assert.deepEqual(reviewLink(v), { id: 42, project: 'demo', patchSet: 5, basePatchSet: 3 })
})

test('review link is the current patch set against base when never reviewed or already up to date', () => {
  const never = classify(change({ number: 42, reviewers: [bob], patchSet: 5 }), bob._account_id)
  assert.deepEqual(reviewLink(never), { id: 42, project: 'demo', patchSet: 5 })
  const current = classify(change({ number: 42, reviewers: [bob], patchSet: 5, messages: [msg(bob, 5)] }), bob._account_id)
  assert.deepEqual(reviewLink(current), { id: 42, project: 'demo', patchSet: 5 })
})

test('groupByChangeId: cherry-picks share a family, in the order given', () => {
  const views = [
    change({ number: 1, changeId: 'Iaaa', branch: 'master' }),
    change({ number: 2, changeId: 'Ibbb' }),
    change({ number: 3, changeId: 'Iaaa', branch: 'release-1.0' }),
    change({ number: 4 }),
    change({ number: 5, changeId: 'Iaaa', branch: 'release-2.0' }),
  ].map((c) => classify(c, alice._account_id))
  const families = groupByChangeId(views)
  assert.deepEqual(
    families.map((f) => [f.key, f.members.map((v) => v.change._number)]),
    [
      ['Iaaa', [1, 3, 5]],
      ['Ibbb', [2]],
      ['demo~4', [4]],
    ],
  )
  // Input is not mutated.
  assert.deepEqual(views.map((v) => v.change._number), [1, 2, 3, 4, 5])
})

test('tabCounts: a Change-Id family counts once per tab; stateTally lists its states, most urgent first', () => {
  const views = [
    // Alice's change on three branches: one approved, two out for review. One card on My Changes.
    change({ number: 1, changeId: 'Iaaa', branch: 'master', reviewers: [bob], requested: 3 }),
    change({ number: 2, changeId: 'Iaaa', branch: 'release-1.0', reviewers: [bob], requested: 3, votes: { 2: 1 } }),
    change({ number: 3, changeId: 'Iaaa', branch: 'release-2.0', reviewers: [bob], requested: 3 }),
    change({ number: 4, reviewers: [bob], requested: 3 }),
  ].map((c) => classify(c, alice._account_id))
  assert.equal(tabCounts(views).mine, 2)
  // The card sits in the section of its most urgent branch, and the pill counts it there only: no approved segment.
  assert.deepEqual(
    cardGroups('mine', views).map((g) => [g.title, g.items.map((v) => v.change._number)]),
    [['Pass Around', [1, 4]]],
  )
  assert.deepEqual(tabSegments(views).mine, [{ n: 2, tone: 'pending', label: 'out for review' }])
  // The tray counts cards as well: one approved card, however many approved branches.
  const twoApproved = [
    change({ number: 5, changeId: 'Ibbb', branch: 'master', reviewers: [bob], requested: 3, votes: { 2: 1 } }),
    change({ number: 6, changeId: 'Ibbb', branch: 'release-1.0', reviewers: [bob], requested: 3, votes: { 2: 1 } }),
    // A third branch of the same change needs a fix: the card is in both categories.
    change({ number: 7, changeId: 'Ibbb', branch: 'release-2.0', reviewers: [bob], requested: 3, votes: { 2: -1 } }),
  ].map((c) => classify(c, alice._account_id))
  assert.deepEqual(actionCounts(twoApproved), { review: 0, fix: 1, ready: 1, merge: 0 })
  // The pill, like the board, has the card under Needs Changes alone.
  assert.deepEqual(tabSegments(twoApproved).mine, [{ n: 1, tone: 'neg', label: 'need changes' }])
  assert.deepEqual(stateTally(views.slice(0, 3)), [
    { state: 'needs-review', count: 2 },
    { state: 'approved', count: 1 },
  ])
  assert.deepEqual(stateTally([]), [])
})

test('sortByBranch: project, then branch, then number; input untouched', () => {
  const views = [
    change({ number: 1, changeId: 'Iaaa', branch: 'release-2.0' }),
    change({ number: 3, changeId: 'Iaaa', branch: 'master', status: 'MERGED' }),
    change({ number: 4, changeId: 'Iaaa', branch: 'release-1.0' }),
    change({ number: 2, changeId: 'Iaaa', branch: 'release-1.0' }),
  ].map((c) => classify(c, alice._account_id))
  assert.deepEqual(sortByBranch(views).map((v) => v.change._number), [3, 2, 4, 1])
  assert.deepEqual(views.map((v) => v.change._number), [1, 3, 4, 2])
})

test('shortChangeId trims long ids only', () => {
  assert.equal(shortChangeId('I3f2a91c0deadbeef'), 'I3f2a91c\u2026')
  assert.equal(shortChangeId('demo~4'), 'demo~4')
})

test('urgency: fix first, then look, then iterate, then mark, then wait on the merger', () => {
  const states = ['ready-to-merge', 'approved', 'merged', 'in-progress', 'needs-review', 'needs-changes'] as const
  assert.deepEqual(
    [...states].sort((a, b) => urgency(a) - urgency(b)),
    ['needs-changes', 'needs-review', 'in-progress', 'approved', 'ready-to-merge', 'merged'],
  )
})

test('pastDraft: a change still being worked on is not held to its tags; one up for review or beyond is', () => {
  assert.equal(pastDraft('in-progress'), false)
  assert.equal(pastDraft('iterating'), false)
  for (const s of ['needs-review', 'needs-changes', 'approved', 'ready-to-merge', 'merged', 'abandoned'] as const) assert.equal(pastDraft(s), true, s)
})

// ---- Merge requests: the author names one person with a merger: hashtag.

const dave: AccountInfo = { _account_id: 4, name: 'Dave', username: 'dave', email: 'dave@example.com' }
const READY = ['ready-to-merge', 'merger:dave']
const approved = (extra = {}) => change({ reviewers: [bob, carol], votes: { 2: 1, 3: 1 }, requested: 3, hashtags: READY, ...extra })

test('merger tag: parsed to the requested merger, lower-case; the tag for a key is built the same way', () => {
  assert.equal(requestedMerger(change({ hashtags: ['ready-to-merge', 'merger:Dave'] })), 'dave')
  assert.equal(requestedMerger(change({ hashtags: ['ready-to-merge'] })), null)
  assert.equal(requestedMerger(change({ hashtags: ['merger:'] })), null, 'an empty name is no merger')
  assert.deepEqual(mergerTags(change({ hashtags: ['x', 'merger:dave', 'merger:bob'] })), ['merger:dave', 'merger:bob'])
  assert.equal(mergerTag(' Dave '), 'merger:dave')
  assert.equal(mergerTag('Dave@Example.com'), 'merger:dave@example.com')
  assert.deepEqual(accountKeys(dave), ['dave', 'dave@example.com'])
  assert.deepEqual(accountKeys({ _account_id: 7 }), [])
})

test('merger tag: the merge waits on the named person, whether matched by username or by email', () => {
  const byName = classify(approved({ maxVote: 2 }), dave._account_id, [], accountKeys(dave))
  assert.equal(byName.state, 'ready-to-merge')
  assert.equal(byName.requestedMerger, 'dave')
  assert.equal(byName.mergeRequestedFromMe, true)
  assert.equal(mergeWaitsOnMe(byName), true)

  const byEmail = classify(approved({ hashtags: ['ready-to-merge', 'merger:dave@example.com'], maxVote: 2 }), dave._account_id, [], accountKeys(dave))
  assert.equal(byEmail.mergeRequestedFromMe, true)

  const someoneElse = classify(approved({ maxVote: 2 }), carol._account_id, [], accountKeys(carol))
  assert.equal(someoneElse.mergeRequestedFromMe, false)
  assert.equal(mergeWaitsOnMe(someoneElse), false, 'a +2 user who was not asked is not waited on')
})

test('merger tag: a tag naming nobody (older version) waits on anyone who can +2', () => {
  const unnamed = approved({ hashtags: ['ready-to-merge'], maxVote: 2 })
  assert.equal(mergeWaitsOnMe(classify(unnamed, dave._account_id, [], accountKeys(dave))), true)
  assert.equal(mergeWaitsOnMe(classify(approved({ hashtags: ['ready-to-merge'] }), bob._account_id, [], accountKeys(bob))), false, 'no +2, no merge')
})

test('merger tag: asked but without +2 rights is still asked, so the hint can be shown', () => {
  const v = classify(approved({ hashtags: ['ready-to-merge', 'merger:bob'] }), bob._account_id, [], accountKeys(bob))
  assert.equal(v.mergeRequestedFromMe, true)
  assert.equal(v.canMerge, false)
  assert.equal(mergeWaitsOnMe(v), true)
})

test('Merged tab: only what is asked of me, plus unnamed tags for +2 users, plus my own stale tags, above the merges', () => {
  const mine = approved({ number: 1 })
  const forMe = approved({ number: 2, owner: bob, hashtags: ['ready-to-merge', 'merger:alice'] })
  const forDave = approved({ number: 3, owner: bob })
  const unnamed = approved({ number: 4, owner: bob, hashtags: ['ready-to-merge'], maxVote: 2 })
  const stale = change({ number: 5, reviewers: [bob], requested: 2, hashtags: READY, patchSet: 3 })
  const staleForMe = change({ number: 6, owner: bob, reviewers: [carol], requested: 2, hashtags: ['ready-to-merge', 'merger:alice'], patchSet: 3 })
  const staleForDave = change({ number: 7, owner: bob, reviewers: [carol], requested: 2, hashtags: READY, patchSet: 3 })
  const merged = change({ number: 8, owner: bob, reviewers: [alice], status: 'MERGED' })
  const views = classifyAll([mine, forMe, forDave, unnamed, stale, staleForMe, staleForDave, merged], alice._account_id, [], accountKeys(alice))
  const groups = groupsFor('merged', views)
  assert.deepEqual(
    groups.map((g) => [g.title, g.items.map((v) => v.change._number)]),
    [
      ['Asked of you', [2]],
      ['Tagged without a merger', [4]],
      ['Tagged but no longer approved', [5, 6]],
      ['Merged in the last 14 days', [8]],
    ],
  )
  assert.equal(tabCounts(views).merged, 5)
  // The pill's green segment counts the queue, not the history.
  assert.deepEqual(tabSegments(views).merged, [{ n: 4, tone: 'pos', label: 'ready to merge' }])
  assert.equal(actionCounts(views).merge, 2, 'asked of me and the unnamed one I can +2')
  // My own ready change is on My Changes, not on the merger's queue.
  assert.ok(groupsFor('mine', views).some((g) => g.title === 'Ready to Merge' && g.items.some((v) => v.change._number === 1)))
})

test('mergers settings: patterns match exactly, by prefix, or everything', () => {
  assert.equal(projectMatches('demo', 'demo'), true)
  assert.equal(projectMatches('demo', 'demo2'), false)
  assert.equal(projectMatches('platform/*', 'platform/core'), true)
  assert.equal(projectMatches('platform/*', 'tools/build'), false)
  assert.equal(projectMatches('*', 'anything'), true)
})

test('mergers settings: the list for a project is the union, most specific rule first, each person once', () => {
  const rules = normalizeMergers([
    { project: '*', people: ['Alice', 'dave'] },
    { project: 'platform/*', people: ['bob'] },
    { project: 'platform/core', people: ['Carol@Example.com', 'bob'] },
    { project: '  ', people: ['nobody'] },
    { project: 'tools', people: [] },
  ])
  assert.deepEqual(rules.map((r) => r.project), ['*', 'platform/*', 'platform/core'])
  assert.deepEqual(mergersFor('platform/core', rules), ['carol@example.com', 'bob', 'alice', 'dave'])
  assert.deepEqual(mergersFor('platform/ui', rules), ['bob', 'alice', 'dave'])
  assert.deepEqual(mergersFor('tools/build', rules), ['alice', 'dave'])
  assert.deepEqual(mergersFor('x', []), [])
})

test('mergersReflect: a saved list that matches the edited rows once normalized keeps rows still being filled in', () => {
  const saved = normalizeMergers([{ project: 'platform/*', people: ['alice'] }])
  // A row just added with Add project: no people yet, so the save drops it, but the editor must keep it.
  assert.equal(mergersReflect([{ project: 'platform/*', people: ['alice'] }, { project: '', people: [] }], saved), true)
  assert.equal(mergersReflect([{ project: '*', people: [] }], []), true)
  // The same rows, only spelled differently, still reflect the save.
  assert.equal(mergersReflect([{ project: ' platform/* ', people: ['Alice'] }], saved), true)
  // A change made elsewhere does not.
  assert.equal(mergersReflect([{ project: 'platform/*', people: ['alice'] }], normalizeMergers([{ project: 'platform/*', people: ['bob'] }])), false)
  assert.equal(mergersReflect([{ project: '', people: [] }], saved), false)
})

test('mergers settings: a one-off pick can be added to the row for that project, or a new exact row', () => {
  const rules = [{ project: '*', people: ['alice'] }]
  assert.deepEqual(addMerger(rules, 'demo', 'Dave'), [
    { project: '*', people: ['alice'] },
    { project: 'demo', people: ['dave'] },
  ])
  assert.deepEqual(addMerger(addMerger(rules, 'demo', 'dave'), 'demo', 'dave'), [
    { project: '*', people: ['alice'] },
    { project: 'demo', people: ['dave'] },
  ])
})

test('preferredKey writes the username, or the email of an account without one', () => {
  assert.equal(preferredKey({ _account_id: 1, username: 'Alice', email: 'alice@example.com' }), 'alice')
  assert.equal(preferredKey({ _account_id: 2, email: 'Bob@example.com' }), 'bob@example.com')
  assert.equal(preferredKey({ _account_id: 3 }), null)
})

test('actionMenu: one entry per family, every branch listed, the others with a note', () => {
  // Bob asked Alice to review a change on three branches; she already voted on one.
  const asked = { owner: bob, reviewers: [alice], requested: 3, changeId: 'Iabc', subject: 'Rotate the API keys nightly' }
  const single = change({ owner: carol, reviewers: [alice], requested: 3, number: 41, subject: 'Retry on 502', updated: '2026-01-02 00:00:00.000000000' })
  const master = change({ ...asked, number: 44, branch: 'master' })
  const rel2 = change({ ...asked, number: 45, branch: 'release-2.0' })
  const rel1 = change({ ...asked, number: 43, branch: 'release-1.0', votes: { 1: 1 } })
  // Her own approved change, two branches, one still out for review.
  const mine = { owner: alice, reviewers: [bob], changeId: 'Idef', subject: 'Allow uploads over 2 GB' }
  const approved = change({ ...mine, number: 22, branch: 'master', requested: 3, votes: { 2: 1 } })
  const waiting = change({ ...mine, number: 23, branch: 'release-1.0', requested: 3 })
  const views = classifyAll([single, master, rel2, rel1, approved, waiting], alice._account_id)
  const menu = actionMenu(views)
  assert.deepEqual(actionCounts(views), { review: 2, fix: 0, ready: 1, merge: 0 })
  assert.equal(menu.review.length, 2, 'as many entries as the count')
  assert.deepEqual(menu.review[0], {
    subject: 'Retry on 502',
    owner: 'Carol',
    members: [{ number: 41, branch: 'master', link: { id: 41, project: 'demo', patchSet: 3 }, actionable: true, note: '' }],
  })
  assert.equal(menu.review[1].subject, 'Rotate the API keys nightly')
  assert.equal(menu.review[1].owner, 'Bob')
  assert.deepEqual(
    menu.review[1].members.map((m) => [m.number, m.branch, m.actionable, m.note]),
    [
      [44, 'master', true, ''],
      [45, 'release-2.0', true, ''],
      [43, 'release-1.0', false, 'you voted +1'],
    ],
  )
  assert.deepEqual(menu.review[1].members[0].link, { id: 44, project: 'demo', patchSet: 3 }, 'a review opens the diff')
  assert.deepEqual(
    menu.ready.map((f) => [f.subject, f.members.map((m) => [m.number, m.actionable, m.note])]),
    [['Allow uploads over 2 GB', [[22, true, ''], [23, false, 'needs review']]]],
  )
  assert.deepEqual(menu.ready[0].members[0].link, { id: 22, project: 'demo' }, 'the other categories open the change page')
  assert.deepEqual(menu.fix, [])
  assert.deepEqual(menu.merge, [])
})

test('slackUrl accepts a Slack permalink and refuses anything else', () => {
  const link = 'https://acme.slack.com/archives/C04ABCD1234/p1726500000123456'
  assert.equal(slackUrl(link), link)
  assert.equal(slackUrl(`  ${link}?thread_ts=1726500000.123456&cid=C04ABCD1234 `), `${link}?thread_ts=1726500000.123456&cid=C04ABCD1234`)
  assert.equal(slackUrl('https://slack.com/app_redirect?channel=C04'), 'https://slack.com/app_redirect?channel=C04')
  assert.equal(slackUrl('http://acme.slack.com/archives/C04'), null, 'https only')
  assert.equal(slackUrl('https://evil.example/acme.slack.com'), null, 'the host must be Slack')
  assert.equal(slackUrl('https://notslack.com/x'), null)
  assert.equal(slackUrl('javascript:alert(1)'), null)
  assert.equal(slackUrl('acme.slack.com/archives/C04'), null, 'a bare host is not a link')
  assert.equal(slackUrl(''), null)
})

test('slackTag and linkedSlackUrl round-trip through the hashtag', () => {
  const link = 'https://acme.slack.com/archives/C04ABCD1234/p1726500000123456'
  assert.equal(slackTag(` ${link} `), `slack:${link}`)
  const c = change({ hashtags: ['reviewer:bob', slackTag(link)] })
  assert.deepEqual(slackTags(c), [`slack:${link}`])
  assert.equal(linkedSlackUrl(c), link)
  assert.equal(classify(c, alice._account_id).slackUrl, link)
  assert.equal(classify(change({ hashtags: ['reviewer:bob'] }), alice._account_id).slackUrl, null)
  // A tag written by hand with something that is not a Slack link is ignored, and the first good one wins.
  const mixed = change({ hashtags: ['slack:', 'slack:ftp://x', `slack:${link}`, 'slack:https://acme.slack.com/other'] })
  assert.equal(linkedSlackUrl(mixed), link)
  assert.equal(slackTags(mixed).length, 3)
})

test('slackDeepLink turns a Copy link URL into a slack:// link for a known workspace', () => {
  const acme = [{ domain: 'acme', teamId: 'T0123ABCD' }]
  assert.equal(slackDeepLink('https://acme.slack.com/archives/C04ABCD1234/p1726500000123456', acme), 'slack://channel?team=T0123ABCD&id=C04ABCD1234&message=1726500000.123456')
  assert.equal(slackDeepLink('https://acme.slack.com/archives/C04ABCD1234', acme), 'slack://channel?team=T0123ABCD&id=C04ABCD1234', 'a channel link')
  assert.equal(
    slackDeepLink('https://acme.slack.com/archives/C04ABCD1234/p1726500000123456?thread_ts=1726400000.111111&cid=C04ABCD1234', acme),
    'slack://channel?team=T0123ABCD&id=C04ABCD1234&message=1726500000.123456&thread_ts=1726400000.111111',
    'a reply carries its thread; cid repeats the channel and is dropped',
  )
  assert.equal(slackDeepLink('https://ACME.slack.com/archives/C04ABCD1234', acme), 'slack://channel?team=T0123ABCD&id=C04ABCD1234', 'the host is matched without case')
  assert.equal(slackDeepLink('https://acme.slack.com/archives/C04ABCD1234/p1726500000123456?thread_ts=x', acme), 'slack://channel?team=T0123ABCD&id=C04ABCD1234&message=1726500000.123456', 'a thread_ts that is not a timestamp is left out')
})

test('slackDeepLink is null when the app cannot be told where to go, so the browser gets the link', () => {
  const acme = [{ domain: 'acme', teamId: 'T0123ABCD' }]
  const link = 'https://acme.slack.com/archives/C04ABCD1234/p1726500000123456'
  assert.equal(slackDeepLink(link, []), null, 'no workspaces')
  assert.equal(slackDeepLink(link, [{ domain: 'other', teamId: 'T0123ABCD' }]), null, 'another workspace')
  assert.equal(slackDeepLink(link, [{ domain: 'acme', teamId: 'acme' }]), null, 'the team ID is not one')
  assert.equal(slackDeepLink(link, [{ domain: 'acme', teamId: 'E0123ABCD' }]), 'slack://channel?team=E0123ABCD&id=C04ABCD1234&message=1726500000.123456', 'an org ID is passed through')
  assert.equal(slackDeepLink('https://slack.com/app_redirect?channel=C04ABCD1234', acme), null, 'no workspace in the host')
  assert.equal(slackDeepLink('https://acme.slack.com/canvas/F0123', acme), null, 'not an archive link')
  assert.equal(slackDeepLink('https://acme.slack.com/archives/C04ABCD1234/p123', acme), null, 'a message segment that is not p + 16 digits')
  assert.equal(slackDeepLink('https://acme.slack.com/archives/C04ABCD1234/p1726500000123456/extra', acme), null, 'a longer path')
  assert.equal(slackDeepLink('https://acme.slack.com/archives/c04abcd1234', acme), null, 'a channel ID is upper-case')
  assert.equal(slackDeepLink('http://acme.slack.com/archives/C04ABCD1234', acme), null, 'not a Slack link at all')
})

test('normalizeSlackWorkspaces accepts a domain, a host or a link and keeps one row per workspace', () => {
  assert.deepEqual(
    normalizeSlackWorkspaces([
      { domain: ' Acme ', teamId: ' t0123abcd ' },
      { domain: 'beta.slack.com', teamId: 'T0BETA' },
      { domain: 'https://gamma.slack.com/archives/C01', teamId: 'T0GAMMA' },
      { domain: 'acme', teamId: 'T0OTHER' },
      { domain: '', teamId: 'T0EMPTY' },
      { domain: 'delta', teamId: '' },
      { domain: 'slack.com', teamId: 'T0BARE' },
    ]),
    [
      { domain: 'acme', teamId: 'T0123ABCD' },
      { domain: 'beta', teamId: 'T0BETA' },
      { domain: 'gamma', teamId: 'T0GAMMA' },
    ],
  )
  assert.equal(slackWorkspacesReflect([{ domain: 'Acme', teamId: 't01' }, { domain: '', teamId: '' }], [{ domain: 'acme', teamId: 'T01' }]), true)
  assert.equal(slackWorkspacesReflect([{ domain: 'acme', teamId: 'T01' }], [{ domain: 'acme', teamId: 'T02' }]), false)
})

test('isSlackTeamId', () => {
  assert.equal(isSlackTeamId('T0123ABCD'), true)
  assert.equal(isSlackTeamId(' t0123abcd '), true)
  assert.equal(isSlackTeamId('E0123ABCD'), true, 'an Enterprise Grid org ID')
  assert.equal(isSlackTeamId('C0123ABCD'), false)
  assert.equal(isSlackTeamId('T'), false)
  assert.equal(isSlackTeamId('acme'), false)
})
