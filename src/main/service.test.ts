import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createService, type SettingsStore } from './service.ts'
import type { FetchLike } from './gerrit.ts'

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => { resolve = r })
  return { promise, resolve }
}

const bob = { _account_id: 2, username: 'bob' }
const credentials = { serverUrl: 'http://gerrit.test', username: 'alice', password: 'test' }
function service(fetchImpl: FetchLike, getCredentials: SettingsStore['getCredentials'] = async () => credentials) {
  return createService({
    getCredentials,
    getStatus: async () => { throw new Error('unused') },
    save: async () => { throw new Error('unused') },
  }, fetchImpl)
}

test('pretend waits for every write in outstanding actions and closes admission while waiting', async () => {
  const firstStarted = deferred()
  const firstRelease = deferred()
  const secondStarted = deferred()
  const secondRelease = deferred()
  const writes: string[] = []
  const svc = service(async (url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify(bob))
    assert.equal(await svc.getPretend(), null, 'writes finish before the mode changes')
    writes.push(url)
    if (url.includes('/changes/1/')) {
      firstStarted.resolve()
      await firstRelease.promise
    }
    if (url.includes('/changes/3/')) {
      secondStarted.resolve()
      await secondRelease.promise
    }
    return new Response('{}')
  })
  const sequence = svc.act({ type: 'setSequence', id: 1, add: [1, 2], remove: [] })
  const other = svc.act({ type: 'hashtag', id: 3, add: ['tag'] })
  await Promise.all([firstStarted.promise, secondStarted.promise])
  const switching = svc.setPretend('bob')
  await assert.rejects(svc.act({ type: 'hashtag', id: 4, add: ['tag'] }), /waiting for outstanding actions/)
  await assert.rejects(svc.setPretend(null), /already switching/)
  firstRelease.resolve()
  await sequence
  assert.equal(await svc.getPretend(), null, 'the other action still needs to finish')
  secondRelease.resolve()
  await other
  assert.deepEqual(await switching, bob)
  assert.equal(writes.length, 3)
  await assert.rejects(svc.act({ type: 'hashtag', id: 4, add: ['tag'] }), /read-only/)
  await svc.setPretend(null)
  await svc.act({ type: 'hashtag', id: 4, add: ['tag'] })
  assert.equal(writes.length, 4)
})

test('pretend also waits for actions still obtaining credentials', async () => {
  const credentialsRelease = deferred()
  let calls = 0
  let writes = 0
  const svc = service(async (_url, init) => {
    if (init.method === 'GET') return new Response(JSON.stringify(bob))
    assert.equal(await svc.getPretend(), null)
    writes++
    return new Response('{}')
  }, async () => {
    if (++calls === 1) await credentialsRelease.promise
    return credentials
  })
  const action = svc.act({ type: 'hashtag', id: 1, add: ['tag'] })
  const switching = svc.setPretend('bob')
  assert.equal(await svc.getPretend(), null)
  credentialsRelease.resolve()
  await action
  assert.deepEqual(await switching, bob)
  assert.equal(writes, 1)
})

test('failed outstanding actions release the switch; failed lookups restore admission', async () => {
  const writeStarted = deferred()
  const writeRelease = deferred()
  let failWrite = true
  const svc = service(async (url, init) => {
    if (init.method === 'GET') {
      return url.includes('/missing/')
        ? new Response('not found', { status: 404 })
        : new Response(JSON.stringify(bob))
    }
    if (failWrite) {
      writeStarted.resolve()
      await writeRelease.promise
      throw new Error('write failed')
    }
    return new Response('{}')
  })
  const actionFailed = assert.rejects(svc.act({ type: 'hashtag', id: 1, add: ['tag'] }), /write failed/)
  await writeStarted.promise
  const switchFailed = assert.rejects(svc.setPretend('missing'), /No account matches/)
  writeRelease.resolve()
  await Promise.all([actionFailed, switchFailed])
  assert.equal(await svc.getPretend(), null)
  failWrite = false
  await svc.act({ type: 'hashtag', id: 1, add: ['tag'] })
  assert.deepEqual(await svc.setPretend('bob'), bob)
})
