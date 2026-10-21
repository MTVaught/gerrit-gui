import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { createService } from '../main/service.ts'
import { fileSettings } from './file-settings.ts'
import { browserOrigin, createBrowserServer } from './browser-server.ts'

// This test worker must not use a developer's Gerrit environment overrides.
for (const key of ['GERRIT_URL', 'GERRIT_USER', 'GERRIT_PASSWORD']) delete process.env[key]
const origin = 'http://localhost:18573'
const listen = (server: http.Server) => new Promise<number>(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as { port: number }).port)))
const close = (server: http.Server) => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()) })

async function fixture(t: { after: (fn: () => Promise<void>) => void }, approvedOrigin = origin) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gerrit-browser-api-'))
  const file = path.join(directory, 'settings.json')
  const outbound: string[] = []
  const store = fileSettings(file)
  await store.save({ ...await store.getStatus(), serverUrl: 'https://dummy-gerrit.invalid', username: 'audit-dummy', password: 'audit-dummy-password', projects: [], teams: [] })
  const service = createService(store, async (url) => {
    outbound.push(String(url))
    return new Response(")]}'\n" + JSON.stringify({ _account_id: 1, username: 'audit-dummy' }))
  })
  const { server, launchUrl } = createBrowserServer(service, approvedOrigin)
  const port = await listen(server)
  t.after(async () => { await close(server); await rm(directory, { recursive: true, force: true }) })
  type Headers = Record<string, string | undefined>
  function request(method = 'getSettings', body: string | Buffer = '[]', headers: Headers = {}, verb = 'POST') {
    const merged: Headers = { Host: new URL(approvedOrigin).host, Origin: approvedOrigin, 'Content-Type': 'application/json', 'Content-Length': String(Buffer.byteLength(body)), ...headers }
    const filtered = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== undefined))
    return new Promise<{ status: number; headers: http.IncomingHttpHeaders; body: string }>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port, path: '/api/' + method, method: verb, headers: filtered }, res => {
        let result = ''
        res.setEncoding('utf8').on('data', chunk => { result += chunk }).on('end', () => resolve({ status: res.statusCode!, headers: res.headers, body: result }))
      })
      req.on('error', reject)
      req.end(body)
    })
  }
  const key = new URL(launchUrl).hash.split('=')[1]!
  async function login() {
    const response = await request('session', JSON.stringify([key]))
    assert.equal(response.status, 200)
    return response.headers['set-cookie']![0]!.split(';')[0]!
  }
  return { request, login, key, file, outbound, store, port }
}

test('startup key is required, one-use, and never returned in API responses', async t => {
  const f = await fixture(t)
  assert.equal((await f.request()).status, 401)
  assert.equal((await f.request('session', '["wrong"]')).status, 401)
  assert.equal((await f.request('session', JSON.stringify([f.key]), { 'Content-Type': 'text/plain' })).status, 415)
  const loggedIn = await f.request('session', JSON.stringify([f.key]))
  assert.equal(loggedIn.status, 200)
  assert.equal(loggedIn.headers['cache-control'], 'no-store')
  assert.match(loggedIn.headers['set-cookie']![0]!, /Path=\/api\/; HttpOnly; SameSite=Strict$/)
  const Cookie = loggedIn.headers['set-cookie']![0]!.split(';')[0]!
  assert.equal((await f.request('session', JSON.stringify([f.key]))).status, 401)
  assert.equal((await f.request('getSettings', '[]', { Cookie })).status, 200)
  assert.equal((await f.request('getSettings', '[]', { Cookie: Cookie + 'x' })).status, 401)
  assert.equal((await f.request('getSettings', '[]', { Cookie: Cookie + '=extra' })).status, 401)
  assert.equal((await f.request('getSettings', '[]', { Cookie: Cookie + '; ' + Cookie })).status, 401)
  assert.ok(!loggedIn.body.includes(f.key))
  // Reopening the launch link in the already authorized profile is harmless.
  assert.equal((await f.request('session', JSON.stringify([f.key]), { Cookie })).status, 200)
})

test('foreign, missing, null, alternate-port and spoofed forwarding headers fail before bootstrap or dispatch', async t => {
  const f = await fixture(t)
  for (const headers of [
    { Origin: 'http://foreign.invalid' }, { Origin: undefined }, { Origin: 'null' },
    { Origin: origin + '/' }, { Origin: 'http://localhost:18574' },
    { Host: 'foreign.invalid' }, { Host: 'localhost:18574' }, { Host: 'localhost' },
    { Host: 'foreign.invalid', 'X-Forwarded-Host': 'localhost:18573' },
    { Origin: 'http://foreign.invalid', 'X-Forwarded-Origin': origin },
    { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' },
  ]) {
    const response = await f.request('session', JSON.stringify([f.key]), headers)
    assert.equal(response.status, 403, JSON.stringify(headers))
    assert.equal(response.headers['access-control-allow-origin'], undefined)
    assert.equal(response.headers['set-cookie'], undefined)
  }
  const Cookie = await f.login()
  assert.equal((await f.request('getSettings', '[]', { Cookie, Origin: 'http://foreign.invalid' })).status, 403)
  assert.equal((await f.request('getSettings', '[]', {}, 'OPTIONS')).status, 405)
  assert.equal((await f.request('getSettings', '[]', { Origin: 'http://foreign.invalid' }, 'OPTIONS')).status, 403)
})

test('JSON content type, encoding, syntax, array envelope and streaming size are checked', async t => {
  const f = await fixture(t)
  const Cookie = await f.login()
  for (const type of ['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data', 'text/json', 'application/json; charset=latin1', undefined]) {
    assert.equal((await f.request('saveSettings', '[]', { Cookie, 'Content-Type': type })).status, 415)
  }
  assert.equal((await f.request('getSettings', '[]', { Cookie, 'Content-Encoding': 'gzip' })).status, 415)
  for (const body of ['', '{', '{}', 'null', '"text"', '1']) {
    assert.equal((await f.request('saveSettings', body, { Cookie })).status, 400, body)
  }
  assert.equal((await f.request('saveSettings', '["' + 'x'.repeat(1024 * 1024) + '"]', { Cookie })).status, 413)
  assert.equal((await f.request('getSettings', '[]' + ' '.repeat(1024 * 1024 - 2), { Cookie })).status, 200)
  assert.equal((await f.request('saveSettings', Buffer.from([0x5b, 0x22, 0xff, 0x22, 0x5d]), { Cookie })).status, 400)
  assert.equal((await f.request('getSettings', '[]', { Cookie, 'Content-Type': 'application/json; charset=UTF-8' })).status, 200)
  for (const name of ['constructor', 'toString', '__proto__', 'getCredentials', 'getSettings?x=1']) {
    assert.equal((await f.request(name, '[]', { Cookie })).status, 404)
  }
  assert.equal(f.outbound.length, 0)
})

test('duplicate Host, Origin and Content-Type headers cannot bypass validation', async t => {
  const f = await fixture(t)
  const Cookie = await f.login()
  for (const [name, value, expected] of [
    ['Host', new URL(origin).host, 403], ['Origin', origin, 403], ['Content-Type', 'application/json', 415],
  ] as const) {
    const status = await new Promise<number>((resolve, reject) => {
      const req = http.request({ hostname: '127.0.0.1', port: f.port, path: '/api/getSettings', method: 'POST', headers: [
        'Host', new URL(origin).host, 'Origin', origin, 'Content-Type', 'application/json',
        'Cookie', Cookie, 'Content-Length', '2', name, value,
      ] }, res => { res.resume(); res.once('end', () => resolve(res.statusCode!)) })
      req.on('error', reject)
      req.end('[]')
    })
    assert.equal(status, expected, name)
  }
})

test('the audited two-request attack cannot change settings or send the saved dummy credential', async t => {
  const f = await fixture(t)
  const initial = await readFile(f.file, 'utf8')
  // HTTPS keeps the transport policy out of this access-control regression.
  const attack = JSON.stringify([{ serverUrl: 'https://attacker.invalid', username: 'audit-dummy', projects: [], teams: [] }])
  for (const headers of [
    { Origin: 'http://foreign.invalid', 'Content-Type': 'text/plain' },
    {}, // Even a caller that spoofs the approved Origin still needs a session.
  ]) {
    assert.ok([401, 403].includes((await f.request('saveSettings', attack, headers)).status))
    assert.ok([401, 403].includes((await f.request('testConnection', '[]', headers)).status))
  }
  const Cookie = await f.login()
  assert.equal((await f.request('saveSettings', attack, { Cookie, Origin: 'http://foreign.invalid', 'Content-Type': 'text/plain' })).status, 403)
  // A replacement dummy password must not make foreign-origin access succeed.
  const replacement = JSON.stringify([{ ...JSON.parse(attack)[0], password: 'replacement-dummy' }])
  assert.equal((await f.request('saveSettings', replacement, { Cookie, Origin: 'http://foreign.invalid' })).status, 403)
  assert.equal((await f.request('saveSettings', attack, { Cookie, 'Content-Type': 'text/plain' })).status, 415)
  assert.equal(await readFile(f.file, 'utf8'), initial)
  assert.deepEqual(f.outbound, [])
  // The actual Service and isolated file store still work for the browser.
  const status = await f.store.getStatus()
  assert.equal((await f.request('saveSettings', JSON.stringify([{ ...status, projects: ['demo'] }]), { Cookie })).status, 200)
  assert.deepEqual((await f.store.getStatus()).projects, ['demo'])
  assert.equal((await f.request('testConnection', '[]', { Cookie, 'Sec-Fetch-Site': 'same-origin' })).status, 200)
  assert.equal(f.outbound.length, 1)
})

test('authorized browser requests still enforce merged transport and credential identity policies', async t => {
  const f = await fixture(t)
  const Cookie = await f.login()
  const status = await f.store.getStatus()
  const initial = await readFile(f.file, 'utf8')
  for (const change of [
    { serverUrl: 'https://other-gerrit.invalid' }, { username: 'other-account' },
  ]) {
    const response = await f.request('saveSettings', JSON.stringify([{ ...status, ...change }]), { Cookie })
    assert.equal(response.status, 500)
    assert.match(response.body, /saved password cannot be reused/)
  }
  const insecure = await f.request('saveSettings', JSON.stringify([{ ...status, serverUrl: 'http://remote.invalid', password: 'replacement-dummy' }]), { Cookie })
  assert.equal(insecure.status, 500)
  assert.match(insecure.body, /requires HTTPS/)
  // Legacy on-disk HTTP is also refused before the mocked transport is called.
  const { writeFile } = await import('node:fs/promises')
  await writeFile(f.file, initial.replace('https://dummy-gerrit.invalid', 'http://dummy-gerrit.invalid'))
  const legacy = await f.request('testConnection', '[]', { Cookie })
  assert.equal(legacy.status, 500)
  assert.match(legacy.body, /requires HTTPS/)
  assert.deepEqual(f.outbound, [])
})

test('concurrent bootstrap requests can consume the startup key only once', async t => {
  const f = await fixture(t)
  const responses = await Promise.all([f.request('session', JSON.stringify([f.key])), f.request('session', JSON.stringify([f.key]))])
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 401])
})

test('HTTPS forwarding uses the explicit external Host and Secure cookie', async t => {
  const f = await fixture(t, 'https://forwarded.example.test')
  const response = await f.request('session', JSON.stringify([f.key]))
  assert.equal(response.status, 200)
  assert.match(response.headers['set-cookie']![0]!, /; Secure$/)
  assert.equal((await f.request('getSettings', '[]', { Host: '127.0.0.1:5174', 'X-Forwarded-Host': 'forwarded.example.test' })).status, 403)
})

test('session from a previous API process is invalid after restart', async t => {
  const first = await fixture(t)
  const Cookie = await first.login()
  const second = await fixture(t)
  assert.equal((await second.request('getSettings', '[]', { Cookie })).status, 401)
})

test('origin configuration rejects URLs with credentials, paths, queries or fragments', () => {
  for (const value of ['file:///tmp', 'http://user:password@localhost:5173', 'http://localhost:5173/path', 'http://localhost:5173/?q=1', 'http://localhost:5173/#x', 'null']) {
    assert.throws(() => browserOrigin(value), value)
  }
  assert.equal(browserOrigin(origin).origin, origin)
})


test('removed account diff preference methods cannot be called over the browser API', async t => {
  const f = await fixture(t)
  const Cookie = await f.login()
  for (const method of ['reviewDiffPreferences', 'saveReviewDiffPreferences']) {
    const response = await f.request(method, '[]', { Cookie })
    assert.equal(response.status, 404)
  }
  assert.deepEqual(f.outbound, [])
})
