import { test } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileSettings } from '../server/file-settings.ts'
import { createService, type SettingsStore } from './service.ts'
import type { SettingsInput } from '../shared/types.ts'

// Only the Electron platform services are replaced. The real desktop settings
// module reads/writes an isolated directory, with reversible dummy encryption.
const electronUrl = 'data:text/javascript,' + encodeURIComponent(`
  export const state = { directory: '', encrypted: false };
  export const app = { getPath: () => state.directory };
  export const safeStorage = {
    isEncryptionAvailable: () => state.encrypted,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptString: value => Buffer.from('dummy-cipher:' + value),
    decryptString: value => {
      const text = value.toString();
      if (!text.startsWith('dummy-cipher:')) throw new Error('Invalid dummy ciphertext');
      return text.slice('dummy-cipher:'.length);
    }
  };
`)
const hook = registerHooks({
  resolve(specifier, context, nextResolve) {
    return specifier === 'electron' ? { url: electronUrl, shortCircuit: true } : nextResolve(specifier, context)
  },
})
const electron = await import(electronUrl)
const desktop = await import('./settings.ts')
hook.deregister()

const old = { serverUrl: 'https://old.example/gerrit', username: 'alice', password: 'dummy-old-secret' }
const envKeys = ['GERRIT_URL', 'GERRIT_USER', 'GERRIT_PASSWORD'] as const
function browser(file: string, env: Partial<Record<typeof envKeys[number], string>> = {}) {
  const previous = envKeys.map(key => process.env[key])
  try {
    for (const key of envKeys) {
      delete process.env[key]
      if (env[key] !== undefined) process.env[key] = env[key]
    }
    return fileSettings(file)
  } finally {
    envKeys.forEach((key, i) => {
      if (previous[i] === undefined) delete process.env[key]
      else process.env[key] = previous[i]
    })
  }
}

for (const mode of ['browser', 'desktop plaintext', 'desktop encrypted']) {
  test(`${mode}: identity changes require replacement credentials before save or network use`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gerrit-credential-binding-'))
    const file = path.join(directory, 'settings.json')
    electron.state.directory = directory
    electron.state.encrypted = mode === 'desktop encrypted'
    let browserProcess: SettingsStore | undefined
    const reopen = (): SettingsStore => mode === 'browser' ? browserProcess ??= browser(file) : {
      getStatus: desktop.getStatus, getCredentials: desktop.getCredentials, save: desktop.save,
    }
    try {
      await writeFile(file, JSON.stringify({ serverUrl: '', username: '' }))
      const store = reopen()
      const seed: SettingsInput = { ...await store.getStatus(), ...old }
      const sent: { origin: string; authorization: string }[] = []
      const svc = createService(store, async (url, init) => {
        sent.push({ origin: new URL(url).origin, authorization: new Headers(init.headers).get('Authorization')! })
        return new Response(JSON.stringify({ _account_id: 1, username: 'dummy-user' }))
      })
      for (const changed of [
        { serverUrl: 'https://new.example' },
        { serverUrl: 'https://old.example:444' },
        { serverUrl: 'http://old.example' },
        { username: 'bob' },
        { username: 'Alice' },
      ]) {
        await store.save(seed)
        const before = await readFile(file, 'utf8')
        const insecure = changed.serverUrl?.startsWith('http:')
        for (const password of [undefined, '']) {
          await assert.rejects(svc.saveSettings({ ...seed, ...changed, password }), insecure ? /requires HTTPS/ : /Enter an HTTP password/)
          assert.equal(await readFile(file, 'utf8'), before, 'rejection must leave the stored identity and secret intact')
          sent.length = 0
          await svc.testConnection()
          assert.deepEqual(sent, [{ origin: 'https://old.example', authorization: 'Basic ' + Buffer.from('alice:dummy-old-secret').toString('base64') }], 'even a subsequent test can only use the original identity')
        }
        const replacement = { ...seed, ...changed, password: 'dummy-replacement-secret' }
        if (insecure) {
          sent.length = 0
          await assert.rejects(svc.saveSettings(replacement), /requires HTTPS/)
          assert.equal(await readFile(file, 'utf8'), before)
          assert.deepEqual(await reopen().getCredentials(), old)
          assert.deepEqual(sent, [], 'a replacement password cannot authorize remote HTTP')
          continue
        }
        await svc.saveSettings(replacement)
        assert.deepEqual(await reopen().getCredentials(), {
          serverUrl: replacement.serverUrl, username: replacement.username, password: replacement.password,
        })
        if (mode === 'browser') assert.equal(await browser(file).getCredentials(), null, 'memory-only replacement does not survive restart')
        sent.length = 0
        await svc.testConnection()
        assert.deepEqual(sent, [{ origin: new URL(replacement.serverUrl).origin, authorization: 'Basic ' + Buffer.from(`${replacement.username}:dummy-replacement-secret`).toString('base64') }], 'new identities only receive explicitly supplied replacement credentials')
      }
      await store.save(seed)
      await store.save({ ...seed, serverUrl: 'https://OLD.example:443/other/c/demo/+/1', username: ' alice ', password: '' })
      assert.deepEqual(await reopen().getCredentials(), { ...old, serverUrl: 'https://old.example/other' }, 'same-origin path changes and account whitespace can reuse a password')
      assert.equal((await store.getStatus()).hasPassword, true)
      assert.ok(!JSON.stringify(await store.getStatus()).includes('dummy-old-secret'), 'status never exposes the secret')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  test(`${mode}: loopback test HTTP preserves password binding and still enforces transport`, async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'gerrit-loopback-binding-'))
    const file = path.join(directory, 'settings.json')
    const previousPolicy = process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP']
    electron.state.directory = directory
    electron.state.encrypted = mode === 'desktop encrypted'
    let browserProcess: SettingsStore | undefined
    const reopen = (): SettingsStore => mode === 'browser' ? browserProcess ??= browser(file) : {
      getStatus: desktop.getStatus, getCredentials: desktop.getCredentials, save: desktop.save,
    }
    try {
      process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP'] = '1'
      for (const host of ['127.0.0.1', '[::1]']) {
        const store = reopen()
        const seed: SettingsInput = { ...await store.getStatus(), serverUrl: `http://${host}:8080/gerrit`, username: 'dummy', password: 'dummy-local-secret' }
        await store.save(seed)
        await store.save({ ...seed, serverUrl: `http://${host}:8080/other`, username: ' dummy ', password: '' })
        assert.deepEqual(await reopen().getCredentials(), { serverUrl: `http://${host}:8080/other`, username: 'dummy', password: 'dummy-local-secret' })
        const before = await readFile(file, 'utf8')
        await assert.rejects(store.save({ ...seed, serverUrl: `http://${host}:8081/gerrit`, password: '' }), /Enter an HTTP password/)
        await assert.rejects(store.save({ ...seed, username: 'other', password: '' }), /Enter an HTTP password/)
        await assert.rejects(store.save({ ...seed, serverUrl: 'http://gerrit.example', password: 'dummy-replacement' }), /requires HTTPS/)
        assert.equal(await readFile(file, 'utf8'), before)
        delete process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP']
        assert.equal((await store.getStatus()).serverUrl, `http://${host}:8080/other`)
        await assert.rejects(store.getCredentials(), /requires HTTPS/)
        let calls = 0
        await assert.rejects(createService(store, async () => { calls++; return new Response('{}') }).testConnection(), /requires HTTPS/)
        assert.equal(calls, 0)
        process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP'] = '1'
      }
    } finally {
      if (previousPolicy === undefined) delete process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP']
      else process.env['GERRIT_GUI_ALLOW_LOCAL_TEST_HTTP'] = previousPolicy
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test('browser environment overrides never attach a file password to a different origin or account', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gerrit-credential-env-'))
  const file = path.join(directory, 'settings.json')
  try {
    for (const env of [{ GERRIT_URL: 'https://new.example' }, { GERRIT_USER: 'bob' }]) {
      await writeFile(file, JSON.stringify(old))
      const store = browser(file, env)
      assert.equal(await store.getCredentials(), null)
      assert.equal((await store.getStatus()).hasPassword, false)
      let sent = 0
      const svc = createService(store, async () => { sent++; return new Response('{}') })
      await assert.rejects(svc.testConnection(), /not configured/)
      await svc.saveSettings({ ...await store.getStatus(), password: '' })
      await assert.rejects(svc.testConnection(), /not configured/)
      assert.equal(sent, 0)
      const retained = JSON.parse(await readFile(file, 'utf8'))
      assert.equal(retained.password, undefined, 'legacy copy is automatically removed')
      assert.equal(retained.passwordIdentity, undefined)
      assert.equal(await browser(file).getCredentials(), null, 'restart cannot return the retained A password for B')
    }
    await writeFile(file, JSON.stringify(old))
    assert.deepEqual(await browser(file, { GERRIT_URL: 'https://OLD.example:443/other', GERRIT_USER: ' alice ' }).getCredentials(), { ...old, serverUrl: 'https://old.example/other' })
    const complete = browser(file, { GERRIT_URL: 'https://new.example', GERRIT_USER: 'bob', GERRIT_PASSWORD: 'dummy-env-secret' })
    assert.deepEqual(await complete.getCredentials(), { serverUrl: 'https://new.example', username: 'bob', password: 'dummy-env-secret' })
    await assert.rejects(complete.save({ ...await complete.getStatus(), serverUrl: 'https://third.example', password: '' }), /set by GERRIT_PASSWORD/)
    // An entered password for the file's new identity cannot be rebound by a
    // partial environment identity override on the next read.
    const partial = browser(file, { GERRIT_URL: 'https://new.example' })
    await partial.save({ ...await partial.getStatus(), serverUrl: 'https://third.example', password: 'dummy-third-secret' })
    assert.equal(await partial.getCredentials(), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('a password-only environment override stays bound to its startup identity', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'gerrit-credential-env-password-'))
  const file = path.join(directory, 'settings.json')
  try {
    await writeFile(file, JSON.stringify(old))
    const store = browser(file, { GERRIT_PASSWORD: 'dummy-env-secret' })
    assert.equal((await store.getCredentials())?.password, 'dummy-env-secret')
    for (const password of [undefined, 'dummy-bob-secret']) {
      await assert.rejects(store.save({ ...await store.getStatus(), username: 'bob', password }), /set by GERRIT_PASSWORD/)
    }
    assert.deepEqual(await browser(file, { GERRIT_PASSWORD: 'dummy-env-secret' }).getCredentials(), { ...old, password: 'dummy-env-secret' }, 'restart cannot rebind the environment password after a rejected edit')
    await writeFile(file, JSON.stringify({ ...old, serverUrl: 'https://new.example', password: undefined }))
    assert.equal(await store.getCredentials(), null)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
