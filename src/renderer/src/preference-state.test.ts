import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PreferenceState, newerSettings } from './preference-state.ts'
import { defaultReviewPreferences } from '../../shared/review-preferences.ts'

test('late snapshots cannot undo newer saved fields or pending local edits', async () => {
  const state = new PreferenceState(defaultReviewPreferences)
  let resolve!: (value: { version: number; value: typeof defaultReviewPreferences }) => void
  const edit = state.change('fontSize', 16, () => new Promise(r => { resolve = r }), () => {})
  state.accept({ version: 3, value: { ...defaultReviewPreferences, showTabs: true } })
  assert.equal(state.value.fontSize, 16)
  assert.equal(state.value.showTabs, true)
  resolve({ version: 2, value: { ...defaultReviewPreferences, fontSize: 16 } })
  await edit
  assert.equal(state.value.showTabs, true)
  state.accept({ version: 1, value: defaultReviewPreferences })
  assert.equal(state.value.showTabs, true)
  assert.deepEqual(newerSettings({ version: 4 }, { version: 2 }), { version: 4 })
})

test('a failed edit returns to confirmed state without undoing another successful field', async () => {
  const state = new PreferenceState(defaultReviewPreferences)
  await state.change('showTabs', true, async () => ({ version: 1, value: { ...defaultReviewPreferences, showTabs: true } }), () => {})
  await assert.rejects(state.change('fontSize', 16, async () => { throw new Error('disk failed') }, () => {}), /disk failed/)
  assert.equal(state.value.fontSize, 13)
  assert.equal(state.value.showTabs, true)
})
