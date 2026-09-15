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
