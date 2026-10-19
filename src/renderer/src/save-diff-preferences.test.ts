import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultReviewPreferences } from './review-preferences.ts'
import { commitDiffPreferences } from './save-diff-preferences.ts'

test('a theme-only save uses no Gerrit or local diff preference write', async () => {
  const calls: string[] = []
  await commitDiffPreferences(defaultReviewPreferences, defaultReviewPreferences, 'application', 'dark', {
    saveGerrit: async () => { throw new Error('read-only Gerrit') },
    saveLocal: () => { throw new Error('unexpected local preference write') },
    saveTheme: async theme => { calls.push(theme) },
  })
  assert.deepEqual(calls, ['dark'])
})

test('combined save stops at Gerrit failure and retries only pending theme after a confirmed write', async () => {
  let baseline = { ...defaultReviewPreferences }
  const next = { ...baseline, fontSize: 16 }
  const calls: string[] = []
  let failGerrit = true
  let failTheme = true
  const writes = {
    saveGerrit: async (input: unknown) => {
      calls.push('gerrit')
      assert.ok(!Object.hasOwn(input as object, 'diffTheme'))
      if (failGerrit) throw new Error('Gerrit failed')
    },
    saveLocal: (input: typeof baseline, synced: boolean) => { assert.equal(synced, true); baseline = input; calls.push('local') },
    saveTheme: async () => { calls.push('theme'); if (failTheme) throw new Error('Theme failed') },
  }
  await assert.rejects(commitDiffPreferences(baseline, next, 'application', 'dark', writes), /Gerrit failed/)
  assert.deepEqual(calls, ['gerrit'])
  failGerrit = false
  await assert.rejects(commitDiffPreferences(baseline, next, 'application', 'dark', writes), /Theme failed/)
  assert.deepEqual(calls, ['gerrit', 'gerrit', 'local', 'theme'])
  failTheme = false
  await commitDiffPreferences(baseline, next, 'application', 'dark', writes)
  assert.deepEqual(calls, ['gerrit', 'gerrit', 'local', 'theme', 'theme'])
})

test('local-only diff edits do not mark account preferences synced', async () => {
  const next = { ...defaultReviewPreferences, fitToScreen: false }
  let saved = false
  await commitDiffPreferences(defaultReviewPreferences, next, 'dark', 'dark', {
    saveGerrit: async () => { throw new Error('unexpected Gerrit write') },
    saveLocal: (input, synced) => { assert.equal(input, next); assert.equal(synced, false); saved = true },
    saveTheme: async () => { throw new Error('unexpected theme write') },
  })
  assert.equal(saved, true)
})
