import { test } from 'node:test'
import assert from 'node:assert/strict'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { settingsStore } from './settings-store.ts'

test('atomic setting patches preserve concurrent fields, credentials and window state', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-settings-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, JSON.stringify({ serverUrl: 'https://example.invalid', username: 'alice', ui: { compact: true } }))
  const store = settingsStore(file)
  assert.equal((await store.getStatus()).separateReviewWindows, false)
  await store.patch({ password: 'test-session', localReview: true })
  const [a, b] = await Promise.all([store.patch({ separateReviewWindows: true }), store.patch({ diffTheme: 'dark' })])
  assert.ok(b.version! > a.version!)
  const result = await store.getStatus()
  assert.equal(result.separateReviewWindows, true)
  assert.equal(result.diffTheme, 'dark')
  assert.equal((await store.getCredentials())?.password, 'test-session')
  assert.deepEqual(await store.getUi(), { compact: true })
  assert.equal((await settingsStore(file).getStatus()).separateReviewWindows, true)
  await assert.rejects(store.patch({ separateReviewWindows: 'yes' } as never), /Invalid settings/)
  await assert.rejects(store.patch({ username: 'bob' }), /HTTP password/)
  assert.equal((await store.getStatus()).username, 'alice')
})

test('desktop preferences migrate once and merge concurrent field writes', async t => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'shared-diff-'))
  t.after(() => fs.rm(dir, { recursive: true, force: true }))
  const file = path.join(dir, 'settings.json')
  await fs.writeFile(file, JSON.stringify({ serverUrl: 'https://example.invalid', username: 'alice', diffTheme: 'dark' }))
  const store = settingsStore(file)
  const first = await store.getReviewPreferences({ fontSize: 15, showTabs: true, tabWidth: -3 })
  assert.equal(first.value.fontSize, 15)
  assert.equal(first.value.tabWidth, 4)
  assert.equal(first.value.showTabs, true)
  assert.equal((await store.getReviewPreferences({ fontSize: 8 })).value.fontSize, 15)
  await Promise.all([store.patchReviewPreferences({ fontSize: 16 }), store.patchReviewPreferences({ ignoreWhitespace: 'IGNORE_ALL' })])
  await assert.rejects(store.patchReviewPreferences({ fontSize: 999 }), /Invalid review preference/)
  const saved = await settingsStore(file).getReviewPreferences()
  assert.equal(saved.value.fontSize, 16)
  assert.equal(saved.value.ignoreWhitespace, 'IGNORE_ALL')
  await store.patch({ separateReviewWindows: true })
  assert.equal((await store.getReviewPreferences()).value.fontSize, 16)
  assert.equal((await store.getStatus()).diffTheme, 'dark')
})
