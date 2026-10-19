import { test, type TestContext } from 'node:test'
import type { AddressInfo } from 'node:net'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { startBrowser, audit } from '../../test/fixtures/secret-startup.mjs'

const A = { serverUrl: 'https://gerrit.invalid', username: 'dummy' }
async function fixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-startup-test-'))
  const file = path.join(dir, 'settings.json')
  const children: Awaited<ReturnType<typeof startBrowser>>[] = []
  t.after(async () => { for (const child of children) await child.stop(); await fs.chmod(dir, 0o700); await fs.rm(dir, { recursive: true, force: true }) })
  return { dir, file, async start(env = {}) { const child = await startBrowser(file, env); children.push(child); return child } }
}
function absent(value: Record<string, unknown>) { for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in value, false, key) }
for (const kind of ['plaintext', 'unreadable']) test(`browser ${kind} cleanup completes before listening, without a client or save`, async t => {
  const f = await fixture(t)
  await fs.writeFile(f.file, JSON.stringify({ ...A, password: 'dummy-old', passwordEncrypted: kind === 'unreadable', passwordStorageVersion: 0, passwordIdentity: A }), { mode: 0o644 })
  const child = await f.start()
  const ready = await child.ready()
  assert.equal(ready.events.length, 1)
  assert.equal(ready.events[0].event, 'before-listen')
  absent(ready.events[0].snapshot!)
  absent(JSON.parse(await fs.readFile(f.file, 'utf8')))
  assert.equal(ready.events[0].mode, '600')
  await child.call('session')
  const status = await child.call('getSettings')
  assert.equal(status.body.hasPassword, kind === 'plaintext')
  assert.equal((await audit(child.auditFile)).some(e => e.path === '/api/saveSettings'), false)
})
test('browser normal authenticated use works after startup cleanup, then a separate process needs re-entry', async t => {
  const f = await fixture(t)
  let requests = 0
  const server = http.createServer((req, res) => { assert.equal(req.headers.authorization, 'Basic ' + Buffer.from('dummy:dummy-old').toString('base64')); requests++; res.end(JSON.stringify({ _account_id: 1, name: 'Dummy' })) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  t.after(() => new Promise(resolve => server.close(resolve)))
  const serverUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await fs.writeFile(f.file, JSON.stringify({ ...A, serverUrl, password: 'dummy-old' }))
  const first = await f.start(); await first.ready()
  absent(JSON.parse(await fs.readFile(f.file, 'utf8')))
  assert.equal(requests, 0)
  await first.call('session')
  assert.equal((await first.call('testConnection')).status, 200)
  assert.equal(requests, 1)
  await first.stop()
  const second = await f.start(); await second.ready(); await second.call('session')
  assert.equal((await second.call('getSettings')).body.hasPassword, false)
  assert.equal((await second.call('testConnection')).status, 500)
  assert.equal(requests, 1)
})
test('browser startup failure keeps old bytes, exits nonzero, and never listens or prints readiness', async t => {
  const f = await fixture(t)
  const before = JSON.stringify({ ...A, password: 'dummy-old' })
  await fs.writeFile(f.file, before)
  await fs.writeFile(f.file + '.audit', '')
  await fs.chmod(f.dir, 0o500)
  const child = await f.start()
  await assert.rejects(child.ready(), /Browser startup failed/)
  assert.equal((await child.exited).code, 1)
  assert.equal(child.output.includes('one-use browser link'), false)
  assert.deepEqual(await audit(child.auditFile), [])
  assert.equal(await fs.readFile(f.file, 'utf8'), before)
})
test('startup keeps trusted locked ciphertext and original binding intact', async t => {
  const f = await fixture(t)
  const trusted = { ...A, password: 'dummy-trusted-cipher', passwordEncrypted: true, passwordStorageVersion: 1, passwordIdentity: A }
  await fs.writeFile(f.file, JSON.stringify(trusted))
  const child = await f.start(); await child.ready()
  assert.deepEqual(JSON.parse(await fs.readFile(f.file, 'utf8')), trusted)
  await child.call('session')
  assert.equal((await child.call('getSettings')).body.passwordStorage, 'locked')
})
for (const override of [{ GERRIT_PASSWORD: 'dummy-env' }, { GERRIT_URL: 'https://other.invalid' }]) test('startup cleanup preserves environment identity snapshots and never persists environment passwords', async t => {
  const f = await fixture(t)
  await fs.writeFile(f.file, JSON.stringify({ ...A, password: 'dummy-old', passwordIdentity: A }))
  const child = await f.start(override); await child.ready()
  absent(JSON.parse(await fs.readFile(f.file, 'utf8')))
  await child.call('session')
  const status = (await child.call('getSettings')).body
  assert.equal(status.hasPassword, Boolean(override.GERRIT_PASSWORD))
  if (override.GERRIT_PASSWORD) {
    assert.equal(status.passwordStorage, 'environment')
    const result = await child.call('saveSettings', [{ ...status, serverUrl: 'https://other.invalid', password: 'dummy-new' }])
    assert.equal(result.status, 500)
    assert.match(String(result.body.error), /restart browser mode/)
  }
})
