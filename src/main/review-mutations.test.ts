import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReviewMutations, REVIEW_WRITES } from './review-mutations.ts'
import { draftVersion, requireDraftVersion } from '../shared/draft-version.ts'
import type { ReviewComment } from '../shared/types.ts'

test('same-change writes serialize, unrelated changes proceed, failures do not publish', async () => {
  const events: number[] = [], order: string[] = []
  const mutations = new ReviewMutations(id => events.push(id))
  let release!: () => void
  const first = mutations.run([42], 1, () => 1, async () => { order.push('first'); await new Promise<void>(r => { release = r }) })
  const second = mutations.run([42], 1, () => 1, async () => { order.push('second') })
  await mutations.run([43], 1, () => 1, async () => { order.push('other') })
  assert.equal(mutations.busy(42), true)
  assert.equal(order.includes('second'), false)
  release(); await Promise.all([first, second])
  assert.ok(order.indexOf('first') < order.indexOf('second'))
  assert.deepEqual(events, [43, 42, 42])
  await assert.rejects(mutations.run([42], 1, () => 1, async () => { throw new Error('offline') }), /offline/)
  assert.equal(events.length, 3)
  assert.equal(mutations.busy(42), false)
  assert.ok(REVIEW_WRITES.has('gerrit:saveReviewDraft'))
  assert.ok(REVIEW_WRITES.has('gerrit:setReviewFileReviewed'))
})

test('stale queued operations cannot use a different connection', async () => {
  const mutations = new ReviewMutations(() => assert.fail('must not notify'))
  await assert.rejects(mutations.run([42], 1, () => 2, async () => assert.fail('must not write')), /Connection changed/)
})

test('concurrent stale draft updates and late autosave after publication are rejected', async () => {
  const mutations = new ReviewMutations(() => {})
  let drafts: ReviewComment[] = [{ id: 'd1', path: 'file', patch_set: 3, message: 'original', updated: '1' }]
  const expected = draftVersion(drafts[0]!)
  await mutations.run([42], 1, () => 1, async () => {
    requireDraftVersion(drafts, 'd1', expected)
    drafts = [{ ...drafts[0]!, message: 'saved in A', updated: '2' }]
  })
  await assert.rejects(mutations.run([42], 1, () => 1, async () => requireDraftVersion(drafts, 'd1', expected)), /Draft conflict/)
  assert.equal(drafts[0]?.message, 'saved in A')
  const current = draftVersion(drafts[0]!)
  await mutations.run([42], 1, () => 1, async () => { drafts = [] })
  assert.throws(() => requireDraftVersion(drafts, 'd1', current), /Draft conflict/)
})
