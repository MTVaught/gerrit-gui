import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actionCounts, classify, classifyAll, describeActions, glyphTitle, groupByChangeId, isExternalReview, lastReviewedPatchSet, normalizeTeam, reviewLink, shortChangeId, sortByBranch, sortViews, urgency } from './model.ts'
import { REVIEW_REQUESTED_KEY } from './constants.ts'
import type { AccountInfo, ChangeInfo, ChangeMessageInfo } from './types.ts'

const alice: AccountInfo = { _account_id: 1, name: 'Alice', username: 'alice', email: 'alice@example.com' }
const bob: AccountInfo = { _account_id: 2, name: 'Bob', username: 'bob', email: 'bob@example.com' }
const carol: AccountInfo = { _account_id: 3, name: 'Carol', username: 'carol', email: 'carol@example.com' }
const bot: AccountInfo = { _account_id: 9, name: 'CI', tags: ['SERVICE_USER'] }
/** Outside the team in the team tests below. */
const erin: AccountInfo = { _account_id: 5, name: 'Erin', username: 'erin', email: 'erin@other.example' }
const TEAM = ['bob', 'Carol@Example.com']

function change(opts: {
  reviewers?: AccountInfo[]
  votes?: Record<number, number>
  wip?: boolean
  hashtags?: string[]
  status?: ChangeInfo['status']
  patchSet?: number
  requested?: number
  owner?: AccountInfo
  number?: number
  /** Highest Code-Review vote the caller may cast. */
  maxVote?: number
  created?: string
  updated?: string
  messages?: ChangeMessageInfo[]
  branch?: string
  /** Change-Id shared by cherry-picks; left out to mimic a server that does not send it. */
  changeId?: string
}): ChangeInfo {
  const reviewers = opts.reviewers ?? []
  return {
    id: `demo~${opts.number ?? 1}`,
    change_id: opts.changeId,
    _number: opts.number ?? 1,
    project: 'demo',
    branch: opts.branch ?? 'master',
    subject: 's',
    status: opts.status ?? 'NEW',
    owner: opts.owner ?? alice,
    work_in_progress: opts.wip,
    hashtags: opts.hashtags ?? [],
    custom_keyed_values: opts.requested ? { [REVIEW_REQUESTED_KEY]: String(opts.requested) } : {},
    created: opts.created ?? '',
    updated: opts.updated ?? '',
    reviewers: { REVIEWER: reviewers },
    labels: {
      'Code-Review': {
        all: reviewers.map((r) => ({ ...r, value: opts.votes?.[r._account_id] ?? 0 })),
      },
    },
    permitted_labels: { 'Code-Review': opts.maxVote === 2 ? ['-2', '-1', ' 0', '+1', '+2'] : ['-1', ' 0', '+1'] },
    current_revision: 'abc',
    revisions: { abc: { _number: opts.patchSet ?? 3, created: '' } },
    messages: opts.messages,
  }
}

function msg(author: AccountInfo, ps: number, tag?: string): ChangeMessageInfo {
  return { id: `${author._account_id}-${ps}-${tag ?? ''}`, author, date: '', message: '', _revision_number: ps, tag }
}

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
  c.hashtags = ['ready-to-merge']
  assert.equal(classify(c, 1).state, 'ready-to-merge')
  assert.equal(classify(c, 1).staleReadyToMerge, false)
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

test('team: only team votes decide; an external -1 does not block approval', () => {
  const c = change({ reviewers: [bob, erin], votes: { 2: 1, 5: -1 }, requested: 3 })
  assert.equal(classify(c, 1).state, 'needs-changes', 'without a team every reviewer counts')
  const v = classify(c, 1, TEAM)
  assert.equal(v.state, 'approved')
  assert.equal(v.teamScoped, true)
  assert.deepEqual(v.reviewers.map((r) => r.account._account_id), [2])
  assert.deepEqual(v.externalReviewers.map((r) => [r.account._account_id, r.vote]), [[5, -1]])
})

test('team: a pending external reviewer is not waited for', () => {
  const c = change({ reviewers: [bob, erin], votes: { 2: 1 }, requested: 3 })
  assert.equal(classify(c, 1).state, 'needs-review')
  const v = classify(c, 1, TEAM)
  assert.equal(v.state, 'approved')
  assert.deepEqual(v.pending, [])
})

test('team: a change with only external reviewers is never decided', () => {
  const v = classify(change({ reviewers: [erin], votes: { 5: 1 }, requested: 3 }), 1, TEAM)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.reviewers.length, 0)
  assert.equal(v.externalReviewers.length, 1)
})

test('team: entries match username or email without regard to case', () => {
  const v = classify(change({ reviewers: [bob, carol], votes: { 2: 1, 3: 1 }, requested: 3 }), 1, ['BOB', ' carol@EXAMPLE.com '])
  assert.equal(v.state, 'approved')
  assert.equal(v.externalReviewers.length, 0)
})

test('team: the signed-in user is always a member', () => {
  // Bob reviews without being on the list: his vote and his review request still count.
  const c = change({ reviewers: [bob, carol], requested: 3 })
  const v = classify(c, bob._account_id, ['carol'])
  assert.equal(v.needsMyReview, true)
  assert.equal(v.iAmReviewer, true)
  assert.deepEqual(v.reviewers.map((r) => r.account._account_id), [2, 3])
  c.labels!['Code-Review']!.all = [{ ...bob, value: -1 }, { ...carol, value: 1 }]
  assert.equal(classify(c, bob._account_id, ['carol']).state, 'needs-changes')
})

test('team: an external owner is flagged; no team means nobody is external', () => {
  const c = change({ owner: erin, reviewers: [bob], requested: 3 })
  assert.equal(classify(c, bob._account_id, TEAM).externalOwner, true)
  assert.equal(classify(c, bob._account_id, TEAM).needsMyReview, true, 'their request still reaches me')
  const none = classify(change({ reviewers: [bob, erin], requested: 3 }), 1)
  assert.equal(none.teamScoped, false)
  assert.equal(none.externalOwner, false)
  assert.deepEqual(none.externalReviewers, [])
})

test('team: only the owner makes a change external, not its reviewers', () => {
  const theirs = classify(change({ owner: erin, reviewers: [bob], requested: 3 }), bob._account_id, TEAM)
  assert.equal(isExternalReview(theirs), true)
  // My change with an outside reviewer (CI adds maintainers) stays mine.
  const mine = classify(change({ reviewers: [bob, erin], requested: 3 }), 1, TEAM)
  assert.equal(mine.externalReviewers.length, 1)
  assert.equal(isExternalReview(mine), false)
  // A team member's change I review, with an outside reviewer, is not external either.
  const teammates = classify(change({ owner: bob, reviewers: [alice, erin], requested: 3 }), 1, TEAM)
  assert.equal(isExternalReview(teammates), false)
  // Closed changes never show, and without a team nobody is external.
  const merged = classify({ ...change({ owner: erin, reviewers: [bob] }), status: 'MERGED' }, bob._account_id, TEAM)
  assert.equal(isExternalReview(merged), false)
  assert.equal(isExternalReview(classify(change({ owner: erin, reviewers: [bob] }), bob._account_id)), false)
})

test('team: bots and the owner are left out of both lists', () => {
  const v = classify(change({ reviewers: [bob, bot, alice, erin], requested: 3 }), 1, TEAM)
  assert.deepEqual(v.reviewers.map((r) => r.account._account_id), [2])
  assert.deepEqual(v.externalReviewers.map((r) => r.account._account_id), [5])
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
  assert.equal(describeActions(c), 'Review 1, Fix 1, Mark ready 1, Merge 1')
})

test('summaries skip empty categories', () => {
  assert.equal(describeActions({ review: 0, fix: 0, ready: 0, merge: 0 }), 'Nothing waits on you')
  assert.equal(describeActions({ review: 3, fix: 0, ready: 0, merge: 2 }), 'Review 3, Merge 2')
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
