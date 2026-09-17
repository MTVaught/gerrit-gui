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

test('Withdraw is offered on a first request nobody answered, and on no later round', () => {
  const acts = (c: ChangeInfo) => changeActions(classify(c, alice._account_id), () => Promise.resolve()).map((a) => a.key)
  assert.ok(acts(requested(1, [1])).includes('withdraw'))
  assert.ok(!acts(requested(3, [1, 3], [bobVoted(1)])).includes('withdraw'), 'the first round was answered')
  assert.ok(!acts(requested(2, [1, 2])).includes('withdraw'), 'a second request, even unanswered')
})

test('Request review carries the earlier requests along and says Re-request only after a round was answered', () => {
  const sent: unknown[] = []
  const spec = (c: ChangeInfo) => changeActions(classify(c, alice._account_id), async (a) => void sent.push(a)).find((a) => a.key === 'request')!
  const fresh = spec(requested(2, [1]))
  assert.equal(fresh.label, 'Request review (PS 2)', 'nobody voted on patch set 1, so this is still the first round')
  fresh.run()
  assert.deepEqual(sent[0], { type: 'requestReview', id: 1, patchSet: 2, history: [1], clearTags: undefined })
  const again = spec(requested(3, [1, 2], [bobVoted(2)]))
  assert.equal(again.label, 'Re-request review (PS 3)')
  again.run()
  assert.deepEqual(sent[1], { type: 'requestReview', id: 1, patchSet: 3, history: [1, 2], clearTags: undefined })
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
