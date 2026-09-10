// Drives the real Gerrit client against a seeded local Gerrit (test/seed-gerrit.sh).
// Skipped automatically when GERRIT_TEST_URL (default http://localhost:8080) is unreachable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GerritClient } from '../src/main/gerrit.ts'
import { createService } from '../src/main/service.ts'
import { fetchDashboard } from '../src/main/dashboard.ts'
import type { ChangeInfo } from '../src/shared/types.ts'
import { classify, reviewLink } from '../src/shared/model.ts'
import { READY_TO_MERGE_TAG, REVIEW_REQUESTED_KEY } from '../src/shared/constants.ts'

const URL = process.env['GERRIT_TEST_URL'] ?? 'http://localhost:8080'
const user = (u: string) => new GerritClient(URL, u, `${u}pw`)

// Reachability is decided at load time (top-level await) so `skip` is accurate.
const reachable = await user('bob')
  .self()
  .then(() => true)
  .catch(() => false)

async function raw(u: string, method: string, path: string, body?: unknown, contentType = 'application/json') {
  const res = await fetch(`${URL}/a${path}`, {
    method,
    headers: { Authorization: 'Basic ' + Buffer.from(`${u}:${u}pw`).toString('base64'), 'Content-Type': contentType },
    body: body === undefined ? undefined : contentType === 'application/json' ? JSON.stringify(body) : String(body),
  })
  const text = await res.text()
  assert.ok(res.ok, `${method} ${path} -> ${res.status} ${text}`)
  return text.startsWith(")]}'") ? JSON.parse(text.slice(4)) : text
}

async function pushPatchSet(u: string, id: number, content: string) {
  await raw(u, 'PUT', `/changes/${id}/edit/a.txt`, content, 'text/plain')
  await raw(u, 'POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
}

async function view(u: string, id: number, team: string[] = []) {
  const g = user(u)
  const me = await g.self()
  const [[c]] = await g.queryChanges([`change:${id}`])
  return classify(c, me._account_id, team)
}

test('full workflow through the client', { skip: !reachable && 'no local Gerrit at ' + URL }, async () => {
  const alice = user('alice')
  const bob = user('bob')
  const carol = user('carol')
  const request = (ps: number) => alice.setCustomKeyedValues(id, { [REVIEW_REQUESTED_KEY]: String(ps) })

  const c = await raw('alice', 'POST', '/changes/', {
    project: 'demo', branch: 'master', subject: `integration ${Date.now()}`, work_in_progress: true,
  })
  const id: number = c._number
  await pushPatchSet('alice', id, 'v1')
  await alice.addReviewer(id, 'bob')
  await alice.addReviewer(id, 'carol')

  let v = await view('bob', id)
  assert.equal(v.state, 'in-progress')
  assert.equal(v.wip, true)
  assert.equal(v.needsMyReview, false, 'nothing requested yet')

  await request(v.patchSet)
  v = await view('bob', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.needsMyReview, true, 'requested on a WIP change still counts')
  assert.deepEqual(v.pending.map((a) => a.username).sort(), ['bob', 'carol'])

  assert.equal(v.lastReviewedPatchSet, null, 'no vote or reply yet')
  assert.equal(reviewLink(v).basePatchSet, undefined, 'first look: the whole patch set against base')
  const reviewedPs = v.patchSet
  await bob.vote(id, 'Code-Review', 1, 'fine by me')
  v = await view('bob', id)
  assert.equal(v.needsMyReview, false, 'voting removes me from needs-review')
  assert.equal(v.lastReviewedPatchSet, reviewedPs, 'the vote message records the patch set')
  assert.deepEqual(v.pending.map((a) => a.username), ['carol'])
  assert.equal(v.state, 'needs-review', 'not decided until carol votes')

  await carol.vote(id, 'Code-Review', -1, 'rename please')
  assert.equal((await view('alice', id)).state, 'needs-changes', 'everyone voted, one negative')

  // The same votes seen with a team that leaves carol out: her -1 is shown but does not decide.
  v = await view('alice', id, ['bob'])
  assert.equal(v.state, 'approved', 'only team votes decide')
  assert.deepEqual(v.externalReviewers.map((r) => [r.account.username, r.vote]), [['carol', -1]])
  assert.deepEqual(v.reviewers.map((r) => r.account.username), ['bob'])

  // Author pushes fixes over two patch sets; nobody is asked to look at either.
  await pushPatchSet('alice', id, 'v2')
  v = await view('bob', id)
  assert.equal(v.state, 'in-progress', 'votes cleared and request is for an older patch set')
  assert.equal(v.needsMyReview, false)
  assert.equal(v.requestedPatchSet, 2)
  await pushPatchSet('alice', id, 'v3')
  v = await view('carol', id)
  assert.equal(v.patchSet, 4)
  v = await view('bob', id)
  assert.equal(v.lastReviewedPatchSet, reviewedPs, "the author's uploads do not move my last review")
  assert.deepEqual(reviewLink(v), { id, project: v.change.project, patchSet: 4, basePatchSet: reviewedPs })
  assert.equal(v.needsMyReview, false)

  // Re-request: everyone is asked again, for this patch set only.
  await request(4)
  v = await view('bob', id)
  assert.equal(v.state, 'needs-review')
  assert.deepEqual(v.pending.map((a) => a.username).sort(), ['bob', 'carol'])

  // Withdraw and re-request round-trips cleanly.
  await alice.setCustomKeyedValues(id, {}, [REVIEW_REQUESTED_KEY])
  assert.equal((await view('bob', id)).state, 'in-progress')
  await request(4)

  // Reviewers only ever +1; approval never depends on a +2.
  await bob.vote(id, 'Code-Review', 1, 'ok')
  await carol.vote(id, 'Code-Review', 1, 'ok now')
  v = await view('alice', id)
  assert.equal(v.state, 'approved')
  assert.equal(v.wip, true, 'approved while still WIP, CI has not run')
  assert.notEqual(v.change.submittable, true, 'Gerrit itself does not consider +1s submittable')

  await alice.setHashtags(id, [READY_TO_MERGE_TAG])
  await alice.setReady(id) // now let CI run
  v = await view('dave', id)
  assert.equal(v.state, 'ready-to-merge')
  assert.equal(v.wip, false)
  assert.equal(v.canMerge, true, 'dave is in the Mergers group (+2 permission)')
  assert.equal((await view('bob', id)).canMerge, false, 'reviewers cannot +2')

  // The merger's single action: +2 then submit.
  const dave = user('dave')
  await dave.vote(id, 'Code-Review', 2)
  await dave.submit(id)
  assert.equal((await view('alice', id)).state, 'merged')
})

test('re-requesting review drops a ready-to-merge tag left over from an earlier patch set', { skip: !reachable && 'no local Gerrit' }, async () => {
  const alice = user('alice')
  const service = createService(
    {
      getStatus: () => Promise.reject(new Error('unused')),
      getCredentials: async () => ({ serverUrl: URL, username: 'alice', password: 'alicepw' }),
      save: () => Promise.reject(new Error('unused')),
    },
    (url, init) => fetch(url, init),
  )
  const c = await raw('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: `stale tag ${Date.now()}`, work_in_progress: true })
  const id: number = c._number
  await pushPatchSet('alice', id, 'v1')
  await alice.addReviewer(id, 'bob')
  await service.act({ type: 'requestReview', id, patchSet: 1 })
  await user('bob').vote(id, 'Code-Review', 1, 'ok')
  await alice.setHashtags(id, [READY_TO_MERGE_TAG])
  assert.equal((await view('alice', id)).state, 'ready-to-merge')

  // A new patch set resets the votes; the tag stays behind in Gerrit and is now stale.
  await pushPatchSet('alice', id, 'v2')
  let v = await view('alice', id)
  assert.equal(v.state, 'in-progress')
  assert.equal(v.staleReadyToMerge, true)

  // Without the flag the request leaves the tag alone (it is the user's call, not the app's).
  await service.act({ type: 'requestReview', id, patchSet: v.patchSet })
  v = await view('alice', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.staleReadyToMerge, true)
  await alice.setCustomKeyedValues(id, {}, [REVIEW_REQUESTED_KEY])

  await service.act({ type: 'requestReview', id, patchSet: v.patchSet, clearReadyTag: true })
  v = await view('alice', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.staleReadyToMerge, false, 'the tag went with the request')
  assert.ok(!v.change.hashtags?.includes(READY_TO_MERGE_TAG))
  assert.equal(v.requestedPatchSet, v.patchSet)
})

test('dashboard fetch includes WIP changes the user reviews, which reviewer: cannot find', { skip: !reachable && 'no local Gerrit' }, async () => {
  const bob = user('bob')
  const [direct] = await bob.queryChanges(['is:open reviewer:self'])
  assert.ok(direct.every((c) => c.work_in_progress !== true), 'sanity: reviewer:self hides WIP changes')

  const d = await fetchDashboard(bob, [])
  const wipReviewing = d.open.filter((c) => c.work_in_progress && c.owner.username !== 'bob')
  assert.ok(wipReviewing.length >= 3, `expected seeded WIP changes bob reviews, got ${wipReviewing.length}`)
  assert.ok(d.open.every((c) => c.owner.username === 'bob' || c.reviewers?.REVIEWER?.some((r) => r.username === 'bob') || c.hashtags?.includes('ready-to-merge')))
  assert.equal(new Set(d.open.map((c) => c.id)).size, d.open.length, 'no duplicates')
  assert.equal(d.truncated, false)

  const scoped = await fetchDashboard(bob, ['does-not-exist'])
  const scannedOnly = (c: ChangeInfo) => c.work_in_progress && c.owner.username !== 'bob' && !c.hashtags?.includes('ready-to-merge')
  assert.equal(scoped.open.filter(scannedOnly).length, 0, 'scope excludes the demo project from the WIP scan')
})

test('reviewers cannot forge a review request', { skip: !reachable && 'no local Gerrit' }, async () => {
  const bob = user('bob')
  const [[c]] = await bob.queryChanges(['is:open owner:alice reviewer:bob'], 1)
  await assert.rejects(
    bob.setCustomKeyedValues(c._number, { [REVIEW_REQUESTED_KEY]: '1' }),
    (e: Error & { status?: number }) => e.status === 403,
  )
})

test('bad credentials surface as a 401 GerritError', { skip: !reachable && 'no local Gerrit' }, async () => {
  await assert.rejects(new GerritClient(URL, 'bob', 'wrong').self(), (e: Error & { status?: number }) => e.status === 401)
})
