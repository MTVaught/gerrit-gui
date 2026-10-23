import assert from 'node:assert/strict'
import test from 'node:test'
import { NativeReviewNavigation } from './native-review.ts'
import type { ChangeInfo, ChangeLink, NativeReviewRequest } from '../shared/types.ts'
import { actionMenu, classifyAll } from '../shared/model.ts'

const change: ChangeInfo = {
  id: 'demo~main~Ione', _number: 1, project: 'demo', branch: 'main', subject: 'Selected member subject',
  status: 'NEW', owner: { _account_id: 2 }, created: '', updated: '',
  current_revision: 'latest', revisions: { latest: { _number: 5, created: '' } },
}
function fixture() {
  const sent: NativeReviewRequest[] = []
  const web: ChangeLink[] = []
  const state = { localReview: true, shown: 0, reads: 0 }
  const handlers = {
    getSettings: async () => ({ localReview: state.localReview }),
    fetchChange: async (_id: number): Promise<ChangeInfo> => { state.reads++; return change },
    openWeb: async (link: ChangeLink) => { web.push(link) },
    show: () => { state.shown++ },
    send: (request: NativeReviewRequest) => { sent.push(request) },
  }
  const navigation = new NativeReviewNavigation(handlers)
  return { navigation, sent, web, state, handlers }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('all native categories use the opt-in, retaining review comparison and selected subject', async () => {
  const f = fixture()
  f.navigation.setReady(true)
  const links: ChangeLink[] = [
    { id: 1, project: 'demo', patchSet: 4, basePatchSet: 2 },
    ...[2, 3, 4].map(id => ({ id, project: 'demo' })),
  ]
  for (const link of links) await f.navigation.select(link)
  assert.deepEqual(f.sent.map(r => r.link), links.map(link => ({ ...link, patchSet: link.patchSet ?? 5 })))
  assert.ok(f.sent.every(r => r.subject === change.subject))
  assert.deepEqual(f.web, [])
  assert.equal(f.state.shown, 4, 'each in-app selection activates the window')
})

test('settings changes apply to the next click, retaining exact opt-out destinations', async () => {
  const f = fixture()
  f.navigation.setReady(true)
  const review = { id: 1, project: 'demo', patchSet: 5, basePatchSet: 3 }
  await f.navigation.select(review)
  f.state.localReview = false
  await f.navigation.select(review)
  const page = { id: 2, project: 'demo' }
  await f.navigation.select(page)
  assert.deepEqual(f.web, [review, page])
  assert.equal(f.state.reads, 1, 'opt-out does not fetch metadata')
  f.state.localReview = true
  await f.navigation.select(page)
  assert.equal(f.sent.at(-1)?.link?.id, 2)
})

test('startup and reload retain only the latest unacknowledged selection', async () => {
  const f = fixture()
  await f.navigation.select({ id: 1, project: 'demo' })
  await f.navigation.select({ id: 2, project: 'demo' })
  assert.equal(f.sent.length, 0, 'wait for renderer readiness after window creation')
  f.navigation.setReady(true)
  f.navigation.setReady(true)
  assert.equal(f.sent.length, 1, 'duplicate readiness does not duplicate delivery')
  assert.equal(f.sent[0]?.link?.id, 2)
  f.navigation.acknowledge(1)
  f.navigation.setReady(false)
  f.navigation.setReady(true)
  assert.equal(f.sent.length, 2, 'a stale acknowledgment cannot clear the latest request')
  f.navigation.acknowledge(f.sent[1]!.requestId)
  f.navigation.setReady(false)
  f.navigation.setReady(true)
  assert.equal(f.sent.length, 2, 'handled selections do not reopen on reload')
})

test('older metadata responses and failures cannot replace a newer selection', async () => {
  for (const fail of [false, true]) {
    const f = fixture()
    const slow = deferred<ChangeInfo>()
    f.handlers.fetchChange = async id => id === 1 ? slow.promise : change
    f.navigation.setReady(true)
    const first = f.navigation.select({ id: 1, project: 'demo' })
    await Promise.resolve()
    await f.navigation.select({ id: 2, project: 'demo' })
    if (fail) slow.reject(new Error('older failure'))
    else slow.resolve(change)
    await first
    assert.equal(f.sent.length, 1)
    assert.equal(f.sent[0]?.link?.id, 2)
  }
})

test('a newer opt-out selection clears an undelivered local review', async () => {
  const f = fixture()
  await f.navigation.select({ id: 1, project: 'demo' })
  f.state.localReview = false
  await f.navigation.select({ id: 2, project: 'demo' })
  f.navigation.setReady(true)
  assert.deepEqual(f.sent, [])
  assert.deepEqual(f.web, [{ id: 2, project: 'demo' }])
})

test('metadata and settings errors reach the app without browser fallback, and recovery works', async () => {
  const f = fixture()
  f.navigation.setReady(true)
  f.handlers.fetchChange = async () => { throw new Error('offline') }
  await f.navigation.select({ id: 1, project: 'demo' })
  assert.match(f.sent[0]!.error!, /Could not open review #1: offline/)
  f.handlers.fetchChange = async () => ({ ...change, revisions: {} })
  await f.navigation.select({ id: 2, project: 'demo' })
  assert.match(f.sent[1]!.error!, /no reviewable patch set/)
  f.handlers.fetchChange = async () => change
  await f.navigation.select({ id: 3, project: 'demo' })
  assert.equal(f.sent[2]?.link?.id, 3)
  f.handlers.getSettings = async () => { throw new Error('settings unreadable') }
  await f.navigation.select({ id: 4, project: 'demo' })
  assert.match(f.sent[3]!.error!, /settings unreadable/)
  assert.deepEqual(f.web, [])
})

test('an earlier settings read cannot open a browser after a newer selection', async () => {
  const f = fixture()
  const slow = deferred<{ localReview: boolean }>()
  f.handlers.getSettings = () => slow.promise
  const first = f.navigation.select({ id: 1, project: 'demo' })
  f.handlers.getSettings = async () => ({ localReview: true })
  f.navigation.setReady(true)
  await f.navigation.select({ id: 2, project: 'demo' })
  slow.resolve({ localReview: false })
  await first
  assert.deepEqual(f.web, [])
  assert.equal(f.sent[0]?.link?.id, 2)
})

test('family branches and sequence steps retain their own link and subject through native routing', async () => {
  const self = { _account_id: 1, username: 'alex' }
  for (const sequence of [false, true]) {
    const changes = [1, 2].map((id): ChangeInfo => ({
      ...change, id: `demo~${id}`, _number: id, change_id: sequence ? `I${id}` : 'Ifamily',
      branch: sequence || id === 1 ? 'main' : 'release', subject: `Own subject ${id}`,
      reviewers: { REVIEWER: [self] }, labels: { 'Code-Review': { all: [{ ...self, value: 0 }] } },
      hashtags: ['reviewer:alex', ...(sequence ? ['sequence'] : [])],
      custom_keyed_values: { 'review-requested-ps': '5' },
      current_revision: `r${id}`,
      revisions: { [`r${id}`]: { _number: 5, created: '', commit: { subject: `Step ${id}`, message: `Step ${id}`, parents: [{ commit: id === 2 ? 'r1' : 'tip' }] } } },
    }))
    const families = actionMenu(classifyAll(changes, self._account_id)).review
    assert.equal(families.length, 1)
    assert.equal(Boolean(families[0]?.sequence), sequence)
    assert.equal(families[0]?.members.length, 2)
    const selected = families[0]!.members.find(m => m.number === 2)!
    const f = fixture()
    f.handlers.fetchChange = async id => changes.find(c => c._number === id)!
    f.navigation.setReady(true)
    await f.navigation.select(selected.link)
    assert.deepEqual(f.sent[0]?.link, selected.link)
    assert.equal(f.sent[0]?.subject, 'Own subject 2')
  }
})

test('separate windows keep every selection including duplicates during reversed startup', async () => {
  const opened: ChangeLink[] = []
  const slow = deferred<void>()
  let calls = 0
  const navigation = new NativeReviewNavigation({
    getSettings: async () => ({ localReview: true, separateReviewWindows: true }),
    fetchChange: async () => { throw new Error('separate windows resolve their own metadata') },
    show: () => assert.fail('the board stays hidden'),
    send: () => assert.fail('no board delivery'),
    openWeb: async () => assert.fail('no web fallback'),
    openSeparate: async link => { if (++calls === 1) await slow.promise; opened.push(link) },
  })
  const link = { id: 42, project: 'demo', patchSet: 3, basePatchSet: 1 }
  const first = navigation.select(link)
  await Promise.resolve()
  await navigation.select(link)
  slow.resolve(); await first
  assert.deepEqual(opened, [link, link])
})
