// Drives the real Gerrit client against a seeded local Gerrit (test/seed-gerrit.sh).
// Skipped automatically when GERRIT_TEST_URL (default http://localhost:8080) is unreachable.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GerritClient } from '../src/main/gerrit.ts'
import { createService } from '../src/main/service.ts'
import { fetchDashboard } from '../src/main/dashboard.ts'
import type { ChangeInfo } from '../src/shared/types.ts'
import { accountKeys, classify, mergerTags, reviewLink, reviewerTagsFor } from '../src/shared/model.ts'
import { IN_PERSON_REVIEW_KEY, READY_TO_MERGE_TAG, REVIEW_REQUESTED_KEY } from '../src/shared/constants.ts'

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

/** The change as the user sees it, read directly rather than searched: the index can lag a write by a moment. */
async function view(u: string, id: number, team: string[] = []) {
  const g = user(u)
  const [me, c] = await Promise.all([g.self(), g.change(id)])
  return classify(c, me._account_id, team, accountKeys(me))
}

function serviceAs(u: string) {
  return createService(
    {
      getStatus: () => Promise.reject(new Error('unused')),
      getCredentials: async () => ({ serverUrl: URL, username: u, password: `${u}pw` }),
      save: () => Promise.reject(new Error('unused')),
    },
    (url, init) => fetch(url, init),
  )
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
  // Primary reviewers: added to the change in Gerrit and tagged, by any name Gerrit resolves.
  await serviceAs('alice').act({ type: 'addPrimaryReviewer', id, reviewer: 'bob' })
  await serviceAs('alice').act({ type: 'addPrimaryReviewer', id, reviewer: 'carol@example.com' })

  let v = await view('bob', id)
  assert.deepEqual(v.change.hashtags?.slice().sort(), ['reviewer:bob', 'reviewer:carol'], 'the tag stores the username')
  assert.deepEqual(v.change.reviewers?.REVIEWER?.map((r) => r.username).sort(), ['bob', 'carol'])
  assert.equal(v.iAmPrimary, true)
  assert.equal(v.state, 'in-progress')
  assert.equal(v.wip, true)
  assert.equal(v.needsMyReview, false, 'nothing requested yet')

  await request(v.patchSet)
  v = await view('bob', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.needsMyReview, true, 'requested on a WIP change still counts')

  // The owner hides the change and shows it again; read directly, the flag is on the change (the board hides it: see below).
  await serviceAs('alice').act({ type: 'setPrivate', id, private: true })
  assert.equal((await view('bob', id)).isPrivate, true)
  // The board re-reads just this change after an action; the write is already in what it gets back.
  const fresh = await serviceAs('alice').fetchChange(id)
  assert.equal(fresh._number, id)
  assert.equal(fresh.is_private, true)
  assert.deepEqual(fresh.reviewers?.REVIEWER?.map((r) => r.username).sort(), ['bob', 'carol'], 'the same fields as a search result')
  await serviceAs('alice').act({ type: 'setPrivate', id, private: false })
  v = await view('bob', id)
  assert.equal(v.isPrivate, false)
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

  // Carol demoted: she stays on the change, her -1 is shown but no longer decides.
  await serviceAs('alice').act({ type: 'hashtag', id, remove: reviewerTagsFor((await view('alice', id)).change, { _account_id: 0, username: 'carol' }) })
  v = await view('alice', id, ['bob'])
  assert.equal(v.state, 'approved', 'only primary votes decide')
  assert.deepEqual(v.otherReviewers.map((r) => [r.account.username, r.vote]), [['carol', -1]])
  assert.deepEqual(v.reviewers.map((r) => r.account.username), ['bob'])
  // And promoted again, from the chip: just the tag, she is already on the change.
  await serviceAs('alice').act({ type: 'hashtag', id, add: ['reviewer:carol'] })
  assert.equal((await view('alice', id)).state, 'needs-changes')

  // Author pushes fixes over two patch sets; nobody is asked to look at either.
  await pushPatchSet('alice', id, 'v2')
  v = await view('bob', id)
  assert.equal(v.state, 'iterating', 'votes cleared and request is for an older patch set, which was reviewed')
  assert.equal(v.needsMyReview, false)
  assert.equal(v.requestedPatchSet, 2)
  assert.deepEqual(v.reviewedPatchSets, [2], 'the votes on patch set 2 are read from the messages')
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

  // The author asks dave in particular. Both tags go in one request.
  await serviceAs('alice').act({ type: 'requestMerge', id, merger: 'Dave', patchSet: v.patchSet, replace: [] })
  await alice.setReady(id) // now let CI run
  v = await view('dave', id)
  assert.equal(v.state, 'ready-to-merge')
  assert.equal(v.wip, false)
  assert.equal(v.requestedMerger, 'dave')
  assert.equal(v.readyPatchSet, v.patchSet)
  assert.equal(v.mergeRequestedFromMe, true)
  assert.equal(v.canMerge, true, 'dave is in the Mergers group (+2 permission)')
  assert.deepEqual(v.change.hashtags?.slice().sort(), ['merger:dave', READY_TO_MERGE_TAG, 'reviewer:bob', 'reviewer:carol'])
  assert.equal((await view('bob', id)).canMerge, false, 'reviewers cannot +2')
  assert.equal((await view('bob', id)).mergeRequestedFromMe, false)

  // The author changes their mind: the old merger tag leaves with the new one arriving.
  await serviceAs('alice').act({ type: 'requestMerge', id, merger: 'bob', patchSet: v.patchSet, replace: mergerTags(v.change) })
  v = await view('bob', id)
  assert.equal(v.requestedMerger, 'bob')
  assert.equal(v.mergeRequestedFromMe, true)
  assert.deepEqual(mergerTags(v.change), ['merger:bob'])
  await serviceAs('alice').act({ type: 'requestMerge', id, merger: 'dave', patchSet: v.patchSet, replace: mergerTags(v.change) })
  v = await view('dave', id)
  assert.equal(v.mergeRequestedFromMe, true)

  // The name behind the tag, for the owner's row.
  const [acct] = await alice.accountsByKey(['dave'])
  assert.equal(acct?.name, 'Dave')
  assert.deepEqual((await alice.accountsByKey(['no-such-user'])).length, 0)

  // The merger's single action: +2 then submit.
  const dave = user('dave')
  await dave.vote(id, 'Code-Review', 2)
  await dave.submit(id)
  assert.equal((await view('alice', id)).state, 'merged')
})

test('primary reviewer tags: anyone may tag and untag; the removal in Gerrit is best effort', { skip: !reachable && 'no local Gerrit' }, async () => {
  const c = await raw('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: `tags ${Date.now()}`, work_in_progress: true })
  const id: number = c._number
  await pushPatchSet('alice', id, 'v1')
  await serviceAs('alice').act({ type: 'addPrimaryReviewer', id, reviewer: 'bob' })
  await serviceAs('alice').act({ type: 'requestReview', id, patchSet: (await view('alice', id)).patchSet, history: [] })

  // Bob, not the owner, adds carol as primary and then takes her off again.
  await serviceAs('bob').act({ type: 'addPrimaryReviewer', id, reviewer: 'carol' })
  let v = await view('bob', id)
  assert.deepEqual(v.reviewers.map((r) => r.account.username), ['bob', 'carol'])
  const carolId = v.reviewers[1]!.account._account_id
  await serviceAs('bob').act({ type: 'removePrimaryReviewer', id, key: 'carol', accountId: carolId })
  v = await view('bob', id)
  assert.deepEqual(v.reviewers.map((r) => r.account.username), ['bob'], 'the tag went')
  assert.deepEqual(v.otherReviewers.map((r) => r.account.username), ['carol'], 'Gerrit refused bob the removal, so carol stays as a plain reviewer')
  // The owner may remove her for real.
  await serviceAs('alice').act({ type: 'addPrimaryReviewer', id, reviewer: 'carol' })
  await serviceAs('alice').act({ type: 'removePrimaryReviewer', id, key: 'carol', accountId: carolId })
  v = await view('alice', id)
  assert.deepEqual(v.reviewers.map((r) => r.account.username), ['bob'])
  assert.deepEqual(v.otherReviewers, [])

  // A tag written without adding the person: a stand-in that is waited for, and that dave sees on his board.
  await serviceAs('alice').act({ type: 'hashtag', id, add: ['reviewer:dave'] })
  v = await view('bob', id)
  assert.deepEqual(v.reviewers.map((r) => [r.key, r.tagOnly ?? false]).sort(), [['bob', false], ['dave', true]])
  assert.equal(v.state, 'needs-review')
  const asDave = await view('dave', id)
  assert.equal(asDave.iAmPrimary, true)
  assert.equal(asDave.needsMyReview, true)
  const d = await fetchDashboard(user('dave'), [])
  assert.ok(d.open.some((x) => x._number === id), 'found through hashtag:reviewer:dave although dave is not a reviewer in Gerrit')
  await serviceAs('bob').act({ type: 'removePrimaryReviewer', id, key: 'dave' })
  assert.deepEqual((await view('bob', id)).reviewers.map((r) => r.key), ['bob'])

  // A group is one input but many people; the tag names one, so it is refused before anything is added.
  await assert.rejects(serviceAs('alice').act({ type: 'addPrimaryReviewer', id, reviewer: 'Mergers' }), /groups cannot be tagged/)
  assert.deepEqual((await view('alice', id)).change.reviewers?.REVIEWER?.map((r) => r.username), ['bob'], 'nothing was added')
})

test('re-requesting review drops a ready-to-merge tag and its merger left over from an earlier patch set', { skip: !reachable && 'no local Gerrit' }, async () => {
  const alice = user('alice')
  const service = serviceAs('alice')
  const c = await raw('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: `stale tag ${Date.now()}`, work_in_progress: true })
  const id: number = c._number
  await pushPatchSet('alice', id, 'v1')
  await service.act({ type: 'addPrimaryReviewer', id, reviewer: 'bob' })
  const ps1 = (await view('alice', id)).patchSet
  await service.act({ type: 'requestReview', id, patchSet: ps1, history: [] })
  await user('bob').vote(id, 'Code-Review', 1, 'ok')
  await service.act({ type: 'requestMerge', id, merger: 'dave', patchSet: ps1 })
  assert.equal((await view('alice', id)).state, 'ready-to-merge')
  assert.equal((await view('alice', id)).readyPatchSet, ps1)

  // A new patch set resets the votes; the tag stays behind in Gerrit and is now stale.
  await pushPatchSet('alice', id, 'v2')
  let v = await view('alice', id)
  assert.equal(v.state, 'iterating', "bob's vote on patch set 1 makes the new one an iteration")
  assert.equal(v.staleReadyToMerge, true)

  // Without the flag the request leaves the tag alone (it is the user's call, not the app's).
  await service.act({ type: 'requestReview', id, patchSet: v.patchSet, history: v.requestedPatchSets })
  v = await view('alice', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.staleReadyToMerge, true)
  assert.deepEqual(v.requestedPatchSets, [ps1, v.patchSet], 'the request appended to the list')
  assert.equal(v.canWithdrawReview, true, 'a later round can be taken back too')
  // Withdrawing the second round pops it and leaves the first on record, so the change is iterating again.
  await service.act({ type: 'withdrawReview', id, history: v.requestedPatchSets })
  v = await view('alice', id)
  assert.deepEqual(v.requestedPatchSets, [ps1], 'the earlier round stays')
  assert.equal(v.state, 'iterating')
  await alice.setCustomKeyedValues(id, {}, [REVIEW_REQUESTED_KEY])

  await service.act({ type: 'requestReview', id, patchSet: v.patchSet, history: [], clearTags: [READY_TO_MERGE_TAG, ...mergerTags(v.change)] })
  v = await view('alice', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.staleReadyToMerge, false, 'the tag went with the request')
  assert.ok(!v.change.hashtags?.includes(READY_TO_MERGE_TAG))
  assert.equal(v.requestedMerger, null, 'the merger tag went with it')
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

  // A reviewer: tag naming bob is found directly, WIP or not, so only untagged changes depend on the scan.
  const scoped = await fetchDashboard(bob, ['does-not-exist'])
  const scannedOnly = (c: ChangeInfo) => c.work_in_progress && c.owner.username !== 'bob' && !c.hashtags?.includes('ready-to-merge') && !c.hashtags?.includes('reviewer:bob')
  assert.equal(scoped.open.filter(scannedOnly).length, 0, 'scope excludes the demo project from the WIP scan')

  // With a team, every open change of a teammate comes along, reviewed by bob or not, for the Team Reviews tab.
  const withTeam = await fetchDashboard(bob, [], ['alice'])
  const notInvolved = (c: ChangeInfo) => c.owner.username === 'alice' && !c.reviewers?.REVIEWER?.some((r) => r.username === 'bob') && !c.hashtags?.some((t) => t.startsWith('reviewer:bob'))
  assert.equal(d.open.filter(notInvolved).length, 0, 'without a team, only what concerns bob')
  assert.ok(withTeam.open.filter(notInvolved).length > 0, 'the seeded C1 has no reviewers at all')
  assert.equal(new Set(withTeam.open.map((c) => c.id)).size, withTeam.open.length, 'no duplicates')
})

test('a private change of another author is on nobody else\'s board, reviewer, CC or teammate', { skip: !reachable && 'no local Gerrit' }, async () => {
  const alice = user('alice')
  const c = await raw('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: `private ${Date.now()}`, is_private: true })
  const id: number = c._number
  await pushPatchSet('alice', id, 'v1')
  await serviceAs('alice').act({ type: 'addPrimaryReviewer', id, reviewer: 'bob' })
  await raw('alice', 'POST', `/changes/${id}/reviewers`, { reviewer: 'carol', state: 'CC' })
  await alice.setCustomKeyedValues(id, { [REVIEW_REQUESTED_KEY]: '1' })
  assert.equal((await view('bob', id)).isPrivate, true, 'sanity: Gerrit lets the reviewer read it')

  // The owner's board lists it; wait for the index, which can lag the writes.
  const onBoard = async (u: string, team: string[] = []) => (await fetchDashboard(user(u), [], team)).open.some((x) => x._number === id)
  for (let i = 0; i < 20 && !(await onBoard('alice')); i++) await new Promise((r) => setTimeout(r, 500))
  assert.equal(await onBoard('alice'), true, 'the owner sees their own private change')

  // Gerrit would return it to bob (reviewer, tagged, review requested) and to carol (CC), and to a teammate.
  const [raw1] = await user('bob').queryChanges([`change:${id} reviewer:self`])
  assert.equal(raw1.length, 1, 'sanity: reviewer:self finds it in Gerrit')
  assert.equal(await onBoard('bob'), false, 'not for the reviewer')
  assert.equal(await onBoard('bob', ['alice']), false, 'not for the reviewer with the owner on the team')
  assert.equal(await onBoard('carol', ['alice']), false, 'not for the CC')
  assert.equal(await onBoard('dave', ['alice']), false, 'not for a teammate')

  // Made public, the same change reaches everyone as usual.
  await serviceAs('alice').act({ type: 'setPrivate', id, private: false })
  for (let i = 0; i < 20 && !(await onBoard('bob')); i++) await new Promise((r) => setTimeout(r, 500))
  assert.equal(await onBoard('bob'), true, 'public again: the reviewer sees it')
  assert.equal(await onBoard('carol', ['alice']), true, 'public again: the teammate sees it')
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

test('an in-person request is its own state, switches kind in place, withdraws and re-requests cleanly', { skip: !reachable && 'no local Gerrit' }, async () => {
  const service = serviceAs('alice')
  const c = await raw('alice', 'POST', '/changes/', { project: 'demo', branch: 'master', subject: `in person ${Date.now()}`, work_in_progress: true })
  const id: number = c._number
  await pushPatchSet('alice', id, 'v1')
  await service.act({ type: 'addPrimaryReviewer', id, reviewer: 'bob' })
  const ps1 = (await view('alice', id)).patchSet

  await service.act({ type: 'requestReview', id, patchSet: ps1, history: [], inPerson: true })
  let v = await view('bob', id)
  assert.equal(v.state, 'in-person-review')
  assert.equal(v.inPerson, true)
  assert.equal(v.needsMyReview, true, 'bob is waited for all the same')
  assert.equal(v.change.custom_keyed_values?.[IN_PERSON_REVIEW_KEY], String(ps1))

  // The kind switches without touching the round.
  await service.act({ type: 'setReviewKind', id, patchSet: ps1, inPerson: false })
  v = await view('alice', id)
  assert.equal(v.state, 'needs-review')
  assert.deepEqual(v.requestedPatchSets, [ps1])
  assert.equal(v.change.custom_keyed_values?.[IN_PERSON_REVIEW_KEY], undefined)
  await service.act({ type: 'setReviewKind', id, patchSet: ps1, inPerson: true })
  assert.equal((await view('alice', id)).state, 'in-person-review')

  // Withdraw takes both values away.
  await service.act({ type: 'withdrawReview', id, history: [ps1] })
  v = await view('alice', id)
  assert.equal(v.state, 'in-progress')
  assert.equal(v.change.custom_keyed_values?.[IN_PERSON_REVIEW_KEY], undefined)

  // In person, voted on, then a new patch set re-requested as pass-around: the old record goes with the new request.
  await service.act({ type: 'requestReview', id, patchSet: ps1, history: [], inPerson: true })
  await user('bob').vote(id, 'Code-Review', -1, 'discussed')
  assert.equal((await view('alice', id)).state, 'needs-changes', 'the votes decide, as for a pass-around review')
  await pushPatchSet('alice', id, 'v2')
  v = await view('alice', id)
  assert.equal(v.state, 'iterating')
  await service.act({ type: 'requestReview', id, patchSet: v.patchSet, history: v.requestedPatchSets })
  v = await view('bob', id)
  assert.equal(v.state, 'needs-review')
  assert.equal(v.change.custom_keyed_values?.[IN_PERSON_REVIEW_KEY], undefined, 'a pass-around request removes the record')

  // Only the owner may set the kind: bob cannot turn his own request into an in-person one.
  await assert.rejects(user('bob').setCustomKeyedValues(id, { [IN_PERSON_REVIEW_KEY]: String(v.patchSet) }))
})
