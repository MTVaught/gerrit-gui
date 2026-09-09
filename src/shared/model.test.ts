import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from './model.ts'
import { REVIEW_REQUESTED_KEY } from './constants.ts'
import type { AccountInfo, ChangeInfo } from './types.ts'

const alice: AccountInfo = { _account_id: 1, name: 'Alice' }
const bob: AccountInfo = { _account_id: 2, name: 'Bob' }
const carol: AccountInfo = { _account_id: 3, name: 'Carol' }
const bot: AccountInfo = { _account_id: 9, name: 'CI', tags: ['SERVICE_USER'] }

function change(opts: {
  reviewers?: AccountInfo[]
  votes?: Record<number, number>
  wip?: boolean
  hashtags?: string[]
  status?: ChangeInfo['status']
  patchSet?: number
  requested?: number
}): ChangeInfo {
  const reviewers = opts.reviewers ?? []
  return {
    id: 'demo~master~I1',
    _number: 1,
    project: 'demo',
    branch: 'master',
    subject: 's',
    status: opts.status ?? 'NEW',
    owner: alice,
    work_in_progress: opts.wip,
    hashtags: opts.hashtags ?? [],
    custom_keyed_values: opts.requested ? { [REVIEW_REQUESTED_KEY]: String(opts.requested) } : {},
    created: '',
    updated: '',
    reviewers: { REVIEWER: reviewers },
    labels: {
      'Code-Review': {
        all: reviewers.map((r) => ({ ...r, value: opts.votes?.[r._account_id] ?? 0 })),
      },
    },
    permitted_labels: { 'Code-Review': ['-1', ' 0', '+1'] },
    current_revision: 'abc',
    revisions: { abc: { _number: opts.patchSet ?? 3, created: '' } },
  }
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
