// Three real Electron processes, isolated settings and dummy credentials only.
import { app, safeStorage } from 'electron'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import * as settings from '../src/main/settings.ts'
import { createService } from '../src/main/service.ts'

const dir = process.env.GERRIT_SECRET_TEST_DIR
if (!dir) throw new Error('Set GERRIT_SECRET_TEST_DIR to an isolated test directory')
app.setPath('userData', dir)
const A = { serverUrl: 'https://gerrit.invalid', username: 'dummy' }
const B = { serverUrl: 'https://other.invalid', username: 'other-dummy' }
app.whenReady().then(async () => {
  // Reproduce the audited positive availability result on the real basic backend.
  // Production never calls this setter.
  safeStorage.setUsePlainTextEncryption(true)
  assert.equal(safeStorage.getSelectedStorageBackend(), 'basic_text')
  assert.equal(safeStorage.isEncryptionAvailable(), true)
  const file = path.join(dir, 'settings.json')
  const reportFile = path.join(dir, 'electron-result.json')
  const disk = async () => JSON.parse(await fs.readFile(file, 'utf8'))
  const phase = process.env.GERRIT_SECRET_TEST_PHASE ?? 'seed'
  let report: Record<string, unknown>
  if (phase === 'seed') {
    await fs.writeFile(file, JSON.stringify({ ...A, password: 'dummy-old-plaintext' }), { mode: 0o644 })
    await fs.chmod(file, 0o644)
    assert.equal((await settings.getCredentials())?.password, 'dummy-old-plaintext')
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
    await fs.writeFile(file, JSON.stringify({ ...A, password: safeStorage.encryptString('dummy-basic-legacy').toString('base64'), passwordEncrypted: true }))
    assert.equal((await settings.getStatus()).legacyPasswordStored, true)
    assert.equal((await settings.getCredentials())?.password, 'dummy-basic-legacy')
    await assert.rejects(settings.save({ ...await settings.getStatus(), ...B, password: '' }), /Enter an HTTP password/)
    await settings.save({ ...await settings.getStatus(), ...B, password: 'dummy-session-B' })
    assert.deepEqual(await settings.getCredentials(), { ...B, password: 'dummy-session-B' })
    assert.deepEqual((await disk()).passwordIdentity, A)
    report = { platform: process.platform, electron: process.versions.electron, backend: safeStorage.getSelectedStorageBackend(),
      electronEncryptionAvailable: true, appEncryptionTrusted: (await settings.getStatus()).encrypted,
      beforeMode: '644', legacyPlaintextReadable: true, legacyBasicCiphertextReadable: true,
      afterRetainedReplacement: await disk() }
  } else {
    report = JSON.parse(await fs.readFile(reportFile, 'utf8'))
    assert.equal(await settings.getCredentials(), null)
    assert.equal((await settings.getStatus()).hasPassword, false)
    if (phase === 'retained-restart') {
      let sent = 0
      await assert.rejects(createService(settings, async () => { sent++; return new Response('{}') }).testConnection(), /not configured/)
      assert.equal(sent, 0)
      report.retainedRestartHasPassword = false
      report.retainedRestartSentRequests = sent
      report.afterRetainedRestart = await disk()
      // Explicit fixture recovery to A proves the old copy remained usable for A.
      await fs.writeFile(file, JSON.stringify({ ...await disk(), ...A }))
      assert.equal((await settings.getCredentials())?.password, 'dummy-basic-legacy')
      await settings.save({ ...await settings.getStatus(), removeLegacyPassword: true })
      assert.equal((await settings.getCredentials())?.password, 'dummy-basic-legacy')
      report.afterMigration = await disk()
      assert.equal((await disk()).password, undefined)
      await fs.chmod(file, 0o644)
      await settings.save({ ...await settings.getStatus(), password: 'dummy-new-session' })
      await fs.chmod(file, 0o644)
      await settings.saveUi({ compact: true })
      assert.equal((await settings.getCredentials())?.password, 'dummy-new-session')
      assert.equal((await disk()).password, undefined)
      report.afterMode = ((await fs.stat(file)).mode & 0o777).toString(8)
      assert.equal(report.afterMode, '600')
      report.explicitRemovalKeptSessionPassword = true
      report.sessionHasPassword = true
      report.afterSave = await disk()
    } else {
      assert.equal(phase, 'removed-restart')
      report.restartHasPassword = false
      report.afterRestart = await disk()
    }
  }
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2))
  console.log(`Electron basic_text ${phase}: passed`)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
