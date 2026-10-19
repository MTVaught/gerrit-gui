import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { readSettingsFile, writeSettingsFile } from './settings-file.ts'

test('failed serialization preserves the original credentials and removes private temporary files', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-file-test-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  const original = { password: 'dummy-old-cipher', passwordEncrypted: true }
  await writeSettingsFile(file, original)
  await assert.rejects(writeSettingsFile(file, { password: 'dummy-new', invalid: 1n }), TypeError)
  assert.deepEqual(await readSettingsFile(file), original)
  assert.deepEqual(await fs.readdir(dir), ['settings.json'])
  assert.equal((await fs.stat(file)).mode & 0o777, 0o600)
})

test('reads reject a symlink instead of reading or changing its target', { skip: process.platform === 'win32' }, async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-file-test-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const target = path.join(dir, 'target.json')
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(target, '{}', { mode: 0o644 })
  await fs.symlink(target, file)
  await assert.rejects(readSettingsFile(file), { code: 'ELOOP' })
  assert.equal((await fs.stat(target)).mode & 0o777, 0o644)
})

for (const invalid of ['null', '[]', '"invalid"', '42']) {
  test(`invalid JSON settings shape ${invalid} stays intact`, async t => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-file-test-'))
    t.after(() => fs.rm(dir, { recursive: true, force: true }))
    const file = path.join(dir, 'settings.json')
    await fs.writeFile(file, invalid)
    await assert.rejects(readSettingsFile(file), /JSON object/)
    assert.equal(await fs.readFile(file, 'utf8'), invalid)
  })
}

test('parse errors do not disclose file contents', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gerrit-file-test-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, '{"password":"dummy-sensitive-parser-context" broken}')
  await assert.rejects(readSettingsFile(file), error => {
    assert.ok(error instanceof SyntaxError)
    assert.equal(error.message.includes('dummy-sensitive-parser-context'), false)
    assert.match(error.message, /file was kept/)
    return true
  })
})
