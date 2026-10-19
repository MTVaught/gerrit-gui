import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileSettings } from '../server/file-settings.ts'
import { normalizeTheme, resolveTheme, normalizeDiffTheme, resolveDiffTheme } from './theme.ts'

test('explicit themes override the system and system follows either appearance', () => {
  for (const systemDark of [true, false]) {
    assert.equal(resolveTheme('light', systemDark), 'light')
    assert.equal(resolveTheme('dark', systemDark), 'dark')
    assert.equal(resolveTheme('system', systemDark), systemDark ? 'dark' : 'light')
  }
  for (const value of [undefined, null, 'invalid', 'system']) {
    assert.equal(normalizeTheme(value), 'system')
  }
})

test('older settings default to system and every theme survives reopening and unrelated saves', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'theme-settings-'))
  try {
    const file = path.join(dir, 'settings.json')
    await writeFile(file, JSON.stringify({ serverUrl: '', username: '' }))
    const store = fileSettings(file)
    assert.equal((await store.getStatus()).theme, 'system')
    for (const theme of ['light', 'dark', 'system'] as const) {
      await store.save({ ...await store.getStatus(), theme })
      const reopened = fileSettings(file)
      assert.equal((await reopened.getStatus()).theme, theme)
      await reopened.save({ ...await reopened.getStatus(), showZeroCounts: true })
      assert.equal((await store.getStatus()).theme, theme)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('diff themes resolve against the application rather than the device', () => {
  for (const value of [undefined, null, 'system', 'invalid', 'application']) {
    assert.equal(normalizeDiffTheme(value), 'application')
  }
  for (const systemDark of [true, false]) {
    for (const app of ['light', 'dark', 'system'] as const) {
      const resolved = resolveTheme(app, systemDark)
      assert.equal(resolveDiffTheme('application', resolved), resolved)
      for (const diff of ['light', 'dark'] as const) {
        assert.equal(normalizeDiffTheme(diff), diff)
        assert.equal(resolveDiffTheme(diff, resolved), diff)
      }
    }
  }
})

test('diff themes survive reopening and unrelated saves in application settings', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'diff-theme-settings-'))
  try {
    const file = path.join(dir, 'settings.json')
    await writeFile(file, JSON.stringify({ serverUrl: '', username: '', diffTheme: 'invalid' }))
    const store = fileSettings(file)
    assert.equal((await store.getStatus()).diffTheme, 'application')
    for (const diffTheme of ['light', 'dark', 'application'] as const) {
      await store.save({ ...await store.getStatus(), diffTheme })
      const reopened = fileSettings(file)
      assert.equal((await reopened.getStatus()).diffTheme, diffTheme)
      await reopened.save({ ...await reopened.getStatus(), theme: 'dark', showZeroCounts: true })
      assert.equal((await store.getStatus()).diffTheme, diffTheme)
    }
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
