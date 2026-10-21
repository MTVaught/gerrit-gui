import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultReviewPreferences, updateReviewPreference, type ReviewPreferences } from './review-preferences.ts'

test('successive field updates merge with confirmed state and recover from storage failure', () => {
  let current = { ...defaultReviewPreferences }
  let saved: ReviewPreferences | undefined
  const persist = (next: ReviewPreferences) => { saved = next }
  current = updateReviewPreference(current, 'context', 25, persist)
  current = updateReviewPreference(current, 'fontSize', 16, persist)
  assert.deepEqual(saved, { ...defaultReviewPreferences, context: 25, fontSize: 16 })
  assert.throws(() => { current = updateReviewPreference(current, 'tabWidth', 8, () => { throw new Error('Storage full') }) }, /Storage full/)
  assert.equal(current.tabWidth, 4)
  assert.equal(current.fontSize, 16)
  assert.equal(saved?.context, 25)
  current = updateReviewPreference(current, 'tabWidth', 8, persist)
  assert.deepEqual(current, { ...defaultReviewPreferences, context: 25, fontSize: 16, tabWidth: 8 })
  assert.deepEqual(saved, current)
})

test('invalid values never reach storage and fixed width survives fit changes', () => {
  const rejectWrite = () => { throw new Error('Unexpected write') }
  for (const value of [0, 7, 33, 12.5, NaN, Infinity]) {
    assert.throws(() => updateReviewPreference(defaultReviewPreferences, 'fontSize', value, rejectWrite), /Invalid review preference/)
  }
  let current = updateReviewPreference(defaultReviewPreferences, 'diffWidth', 120, () => {})
  current = updateReviewPreference(current, 'fitToScreen', false, () => {})
  current = updateReviewPreference(current, 'fitToScreen', true, () => {})
  assert.equal(current.diffWidth, 120)
})
