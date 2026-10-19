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

for (const name of ['basic_text', 'unknown', 'future-unknown-backend']) {
  test(`Linux ${name} keeps new passwords only in memory across saves`, async t => {
    const { file, disk } = await fixture(t)
    const b = backend(name)
    const store = settingsStore(file, b.value)
    await store.save({ ...await store.getStatus(), serverUrl: 'https://gerrit.invalid', username: 'dummy', password: 'dummy-session' })
    assert.equal((await store.getCredentials())?.password, 'dummy-session')
    assert.equal((await store.getStatus()).encrypted, false)
    assert.equal((await store.getStatus()).passwordStorage, 'session')
    await store.save(await store.getStatus())
    await store.saveUi({ compact: true })
    assert.equal((await disk()).password, undefined)
    assert.equal(b.encryptions(), 0)
    assert.equal(await settingsStore(file, b.value).getCredentials(), null)
  })
}

test('unavailable and throwing availability checks keep new passwords in memory', async t => {
  const { file, disk } = await fixture(t)
  const b = backend('gnome_libsecret', false)
  b.value.storage.getSelectedStorageBackend = () => { throw new Error('not ready') }
  for (const throws of [false, true]) {
    if (throws) b.value.storage.isEncryptionAvailable = () => { throw new Error('not ready') }
    const store = settingsStore(file, b.value)
    await store.save({ ...await store.getStatus(), serverUrl: 'https://gerrit.invalid', username: 'dummy', password: 'dummy-unavailable' })
    assert.equal((await store.getStatus()).passwordStorage, 'session')
    assert.equal((await disk()).password, undefined)
  }
})

for (const platform of ['linux', 'darwin', 'win32'] as const) {
  test(`${platform} secure persistence survives a new store instance`, async t => {
    const { file, disk } = await fixture(t)
    const b = backend('gnome_libsecret', true, platform)
    const store = settingsStore(file, b.value)
    await store.save({ ...await store.getStatus(), serverUrl: 'https://gerrit.invalid', username: 'dummy', password: 'dummy-secure' })
    const saved = await disk()
    assert.equal(saved.passwordEncrypted, true)
    assert.equal(saved.passwordStorageVersion, 1)
    assert.equal(JSON.stringify(saved).includes('dummy-secure'), false)
    const restarted = settingsStore(file, b.value)
    assert.equal((await restarted.getCredentials())?.password, 'dummy-secure')
    assert.equal((await restarted.getStatus()).passwordStorage, 'secure')
  })
}

test('plaintext legacy migrates on read and existing 0644 file becomes 0600', async t => {
  const { file, disk, seed } = await fixture(t)
  await seed({ password: 'dummy-legacy', ui: { compact: true } })
  const b = backend()
  const store = settingsStore(file, b.value)
  const status = await store.getStatus()
  assert.equal(status.legacyPasswordStored, false)
  assert.equal(status.passwordStorage, 'secure')
  assert.equal((await disk()).passwordEncrypted, true)
  assert.equal((await disk()).ui.compact, true)
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  assert.equal((await settingsStore(file, b.value).getCredentials())?.password, 'dummy-legacy')
})

test('old ciphertext upgrades only after successful decryption and encryption', async t => {
  const { file, seed, disk } = await fixture(t)
  const b = backend()
  const old = b.value.storage.encryptString('dummy-old-cipher').toString('base64')
  await seed({ password: old, passwordEncrypted: true })
  assert.equal((await settingsStore(file, b.value).getCredentials())?.password, 'dummy-old-cipher')
  assert.equal((await disk()).passwordStorageVersion, 1)
  assert.notEqual((await disk()).password, old)
})

for (const browser of [false, true]) {
  test(`${browser ? 'browser' : 'basic_text'} legacy is kept until explicit removal; restart then needs a password`, async t => {
    const { file, seed, disk } = await fixture(t)
    await seed({ password: 'dummy-old-plaintext', team: ['alice'] })
    const make = () => browser ? fileSettings(file, {}) : settingsStore(file, backend('basic_text').value)
    const store = make()
    assert.equal((await store.getStatus()).legacyPasswordStored, true)
    assert.equal((await store.getCredentials())?.password, 'dummy-old-plaintext')
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
    await store.save({ ...await store.getStatus(), password: 'dummy-new-session' })
    assert.equal((await disk()).password, 'dummy-old-plaintext')
    assert.equal((await store.getCredentials())?.password, 'dummy-new-session')
    assert.equal((await make().getCredentials())?.password, 'dummy-old-plaintext')
    await store.save({ ...await store.getStatus(), removeLegacyPassword: true })
    assert.equal((await disk()).password, undefined)
    assert.equal((await store.getCredentials())?.password, 'dummy-new-session')
    assert.equal(await make().getCredentials(), null)
    assert.equal((await store.getStatus()).legacyPasswordStored, false)
    assert.equal((await store.getStatus()).teams[0].members[0], 'alice')
  })
}

test('explicit legacy removal keeps the loaded password in memory without re-entry', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ password: 'dummy-keep-in-memory' })
  const store = settingsStore(file)
  await store.save({ ...await store.getStatus(), removeLegacyPassword: true })
  assert.equal((await disk()).password, undefined)
  assert.equal((await store.getCredentials())?.password, 'dummy-keep-in-memory')
})

test('legacy basic_text ciphertext can be used and explicitly removed, never written again', async t => {
  const { file, seed, disk } = await fixture(t)
  const b = backend('basic_text')
  await seed({ password: b.value.storage.encryptString('dummy-basic-old').toString('base64'), passwordEncrypted: true })
  const store = settingsStore(file, b.value)
  assert.equal((await store.getStatus()).legacyPasswordStored, true)
  await store.save({ ...await store.getStatus(), removeLegacyPassword: true })
  assert.equal((await store.getCredentials())?.password, 'dummy-basic-old')
  assert.equal((await disk()).password, undefined)
  assert.equal(b.encryptions(), 1)
})

test('locked ciphertext survives reads, ordinary saves, UI saves and insecure replacement', async t => {
  const { file, seed, disk } = await fixture(t)
  const ciphertext = 'unreadable-dummy-ciphertext'
  await seed({ password: ciphertext, passwordEncrypted: true, passwordStorageVersion: 1 })
  const store = settingsStore(file, backend('basic_text').value)
  assert.equal((await store.getStatus()).passwordStorage, 'locked')
  assert.equal((await store.getStatus()).hasPassword, false)
  assert.equal(await store.getCredentials(), null)
  await store.save({ ...await store.getStatus(), password: 'dummy-session', removeLegacyPassword: true })
  await store.saveUi({ compact: true })
  assert.equal((await disk()).password, ciphertext)
  assert.equal((await store.getCredentials())?.password, 'dummy-session')
})

test('keychain encryption failure preserves legacy and keeps replacement in memory', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ password: 'dummy-legacy-retained' })
  const b = backend(); b.failEncrypt()
  const store = settingsStore(file, b.value)
  assert.equal((await store.getStatus()).legacyPasswordStored, true)
  await store.save({ ...await store.getStatus(), password: 'dummy-failed-encrypt' })
  assert.equal((await disk()).password, 'dummy-legacy-retained')
  assert.equal((await store.getStatus()).passwordStorage, 'session')
  assert.equal((await store.getCredentials())?.password, 'dummy-failed-encrypt')
})

test('decryption failure preserves the exact ciphertext', async t => {
  const { file, seed, disk } = await fixture(t)
  const b = backend(); b.failDecrypt()
  await seed({ password: 'dummy-ciphertext', passwordEncrypted: true })
  const store = settingsStore(file, b.value)
  assert.equal((await store.getStatus()).passwordStorage, 'locked')
  await store.save(await store.getStatus())
  assert.equal((await disk()).password, 'dummy-ciphertext')
})

test('environment overrides never persist, including on ordinary settings saves', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ password: 'dummy-disk' })
  const env = { GERRIT_URL: 'https://override.invalid', GERRIT_USER: 'environment-user', GERRIT_PASSWORD: 'dummy-env' }
  const store = settingsStore(file, undefined, env)
  assert.equal((await store.getCredentials())?.password, 'dummy-env')
  assert.equal((await store.getStatus()).passwordStorage, 'environment')
  await store.save({ ...await store.getStatus(), removeLegacyPassword: true })
  assert.equal((await disk()).password, undefined)
  assert.equal(JSON.stringify(await disk()).includes('dummy-env'), false)
  delete (env as Partial<typeof env>).GERRIT_PASSWORD
  assert.equal((await store.getCredentials())?.password, 'dummy-env', 'environment is a startup snapshot')
  assert.equal(await settingsStore(file).getCredentials(), null, 'explicit removal did not copy the environment secret to disk')
})

test('all desktop/browser save paths repair an existing 0644 file', async t => {
  const { file, seed } = await fixture(t)
  for (const make of [() => settingsStore(file), () => fileSettings(file, {})]) {
    await seed()
    const store = make()
    const input = await store.getStatus()
    await fs.chmod(file, 0o644)
    await store.save(input)
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
  }
  await seed()
  await settingsStore(file).saveUi({ compact: true })
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
})

test('malformed files are not silently replaced, and failed saves do not commit memory', async t => {
  const { file, dir } = await fixture(t)
  await fs.writeFile(file, '{broken-dummy')
  const store = settingsStore(file)
  await assert.rejects(store.getStatus(), SyntaxError)
  await assert.rejects(store.save({ serverUrl: 'https://gerrit.invalid', username: 'dummy', password: 'dummy-failed' } as never), SyntaxError)
  assert.equal(await fs.readFile(file, 'utf8'), '{broken-dummy')
  await fs.rm(file)
  const input = { ...await store.getStatus(), password: 'dummy-failed' }
  // A directory at the target makes the read fail before any secret is committed.
  await fs.mkdir(file)
  await assert.rejects(store.save(input))
  await fs.rm(file, { recursive: true })
  assert.equal((await store.getStatus()).hasPassword, false)
  assert.deepEqual(await fs.readdir(dir), [])
})

test('concurrent settings and UI saves preserve each other', async t => {
  const { file } = await fixture(t)
  const store = settingsStore(file, backend().value)
  const initial = await store.getStatus()
  await Promise.all([
    store.save({ ...initial, serverUrl: 'https://gerrit.invalid', username: 'dummy', password: 'dummy-parallel' }),
    store.saveUi({ compact: true }),
  ])
  assert.equal((await store.getCredentials())?.password, 'dummy-parallel')
  assert.equal((await store.getUi()).compact, true)
})

test('browser password disappears after an actual Node process restart', async t => {
  const { file, disk } = await fixture(t)
  const module = new URL('../server/file-settings.ts', import.meta.url).href
  const run = (body: string) => execFileSync(process.execPath, ['--input-type=module', '-e', `import {fileSettings} from ${JSON.stringify(module)}; const store = fileSettings(${JSON.stringify(file)}); ${body}`], {
    encoding: 'utf8', env: { ...process.env, GERRIT_URL: '', GERRIT_USER: '', GERRIT_PASSWORD: '' },
  }).trim()
  assert.equal(run(`await store.save({...await store.getStatus(),serverUrl:'https://gerrit.invalid',username:'dummy',password:'dummy-process'});console.log((await store.getCredentials()).password)`), 'dummy-process')
  assert.equal((await disk()).password, undefined)
  assert.equal(run('console.log(await store.getCredentials())'), 'null')
})

const identityA = { serverUrl: 'https://a.invalid/gerrit', username: 'alice' }
const identityB = { serverUrl: 'https://b.invalid/gerrit', username: 'bob' }

for (const storage of ['plaintext', 'old-ciphertext', 'secure', 'locked'] as const) {
  for (const failure of ['unavailable', 'encrypt-error'] as const) {
    test(`${storage}/${failure}: retained A stays bound when B gets a session replacement`, async t => {
      const { file, seed, disk } = await fixture(t)
      const b = backend()
      const original = storage === 'plaintext' ? 'dummy-A' : b.value.storage.encryptString('dummy-A').toString('base64')
      await seed({ ...identityA, password: original, passwordEncrypted: storage !== 'plaintext', passwordStorageVersion: ['secure', 'locked'].includes(storage) ? 1 : undefined })
      if (storage === 'locked') b.failDecrypt()
      if (failure === 'unavailable') b.value.storage.isEncryptionAvailable = () => false
      else b.failEncrypt()
      const store = settingsStore(file, b.value)
      const before = await store.getStatus()
      // Locked data is retained too; it must never authorize an identity edit.
      await assert.rejects(store.save({ ...before, ...identityB, password: '' }), /Enter an HTTP password/)
      await store.save({ ...before, ...identityB, password: 'dummy-B' })
      assert.deepEqual(await store.getCredentials(), { ...identityB, password: 'dummy-B' })
      assert.deepEqual((await disk()).passwordIdentity, identityA)
      assert.equal((await disk()).password, original, 'retained ciphertext/plaintext is not overwritten or relabelled')
      assert.equal((await store.getStatus()).retainedPasswordStored, true)
      await store.save(await store.getStatus())
      await store.saveUi({ compact: true })
      assert.deepEqual((await disk()).passwordIdentity, identityA)
      const restarted = settingsStore(file, b.value)
      assert.equal(await restarted.getCredentials(), null)
      assert.equal((await restarted.getStatus()).hasPassword, false)
      let sent = 0
      const { createService } = await import('./service.ts')
      await assert.rejects(createService(restarted, async () => { sent++; return new Response('{}') }).testConnection(), /not configured/)
      assert.equal(sent, 0, 'A secret never reaches B after restart')
      // Restoring the identity can recover the retained copy if it is readable.
      const retained = await disk()
      await fs.writeFile(file, JSON.stringify({ ...retained, ...identityA }))
      const recovered = await settingsStore(file, b.value).getCredentials()
      if (storage === 'plaintext' || failure === 'encrypt-error' && storage !== 'locked') assert.equal(recovered?.password, 'dummy-A')
      else assert.equal(recovered, null)
    })
  }
}

for (const b of [undefined, backend().value, backend('basic_text').value]) {
  test(`memory/secure binding rejects blank origin, port, scheme and account edits (${b?.storage.getSelectedStorageBackend?.() ?? 'browser'})`, async t => {
    const { file } = await fixture(t)
    const store = settingsStore(file, b)
    await store.save({ ...await store.getStatus(), ...identityA, password: 'dummy-A' })
    for (const change of [{ serverUrl: 'https://b.invalid' }, { serverUrl: 'https://a.invalid:444' }, { username: 'ALICE' }, { username: 'bob' }]) {
      await assert.rejects(store.save({ ...await store.getStatus(), ...change, password: '' }), /Enter an HTTP password/)
      assert.deepEqual(await store.getCredentials(), { ...identityA, password: 'dummy-A' })
    }
    await assert.rejects(store.save({ ...await store.getStatus(), serverUrl: 'http://a.invalid', password: '' }), /requires HTTPS/)
    await store.save({ ...await store.getStatus(), serverUrl: 'https://A.invalid:443/other', username: ' alice ', password: '' })
    assert.deepEqual(await store.getCredentials(), { ...identityA, serverUrl: 'https://a.invalid/other', password: 'dummy-A' })
  })
}

for (const secure of [false, true]) {
  test(`failed write cannot commit a new identity or secret (secure=${secure})`, async t => {
    const { file, seed } = await fixture(t)
    await seed({ ...identityA, password: 'dummy-old-A' })
    const store = settingsStore(file, secure ? backend().value : undefined)
    const initial = await store.getStatus()
    const before = await fs.readFile(file, 'utf8')
    t.mock.method(fs, 'rename', async () => { throw new Error('dummy rename failure') })
    await assert.rejects(store.save({ ...initial, ...identityB, password: 'dummy-B' }), /dummy rename failure/)
    assert.equal(await fs.readFile(file, 'utf8'), before)
    assert.deepEqual(await store.getCredentials(), { ...identityA, password: 'dummy-old-A' })
    t.mock.restoreAll()
    assert.deepEqual(await settingsStore(file, secure ? backend().value : undefined).getCredentials(), { ...identityA, password: 'dummy-old-A' })
  })
}

test('startup environment snapshot stays bound even if the supplied object, file, or process environment changes', async t => {
  const { file, seed, disk } = await fixture(t)
  await seed({ ...identityA, password: 'dummy-A' })
  const env = { GERRIT_PASSWORD: 'dummy-env-A', GERRIT_URL: '', GERRIT_USER: '' }
  const store = fileSettings(file, env)
  assert.deepEqual(await store.getCredentials(), { ...identityA, password: 'dummy-env-A' })
  env.GERRIT_PASSWORD = 'dummy-mutated'
  env.GERRIT_URL = identityB.serverUrl
  env.GERRIT_USER = identityB.username
  assert.deepEqual(await store.getCredentials(), { ...identityA, password: 'dummy-env-A' })
  for (const password of ['', 'dummy-B']) await assert.rejects(store.save({ ...await store.getStatus(), ...identityB, password }), /set by GERRIT_PASSWORD/)
  await store.save({ ...await store.getStatus() })
  assert.equal(JSON.stringify(await disk()).includes('dummy-env'), false)
  await fs.writeFile(file, JSON.stringify({ ...await disk(), ...identityB }))
  assert.equal(await store.getCredentials(), null)
  assert.equal((await store.getStatus()).hasPassword, false)
})

for (const kind of ['plaintext', 'encrypted', 'locked']) {
  test(`separate Node processes cannot return/send retained ${kind} A credentials for B`, async t => {
    const { file, seed, disk } = await fixture(t)
    const encrypted = kind !== 'plaintext'
    await seed({ ...identityA, password: encrypted ? Buffer.from('dummy-cipher:dummy-A').toString('base64') : 'dummy-A', passwordEncrypted: encrypted, passwordStorageVersion: encrypted ? 1 : undefined })
    const module = new URL('./settings-store.ts', import.meta.url).href
    const service = new URL('./service.ts', import.meta.url).href
    const provider = `{platform:'linux',storage:{isEncryptionAvailable:()=>true,getSelectedStorageBackend:()=> 'gnome_libsecret',encryptString:()=>{throw Error('dummy failed keychain')},decryptString:b=>{${kind === 'locked' ? "throw Error('dummy locked')" : "return b.toString().slice('dummy-cipher:'.length)"}}}}`
    const run = (body: string) => execFileSync(process.execPath, ['--no-warnings', '--input-type=module', '-e', `import assert from 'node:assert/strict'; import {settingsStore} from ${JSON.stringify(module)}; import {createService} from ${JSON.stringify(service)}; const store=settingsStore(${JSON.stringify(file)},${provider}); ${body}`], { encoding: 'utf8' }).trim()
    run(`await store.save({...await store.getStatus(),...${JSON.stringify(identityB)},password:'dummy-B'}); assert.equal((await store.getCredentials()).password,'dummy-B');`)
    assert.deepEqual((await disk()).passwordIdentity, identityA)
    run(`assert.equal(await store.getCredentials(),null); let sent=0; await assert.rejects(createService(store,async()=>{sent++;return new Response('{}')}).testConnection(),/not configured/); assert.equal(sent,0);`)
  })
}

test('failed rename keeps the previous memory password and its identity', async t => {
  const { file } = await fixture(t)
  const store = settingsStore(file)
  await store.save({ ...await store.getStatus(), ...identityA, password: 'dummy-memory-A' })
  const before = await fs.readFile(file, 'utf8')
  t.mock.method(fs, 'rename', async () => { throw new Error('dummy memory write failure') })
  await assert.rejects(store.save({ ...await store.getStatus(), ...identityB, password: 'dummy-memory-B' }), /dummy memory write failure/)
  assert.equal(await fs.readFile(file, 'utf8'), before)
  assert.deepEqual(await store.getCredentials(), { ...identityA, password: 'dummy-memory-A' })
  t.mock.restoreAll()
  await assert.rejects(store.save({ ...await store.getStatus(), ...identityB, password: '' }), /Enter an HTTP password/)
  assert.equal(await settingsStore(file).getCredentials(), null)
})

test('an external identity edit cannot move an existing memory password', async t => {
  const { file, disk } = await fixture(t)
  const store = settingsStore(file)
  await store.save({ ...await store.getStatus(), ...identityA, password: 'dummy-memory-A' })
  await fs.writeFile(file, JSON.stringify({ ...await disk(), ...identityB }))
  assert.equal(await store.getCredentials(), null)
  assert.equal((await store.getStatus()).hasPassword, false)
  const { createService } = await import('./service.ts')
  let sent = 0
  await assert.rejects(createService(store, async () => { sent++; return new Response('{}') }).testConnection(), /not configured/)
  assert.equal(sent, 0)
})

test('credential retrieval validates HTTPS before decrypting or migrating legacy data', async t => {
  const { file, seed } = await fixture(t)
  await seed({ serverUrl: 'http://remote.invalid', username: 'dummy', password: 'dummy-invalid-cipher', passwordEncrypted: true })
  const b = backend()
  let decryptions = 0
  b.value.storage.decryptString = () => { decryptions++; return 'dummy-decrypted' }
  const store = settingsStore(file, b.value)
  const before = await fs.readFile(file, 'utf8')
  await assert.rejects(store.getCredentials(), /requires HTTPS/)
  assert.equal(decryptions, 0)
  assert.equal(b.encryptions(), 0)
  assert.equal(await fs.readFile(file, 'utf8'), before)
})
