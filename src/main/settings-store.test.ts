import { test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { settingsStore } from './settings-store.ts'
import type { SecretBackend } from './secret-storage.ts'
import { fileSettings } from '../server/file-settings.ts'

// A test key simulates the OS keychain. Production uses Electron safeStorage.
const key = randomBytes(32)
function backend(name = 'gnome_libsecret', available = true, platform: NodeJS.Platform = 'linux') {
  let failEncrypt = false, failDecrypt = false
  let encryptions = 0
  const value: SecretBackend = { platform, storage: {
    isEncryptionAvailable: () => available,
    getSelectedStorageBackend: () => name,
    encryptString(password) {
      encryptions++
      if (failEncrypt) throw new Error('keychain failed')
      const iv = randomBytes(12)
      const cipher = createCipheriv('aes-256-gcm', key, iv)
      const ciphertext = Buffer.concat([cipher.update(password, 'utf8'), cipher.final()])
      return Buffer.concat([iv, cipher.getAuthTag(), ciphertext])
    },
    decryptString(buffer) {
      if (failDecrypt) throw new Error('keychain locked')
      const cipher = createDecipheriv('aes-256-gcm', key, buffer.subarray(0, 12))
      cipher.setAuthTag(buffer.subarray(12, 28))
      return Buffer.concat([cipher.update(buffer.subarray(28)), cipher.final()]).toString('utf8')
    },
  } }
  return { value, encryptions: () => encryptions, failEncrypt: () => { failEncrypt = true }, failDecrypt: () => { failDecrypt = true } }
}

async function fixture(t: TestContext) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-secret-test-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  const disk = async () => JSON.parse(await fs.readFile(file, 'utf8'))
  const seed = async (extra = {}) => {
    await fs.writeFile(file, JSON.stringify({ serverUrl: 'https://gerrit.invalid', username: 'dummy', ...extra }), { mode: 0o644 })
    await fs.chmod(file, 0o644)
  }
  return { dir, file, disk, seed }
}


const A = { serverUrl: 'https://a.invalid/gerrit', username: 'alice' }
const B = { serverUrl: 'https://b.invalid/gerrit', username: 'bob' }
const assertRemoved = (stored: Record<string, unknown>) => {
  for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal(key in stored, false, key)
}

for (const name of ['basic_text', 'unknown', 'future-unknown-backend']) {
  test(`${name}: new passwords stay in bound memory across ordinary saves`, async t => {
    const { file, disk } = await fixture(t)
    const b = backend(name)
    const store = settingsStore(file, b.value)
    await store.save({ ...await store.getStatus(), ...A, password: 'dummy-session' })
    assert.deepEqual(await store.getCredentials(), { ...A, password: 'dummy-session' })
    await store.save(await store.getStatus())
    await store.saveUi({ compact: true })
    assertRemoved(await disk())
    assert.equal((await store.getStatus()).encrypted, false)
    assert.equal(b.encryptions(), 0)
    assert.equal(await settingsStore(file, b.value).getCredentials(), null)
  })
}

for (const mode of ['missing', 'throwing', 'encrypt-error']) {
  test(`${mode} keychain: legacy plaintext is removed automatically and stays in bound memory`, async t => {
    const { file, seed, disk } = await fixture(t)
    await seed({ ...A, password: 'dummy-A', team: ['alice'], ui: { compact: true } })
    const b = backend('gnome_libsecret', mode !== 'missing')
    if (mode === 'throwing') b.value.storage.isEncryptionAvailable = () => { throw Error('dummy unavailable') }
    if (mode === 'encrypt-error') b.failEncrypt()
    const store = settingsStore(file, b.value)
    assert.equal((await store.getStatus()).passwordStorage, 'session')
    assertRemoved(await disk())
    assert.deepEqual(await store.getCredentials(), { ...A, password: 'dummy-A' })
    assert.equal((await store.getStatus()).teams[0].members[0], 'alice')
    assert.equal((await store.getUi()).compact, true)
    // POSIX mode bits are not Windows ACLs; keep all content/binding checks on Windows.
    if (process.platform !== 'win32') assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
    const rename = t.mock.method(fs, 'rename')
    await store.getStatus(); await store.getCredentials(); await store.getUi()
    assert.equal(rename.mock.callCount(), 0, 'cleanup is idempotent')
    assert.equal(await settingsStore(file, b.value).getCredentials(), null)
  })
}

for (const platform of ['linux', 'darwin', 'win32'] as const) {
  test(`${platform}: trusted keychain saves and migrates legacy secrets across restart`, async t => {
    const { file, seed, disk } = await fixture(t)
    const b = backend('gnome_libsecret', true, platform)
    await seed({ ...A, password: 'dummy-legacy' })
    const store = settingsStore(file, b.value)
    assert.equal((await store.getStatus()).passwordStorage, 'secure')
    assert.equal((await disk()).passwordEncrypted, true)
    assert.equal((await disk()).passwordStorageVersion, 1)
    assert.deepEqual((await disk()).passwordIdentity, A)
    assert.equal(JSON.stringify(await disk()).includes('dummy-legacy'), false)
    assert.equal((await settingsStore(file, b.value).getCredentials())?.password, 'dummy-legacy')
    await store.save({ ...await store.getStatus(), ...B, password: 'dummy-secure-B' })
    assert.deepEqual(await settingsStore(file, b.value).getCredentials(), { ...B, password: 'dummy-secure-B' })
  })
}

test('readable old ciphertext migrates to trusted encryption without changing its original binding', async t => {
  const { file, seed, disk } = await fixture(t)
  const b = backend()
  const cipher = b.value.storage.encryptString('dummy-A').toString('base64')
  await seed({ ...B, password: cipher, passwordEncrypted: true, passwordIdentity: A })
  const store = settingsStore(file, b.value)
  assert.equal(await store.getCredentials(), null)
  assert.equal((await disk()).passwordStorageVersion, 1)
  assert.deepEqual((await disk()).passwordIdentity, A)
  assert.notEqual((await disk()).password, cipher)
})

test('realistic basic_text legacy ciphertext is removed on load, without a new encryption call', async t => {
  const { file, seed, disk } = await fixture(t)
  const b = backend('basic_text')
  await seed({ ...A, password: b.value.storage.encryptString('dummy-basic').toString('base64'), passwordEncrypted: true })
  const store = settingsStore(file, b.value)
  assert.equal((await store.getStatus()).passwordStorage, 'session')
  assertRemoved(await disk())
  assert.equal((await store.getCredentials())?.password, 'dummy-basic')
  assert.equal(b.encryptions(), 1, 'only the fixture seed encrypted data')
  assert.equal(await settingsStore(file, b.value).getCredentials(), null)
})

for (const kind of ['plaintext', 'old-ciphertext', 'unreadable']) {
  test(`${kind}: cleanup beside B settings never binds the old A password to B`, async t => {
    const { file, seed, disk } = await fixture(t)
    const b = backend()
    const password = kind === 'plaintext' ? 'dummy-A' : b.value.storage.encryptString('dummy-A').toString('base64')
    b.failEncrypt()
    if (kind === 'unreadable') b.failDecrypt()
    await seed({ ...B, password, passwordEncrypted: kind !== 'plaintext', passwordIdentity: A })
    const store = settingsStore(file, b.value)
    assert.equal((await store.getStatus()).hasPassword, false)
    assert.equal(await store.getCredentials(), null)
    assertRemoved(await disk())
    await fs.writeFile(file, JSON.stringify({ ...await disk(), ...A }))
    assert.equal((await store.getCredentials())?.password, kind === 'unreadable' ? undefined : 'dummy-A', 'a readable memory copy keeps A identity')
    assert.equal(await settingsStore(file, b.value).getCredentials(), null)
  })
}

for (const mode of ['missing', 'decrypt-error']) {
  test(`${mode}: unreadable unversioned ciphertext is removed and requires re-entry`, async t => {
    const { file, seed, disk } = await fixture(t)
    await seed({ ...A, password: 'dummy-unreadable', passwordEncrypted: true })
    const b = backend('gnome_libsecret', mode !== 'missing'); b.failDecrypt()
    const store = settingsStore(file, b.value)
    assert.equal((await store.getStatus()).hasPassword, false)
    assert.equal((await store.getStatus()).passwordStorage, 'none')
    assertRemoved(await disk())
    assert.equal(await store.getCredentials(), null)
    b.failEncrypt()
    await store.save({ ...await store.getStatus(), password: 'dummy-reentered' })
    assert.equal((await store.getCredentials())?.password, 'dummy-reentered')
  })
}

test('a version marker on plaintext does not exempt it from cleanup', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ ...A, password: 'dummy-plaintext', passwordEncrypted: false, passwordStorageVersion: 1 })
  const store = settingsStore(file)
  assert.equal((await store.getCredentials())?.password, 'dummy-plaintext')
  assertRemoved(await disk())
})

for (const failure of ['unavailable', 'encrypt-error', 'locked']) {
  test(`trusted versioned ciphertext is kept under ${failure}, including a B session replacement`, async t => {
    const { file, seed, disk } = await fixture(t)
    const b = backend()
    const ciphertext = b.value.storage.encryptString('dummy-trusted-A').toString('base64')
    await seed({ ...A, password: ciphertext, passwordEncrypted: true, passwordStorageVersion: 1 })
    if (failure === 'unavailable') b.value.storage.isEncryptionAvailable = () => false
    else b.failEncrypt()
    if (failure === 'locked') b.failDecrypt()
    const store = settingsStore(file, b.value)
    const before = await store.getStatus()
    assert.equal((await disk()).password, ciphertext)
    assert.deepEqual((await disk()).passwordIdentity, A)
    await assert.rejects(store.save({ ...before, ...B, password: '' }), /Enter an HTTP password/)
    await store.save({ ...before, ...B, password: 'dummy-B' })
    await store.saveUi({ compact: true })
    assert.deepEqual(await store.getCredentials(), { ...B, password: 'dummy-B' })
    assert.equal((await disk()).password, ciphertext)
    assert.deepEqual((await disk()).passwordIdentity, A)
    assert.equal((await store.getStatus()).retainedPasswordStored, true)
    assert.equal(await settingsStore(file, b.value).getCredentials(), null)
  })
}

for (const operation of ['status', 'credentials', 'ui', 'save-ui', 'save'] as const) {
  test(`failed automatic cleanup through ${operation} leaves the old file intact and commits no memory`, async t => {
    const { file, seed, disk, dir } = await fixture(t)
    await seed({ ...A, password: 'dummy-A' })
    const original = await fs.readFile(file, 'utf8')
    const store = settingsStore(file)
    t.mock.method(fs, 'rename', async () => { throw Error('dummy replacement denied') })
    const call = () => operation === 'status' ? store.getStatus() : operation === 'credentials' ? store.getCredentials() : operation === 'ui' ? store.getUi() : operation === 'save-ui' ? store.saveUi({ compact: true }) : store.save({ serverUrl: A.serverUrl, username: A.username, projects: [], teams: [], password: 'dummy-new' } as never)
    await assert.rejects(call(), /dummy replacement denied/)
    assert.equal(await fs.readFile(file, 'utf8'), original)
    assert.deepEqual(await fs.readdir(dir), ['settings.json'])
    t.mock.restoreAll()
    await fs.writeFile(file, JSON.stringify(A))
    assert.equal(await store.getCredentials(), null, 'failed cleanup did not cache the removed fixture secret')
    await seed({ ...A, password: 'dummy-A' })
    assert.equal((await store.getCredentials())?.password, 'dummy-A', 'retry after failure succeeds')
    assertRemoved(await disk())
  })
}

test('failed cleanup cannot replace an existing B memory secret or change its binding', async t => {
  const { file, seed, disk } = await fixture(t)
  const store = settingsStore(file)
  await store.save({ ...await store.getStatus(), ...B, password: 'dummy-B' })
  await seed({ ...B, password: 'dummy-A', passwordIdentity: A })
  const before = await fs.readFile(file, 'utf8')
  t.mock.method(fs, 'rename', async () => { throw Error('dummy replacement denied') })
  await assert.rejects(store.getStatus(), /dummy replacement denied/)
  assert.equal(await fs.readFile(file, 'utf8'), before)
  t.mock.restoreAll()
  assert.deepEqual(await store.getCredentials(), { ...B, password: 'dummy-B' })
  assertRemoved(await disk())
  await assert.rejects(store.save({ ...await store.getStatus(), ...A, password: '' }), /Enter an HTTP password/)
})

for (const secure of [false, true]) {
  test(`failed save keeps the previous identity and memory/secure secret (secure=${secure})`, async t => {
    const { file } = await fixture(t)
    const store = settingsStore(file, secure ? backend().value : undefined)
    await store.save({ ...await store.getStatus(), ...A, password: 'dummy-A' })
    const before = await fs.readFile(file, 'utf8')
    t.mock.method(fs, 'rename', async () => { throw Error('dummy write failure') })
    await assert.rejects(store.save({ ...await store.getStatus(), ...B, password: 'dummy-B' }), /dummy write failure/)
    assert.equal(await fs.readFile(file, 'utf8'), before)
    assert.deepEqual(await store.getCredentials(), { ...A, password: 'dummy-A' })
  })
}

for (const provider of [undefined, backend().value, backend('basic_text').value]) {
  test(`blank identity edits are blocked for every usable secret (${provider?.storage.getSelectedStorageBackend?.() ?? 'browser'})`, async t => {
    const { file } = await fixture(t)
    const store = settingsStore(file, provider)
    await store.save({ ...await store.getStatus(), ...A, password: 'dummy-A' })
    for (const change of [B, { serverUrl: 'https://a.invalid:444' }, { username: 'ALICE' }, { username: 'bob' }]) {
      await assert.rejects(store.save({ ...await store.getStatus(), ...change, password: '' }), /Enter an HTTP password/)
      assert.deepEqual(await store.getCredentials(), { ...A, password: 'dummy-A' })
    }
    await assert.rejects(store.save({ ...await store.getStatus(), serverUrl: 'http://a.invalid', password: '' }), /requires HTTPS/)
    await store.save({ ...await store.getStatus(), serverUrl: 'https://A.invalid:443/other', username: ' alice ', password: '' })
    assert.equal((await store.getCredentials())?.serverUrl, 'https://a.invalid/other')
  })
}

test('startup environment snapshots stay bound while legacy cleanup removes the file password', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ ...A, password: 'dummy-A' })
  const env = { GERRIT_URL: '', GERRIT_USER: '', GERRIT_PASSWORD: 'dummy-env-A' }
  const store = fileSettings(file, env)
  assert.deepEqual(await store.getCredentials(), { ...A, password: 'dummy-env-A' })
  assertRemoved(await disk())
  env.GERRIT_URL = B.serverUrl; env.GERRIT_USER = B.username; env.GERRIT_PASSWORD = 'dummy-mutated'
  assert.deepEqual(await store.getCredentials(), { ...A, password: 'dummy-env-A' })
  for (const password of ['', 'dummy-B']) await assert.rejects(store.save({ ...await store.getStatus(), ...B, password }), /set by GERRIT_PASSWORD/)
  await store.save(await store.getStatus())
  assertRemoved(await disk())
  await fs.writeFile(file, JSON.stringify({ ...await disk(), ...B }))
  assert.equal(await store.getCredentials(), null)
  assert.equal(await fileSettings(file, {}).getCredentials(), null)
})

test('partial environment overrides cannot adopt cleaned A memory under B identity', async t => {
  const { file, seed, disk } = await fixture(t)
  for (const env of [{ GERRIT_URL: B.serverUrl }, { GERRIT_USER: B.username }]) {
    await seed({ ...A, password: 'dummy-A' })
    const store = fileSettings(file, env)
    assert.equal(await store.getCredentials(), null)
    assert.equal((await store.getStatus()).hasPassword, false)
    assertRemoved(await disk())
  }
})

test('invalid legacy transport remains visible but is rejected before credential decryption/migration', async t => {
  const { file, seed } = await fixture(t)
  await seed({ serverUrl: 'http://remote.invalid', username: 'dummy', password: 'dummy-cipher', passwordEncrypted: true })
  const b = backend()
  let decryptions = 0
  b.value.storage.decryptString = () => { decryptions++; return 'dummy-plain' }
  const store = settingsStore(file, b.value)
  const before = await fs.readFile(file, 'utf8')
  await assert.rejects(store.getCredentials(), /requires HTTPS/)
  assert.equal(decryptions, 0)
  assert.equal(b.encryptions(), 0)
  assert.equal(await fs.readFile(file, 'utf8'), before)
  assert.equal((await store.getStatus()).serverUrl, 'http://remote.invalid')
})

test('malformed settings are kept and errors never include password contents', async t => {
  const { file } = await fixture(t)
  const value = '{"password":"dummy-sensitive" broken}'
  await fs.writeFile(file, value)
  const store = settingsStore(file)
  await assert.rejects(store.getStatus(), e => e instanceof SyntaxError && !e.message.includes('dummy-sensitive'))
  assert.equal(await fs.readFile(file, 'utf8'), value)
})

test('concurrent reads clean only once and concurrent settings/UI saves preserve both outcomes', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ ...A, password: 'dummy-A' })
  const store = settingsStore(file)
  const rename = t.mock.method(fs, 'rename')
  await Promise.all([store.getStatus(), store.getCredentials(), store.getUi()])
  assert.equal(rename.mock.callCount(), 1)
  await Promise.all([store.save({ ...await store.getStatus(), password: 'dummy-new' }), store.saveUi({ compact: true })])
  assertRemoved(await disk())
  assert.equal((await store.getCredentials())?.password, 'dummy-new')
  assert.equal((await store.getUi()).compact, true)
})

for (const kind of ['plaintext', 'old-ciphertext', 'unreadable', 'trusted-locked']) {
  test(`separate Node processes cannot return/send cleaned or retained ${kind} A credentials for B`, async t => {
    const { file, seed, disk } = await fixture(t)
    await seed({ ...A, password: kind === 'plaintext' ? 'dummy-A' : Buffer.from('dummy-cipher:dummy-A').toString('base64'), passwordEncrypted: kind !== 'plaintext', passwordStorageVersion: kind === 'trusted-locked' ? 1 : undefined })
    const module = new URL('./settings-store.ts', import.meta.url).href
    const service = new URL('./service.ts', import.meta.url).href
    const provider = `{platform:'linux',storage:{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:()=>{throw Error('dummy failed keychain')},decryptString:b=>{${['unreadable', 'trusted-locked'].includes(kind) ? "throw Error('dummy locked')" : "return b.toString().slice('dummy-cipher:'.length)"}}}}`
    const run = (body: string) => execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `import assert from 'node:assert/strict'; import {settingsStore} from ${JSON.stringify(module)}; import {createService} from ${JSON.stringify(service)}; const store=settingsStore(${JSON.stringify(file)},${provider}); ${body}`], { encoding: 'utf8' }).trim()
    run(`await store.save({...await store.getStatus(),...${JSON.stringify(B)},password:'dummy-B'}); assert.equal((await store.getCredentials()).password,'dummy-B');`)
    if (kind === 'trusted-locked') assert.deepEqual((await disk()).passwordIdentity, A)
    else assertRemoved(await disk())
    run(`assert.equal(await store.getCredentials(),null); let sent=0; await assert.rejects(createService(store,async()=>{sent++;return new Response('{}')}).testConnection(),/not configured/); assert.equal(sent,0);`)
  })
}
