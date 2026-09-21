import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classify } from '../../../shared/model.ts'
import type { AccountInfo, ChangeInfo } from '../../../shared/types.ts'
import { changeActions } from './actions.ts'

const alice: AccountInfo = { _account_id: 1, name: 'Alice', username: 'alice' }
const bob: AccountInfo = { _account_id: 2, name: 'Bob', username: 'bob' }
const ci: AccountInfo = { _account_id: 9, name: 'CI', username: 'ci', tags: ['SERVICE_USER'] }

/** Alice's change, approved by Bob on the current patch set. */
function approved(opts: { wip?: boolean; verified?: number }): ChangeInfo {
  return {
    id: 'demo~1',
    _number: 1,
    project: 'demo',
    branch: 'master',
    subject: 's',
    status: 'NEW',
    owner: alice,
    work_in_progress: opts.wip,
    hashtags: ['reviewer:bob'],
    created: '',
    updated: '',
    reviewers: { REVIEWER: [bob] },
    labels: {
      'Code-Review': { all: [{ ...bob, value: 1 }] },
      Verified: { all: opts.verified === undefined ? [] : [{ ...ci, value: opts.verified }] },
    },
    current_revision: 'abc',
    revisions: { abc: { _number: 1, created: '' } },
  }
}

/** Alice's change with Bob as primary reviewer, patch set `ps`, review requested on `requested`, and Gerrit's messages. */
function requested(ps: number, requested: number[], messages: ChangeInfo['messages'] = []): ChangeInfo {
  const c = approved({})
  c.labels = { 'Code-Review': { all: [{ ...bob, value: 0 }] } }
  c.revisions = { abc: { _number: ps, created: '' } }
  c.custom_keyed_values = { 'review-requested-ps': requested.join(',') }
  c.messages = messages
  return c
}
const bobVoted = (ps: number) => ({ id: `b${ps}`, author: bob, date: '', message: `Patch Set ${ps}: Code-Review-1`, _revision_number: ps })

test('Withdraw is offered while a request is open, whichever round, and pops only the latest one', () => {
  const sent: unknown[] = []
  const acts = (c: ChangeInfo) => changeActions(classify(c, alice._account_id), async (a) => void sent.push(a))
  const keys = (c: ChangeInfo) => acts(c).map((a) => a.key)
  assert.ok(keys(requested(1, [1])).includes('withdraw'))
  assert.ok(keys(requested(3, [1, 3], [bobVoted(1)])).includes('withdraw'), 'a later round after the first was answered')
  assert.ok(keys(requested(2, [1, 2])).includes('withdraw'), 'a second request')
  assert.ok(!keys(requested(2, [1])).includes('withdraw'), 'no request open on this patch set')
  acts(requested(3, [1, 3], [bobVoted(1)])).find((a) => a.key === 'withdraw')!.run()
  assert.deepEqual(sent[0], { type: 'withdrawReview', id: 1, history: [1, 3] }, 'the service keeps the earlier rounds')
})

test('Request review carries the earlier requests along and says Re-request only after a round was answered', () => {
  const sent: unknown[] = []
  const spec = (c: ChangeInfo) => changeActions(classify(c, alice._account_id), async (a) => void sent.push(a)).find((a) => a.key === 'request')!
  const fresh = spec(requested(2, [1]))
  assert.equal(fresh.label, 'Request (PS 2)', 'nobody voted on patch set 1, so this is still the first round')
  fresh.run()
  assert.deepEqual(sent[0], { type: 'requestReview', id: 1, patchSet: 2, history: [1], clearTags: undefined, inPerson: false })
  const again = spec(requested(3, [1, 2], [bobVoted(2)]))
  assert.equal(again.label, 'Re-request (PS 3)')
  again.run()
  assert.deepEqual(sent[1], { type: 'requestReview', id: 1, patchSet: 3, history: [1, 2], clearTags: undefined, inPerson: false })
})

test('Request review is a split button: pass-around by default, in-person from the caret', () => {
  const sent: unknown[] = []
  const spec = changeActions(classify(requested(2, [1]), alice._account_id), async (a) => void sent.push(a)).find((a) => a.key === 'request')!
  assert.deepEqual(
    spec.split!.map((m) => m.key),
    ['pass-around', 'in-person'],
  )
  spec.split![1]!.run()
  assert.deepEqual(sent[0], { type: 'requestReview', id: 1, patchSet: 2, history: [1], clearTags: undefined, inPerson: true })
})

function inPerson(ps: number, history: number[], messages: ChangeInfo['messages'] = []): ChangeInfo {
  const c = requested(ps, history, messages)
  c.custom_keyed_values!['in-person-review-ps'] = String(ps)
  return c
}

test('An open request can switch kind: from the Withdraw caret on a first request, from its own button on a later round', () => {
  const sent: unknown[] = []
  const acts = (c: ChangeInfo) => changeActions(classify(c, alice._account_id), async (a) => void sent.push(a))
  // First request, pass-around: Withdraw carries the switch to in-person.
  const withdraw = acts(requested(1, [1])).find((a) => a.key === 'withdraw')!
  assert.deepEqual(
    withdraw.split!.map((m) => m.key),
    ['in-person'],
  )
  withdraw.split![0]!.run()
  assert.deepEqual(sent[0], { type: 'setReviewKind', id: 1, patchSet: 1, inPerson: true })
  // First request, in-person: Withdraw is still offered, and the switch goes back.
  const back = acts(inPerson(1, [1])).find((a) => a.key === 'withdraw')!
  assert.deepEqual(
    back.split!.map((m) => m.key),
    ['pass-around'],
  )
  back.split![0]!.run()
  assert.deepEqual(sent[1], { type: 'setReviewKind', id: 1, patchSet: 1, inPerson: false })
  // A later round: the same Withdraw button, with the switch in its menu.
  const later = acts(inPerson(3, [1, 3], [bobVoted(1)])).find((a) => a.key === 'withdraw')!
  assert.deepEqual(
    later.split!.map((m) => m.key),
    ['pass-around'],
  )
  // No request open: no switch anywhere.
  assert.ok(!acts(requested(2, [1])).some((a) => a.key === 'withdraw'))
})

function ready(c: ChangeInfo) {
  const v = classify(c, alice._account_id)
  assert.equal(v.state, 'approved')
  const a = changeActions(v, () => Promise.resolve()).find((a) => a.key === 'ready')
  assert.ok(a, 'the owner of an approved change gets the Ready to Merge button')
  return a
}

test('Ready to Merge is enabled only for an active, verified, approved change', () => {
  const ok = ready(approved({ verified: 1 }))
  assert.equal(ok.disabled, false)
  assert.equal(ok.title, 'Pick the person to ask for the merge')
})

test('Ready to Merge is disabled on a WIP change, and says why', () => {
  const a = ready(approved({ wip: true, verified: 1 }))
  assert.equal(a.disabled, true)
  assert.match(a.title!, /active/i)
})

test('Ready to Merge is disabled without Verified +1, and says why', () => {
  for (const verified of [undefined, 0, -1]) {
    const a = ready(approved({ verified }))
    assert.equal(a.disabled, true, `verified ${verified}`)
    assert.match(a.title!, /Verified \+1/)
  }
})
