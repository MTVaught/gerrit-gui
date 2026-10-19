// Four real Electron processes, isolated settings and dummy credentials only.
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
  // Reproduce positive availability on real basic_text. Production never calls this setter.
  safeStorage.setUsePlainTextEncryption(true)
  assert.equal(safeStorage.getSelectedStorageBackend(), 'basic_text')
  assert.equal(safeStorage.isEncryptionAvailable(), true)
  const file = path.join(dir, 'settings.json')
  const reportFile = path.join(dir, 'electron-result.json')
  const disk = async () => JSON.parse(await fs.readFile(file, 'utf8'))
  const noSecret = async () => {
    for (const key of ['password', 'passwordEncrypted', 'passwordStorageVersion', 'passwordIdentity']) assert.equal((await disk())[key], undefined)
  }
  const phase = process.env.GERRIT_SECRET_TEST_PHASE ?? 'seed'
  let report: Record<string, unknown> = phase === 'seed' ? {} : JSON.parse(await fs.readFile(reportFile, 'utf8'))
  if (phase === 'seed') {
    await fs.writeFile(file, JSON.stringify({ ...A, password: 'dummy-old-plaintext' }), { mode: 0o644 })
    await fs.chmod(file, 0o644)
    assert.equal((await settings.getCredentials())?.password, 'dummy-old-plaintext')
    await noSecret()
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
    report = { platform: process.platform, electron: process.versions.electron, backend: safeStorage.getSelectedStorageBackend(),
      electronEncryptionAvailable: true, appEncryptionTrusted: (await settings.getStatus()).encrypted,
      beforeMode: '644', legacyPlaintextReadable: true, afterLoad: await disk() }
    await assert.rejects(settings.save({ ...await settings.getStatus(), ...B, password: '' }), /Enter an HTTP password/)
    await settings.save({ ...await settings.getStatus(), ...B, password: 'dummy-session-B' })
    assert.deepEqual(await settings.getCredentials(), { ...B, password: 'dummy-session-B' })
    await noSecret()
    report.afterReplacement = await disk()
  } else if (phase === 'identity-restart' || phase === 'cipher-restart') {
    assert.equal(await settings.getCredentials(), null)
    assert.equal((await settings.getStatus()).hasPassword, false)
    let sent = 0
    await assert.rejects(createService(settings, async () => { sent++; return new Response('{}') }).testConnection(), /not configured/)
    assert.equal(sent, 0)
    await noSecret()
    if (phase === 'identity-restart') {
      report.identityRestartHasPassword = false
      report.identityRestartSentRequests = sent
      report.afterIdentityRestart = await disk()
    } else {
      report.restartHasPassword = false
      report.afterRestart = await disk()
    }
  } else {
    assert.equal(phase, 'cipher-seed')
    await fs.writeFile(file, JSON.stringify({ ...B, password: safeStorage.encryptString('dummy-basic-legacy').toString('base64'), passwordEncrypted: true, passwordIdentity: A }))
    assert.equal((await settings.getStatus()).hasPassword, false)
    await noSecret()
    assert.equal(await settings.getCredentials(), null, 'A cannot be used for B after cleanup')
    report.afterCrossIdentityCleanup = await disk()
    // Change fixture identity only: readable memory stays bound to original A.
    await fs.writeFile(file, JSON.stringify({ ...await disk(), ...A }))
    assert.equal((await settings.getCredentials())?.password, 'dummy-basic-legacy')
    report.legacyBasicCiphertextReadable = true
    report.afterMigration = await disk()
    await fs.chmod(file, 0o644)
    await settings.save({ ...await settings.getStatus(), password: 'dummy-new-session' })
    await fs.chmod(file, 0o644)
    await settings.saveUi({ compact: true })
    assert.equal((await settings.getCredentials())?.password, 'dummy-new-session')
    await noSecret()
    report.afterMode = ((await fs.stat(file)).mode & 0o777).toString(8)
    assert.equal(report.afterMode, '600')
    report.sessionHasPassword = true
    report.afterSave = await disk()
  }
  await fs.writeFile(reportFile, JSON.stringify(report, null, 2))
  console.log(`Electron basic_text ${phase}: passed`)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
