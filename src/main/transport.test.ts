import { afterEach, beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { GerritClient } from './gerrit.ts'
import { createService } from './service.ts'
import { fileSettings } from '../server/file-settings.ts'
import { transportServer } from './test-fixtures/transport-server.ts'
import { spawn } from 'node:child_process'

const envKeys = ['GERRIT_URL', 'GERRIT_USER', 'GERRIT_PASSWORD', 'GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP'] as const

let savedEnv: Record<string, string | undefined>
beforeEach(() => {
  savedEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))
  for (const key of envKeys) delete process.env[key]
})
afterEach(() => {
  for (const key of envKeys) setEnv(key, savedEnv[key])
})
function setEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete process.env[key]
  else process.env[key] = value
}

test('transport policy blocks remote HTTP before any fetch, including with the local opt-in', async (t) => {
  for (const enabled of [undefined, '0', 'true', '1']) {
    setEnv('GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP', enabled)
    let calls = 0
    const fetchImpl = async () => { calls++; return new Response('{}') }
    for (const url of ['http://gerrit.example', 'http://192.168.1.10', 'ftp://gerrit.example']) {
      assert.throws(() => new GerritClient(url, 'dummy', 'dummy', fetchImpl), /requires HTTPS/)
    }
    if (enabled !== '1') assert.throws(() => new GerritClient('http://127.0.0.1:8080', 'dummy', 'dummy', fetchImpl), /requires HTTPS/)
    assert.equal(calls, 0)
  }
})

test('HTTPS and explicit loopback tests send Basic auth with redirects disabled', async (t) => {
  setEnv('GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP', '1')
  for (const base of ['https://gerrit.example/gerrit1', 'http://127.0.0.1:8080', 'http://[::1]:8080']) {
    const client = new GerritClient(base, 'dummy', 'dummy', async (url, init) => {
      assert.equal(url, `${base}/a/accounts/self`)
      assert.equal(new Headers(init.headers).get('Authorization'), 'Basic ' + Buffer.from('dummy:dummy').toString('base64'))
      assert.equal(init.redirect, 'error')
      return new Response(JSON.stringify({ _account_id: 1, username: 'dummy' }))
    })
    assert.equal((await client.self()).username, 'dummy')
  }
})

test('browser settings reject HTTP on save, legacy reads, and environment overrides', async (t) => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gerrit-transport-settings-'))
  t.after(() => rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  const store = fileSettings(file)
  const input = { ...await store.getStatus(), serverUrl: 'https://gerrit.example/gerrit1', username: 'dummy', password: 'dummy' }
  await store.save(input)
  const before = await readFile(file, 'utf8')
  await assert.rejects(store.save({ ...input, serverUrl: 'http://gerrit.example' }), /requires HTTPS/)
  assert.equal(await readFile(file, 'utf8'), before, 'invalid settings leave the saved file intact')
  assert.equal((await store.getCredentials())?.serverUrl, input.serverUrl)
  await writeFile(file, JSON.stringify({ ...input, serverUrl: 'http://gerrit.example' }))
  assert.equal((await store.getStatus()).serverUrl, 'http://gerrit.example', 'old URL remains visible for correction')
  await assert.rejects(store.getCredentials(), /requires HTTPS/)
  setEnv('GERRIT_URL', 'http://gerrit.example')
  setEnv('GERRIT_USER', 'dummy')
  setEnv('GERRIT_PASSWORD', 'dummy')
  const remoteOverride = fileSettings(file)
  assert.equal((await remoteOverride.getStatus()).serverUrl, 'http://gerrit.example')
  await assert.rejects(remoteOverride.getCredentials(), /requires HTTPS/)
  setEnv('GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP', '1')
  await assert.rejects(remoteOverride.getCredentials(), /requires HTTPS/)
  setEnv('GERRIT_URL', 'http://127.0.0.1:8080')
  const localOverride = fileSettings(file)
  assert.equal((await localOverride.getCredentials())?.serverUrl, 'http://127.0.0.1:8080')
  await assert.rejects(remoteOverride.getCredentials(), /requires HTTPS/, 'existing stores keep their startup environment identity')
  setEnv('GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP', undefined)
  await assert.rejects(localOverride.getCredentials(), /requires HTTPS/)
  for (const value of ['https://[', 'ftp://gerrit.example']) {
    setEnv('GERRIT_URL', value)
    const invalidOverride = fileSettings(file)
    assert.equal((await invalidOverride.getStatus()).serverUrl, value, 'invalid environment URL remains visible')
    await assert.rejects(invalidOverride.getCredentials(), /valid HTTPS|requires HTTPS/)
  }
})

test('legacy or custom settings cannot bypass transport checks through service operations', async (t) => {
  setEnv('GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP', undefined)
  let calls = 0
  const service = createService({
    getStatus: async () => { throw new Error('unused') },
    getCredentials: async () => ({ serverUrl: 'http://gerrit.example', username: 'dummy', password: 'dummy' }),
    save: async () => {},
  }, async () => { calls++; return new Response('{}') })
  await assert.rejects(service.testConnection(), /requires HTTPS/)
  await assert.rejects(service.reviewFiles({ id: 1, project: 'demo', patchSet: 1 }), /requires HTTPS/)
  await assert.rejects(service.act({ type: 'setWip', id: 1, wip: true }), /requires HTTPS/)
  assert.equal(calls, 0)
})

test('real fetch uses verified TLS and refuses all HTTP downgrade redirects without contacting HTTP', { timeout: 20000 }, async (t) => {
  const fixture = await transportServer()
  t.after(() => fixture.close())
  // The default trust store must reject the fixture's untrusted certificate.
  await assert.rejects(new GerritClient(fixture.httpsUrl + '/gerrit', 'dummy', 'dummy').self(), /certificate|SELF_SIGNED/i)
  assert.equal(fixture.tlsRequests.length, 0)
  // A fresh process loads only this test CA through the normal Node trust path.
  const script = `
    import assert from 'node:assert/strict';
    import { GerritClient } from ${JSON.stringify(new URL('./gerrit.ts', import.meta.url).href)};
    const base = ${JSON.stringify(fixture.httpsUrl)};
    assert.equal((await new GerritClient(base + '/gerrit', 'dummy', 'dummy').self()).username, 'dummy');
    for (const status of [301, 302, 303, 307, 308]) {
      await assert.rejects(new GerritClient(base + '/redirect-' + status, 'dummy', 'dummy').self(), /redirect/i);
    }
  `
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, NODE_EXTRA_CA_CERTS: fixture.certFile }, stdio: ['ignore', 'pipe', 'pipe'],
  })
  t.after(() => child.kill())
  let output = ''
  child.stdout.on('data', data => { output += data })
  child.stderr.on('data', data => { output += data })
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve) })
  assert.equal(code, 0, output)
  assert.equal(fixture.tlsRequests.length, 6)
  assert.ok(fixture.tlsRequests.every(request => request.authorization === 'Basic ' + Buffer.from('dummy:dummy').toString('base64')))
  assert.deepEqual(fixture.httpRequests, [], 'no credentials or requests reach the HTTP listener')
})
