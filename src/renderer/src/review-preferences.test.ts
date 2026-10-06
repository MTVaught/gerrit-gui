import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultReviewPreferences, parseReviewPreferences, normalizeReviewLine, reviewSourceColumn } from './review-preferences.ts'

test('preferences retain whole-file default and reject corrupt persisted values', () => {
  assert.equal(defaultReviewPreferences.context, -1)
  assert.equal(defaultReviewPreferences.autoMarkReviewed, false)
  assert.deepEqual(parseReviewPreferences(null), defaultReviewPreferences)
  assert.deepEqual(parseReviewPreferences({ context: -5, fontSize: 100000, tabWidth: 0, diffWidth: '500', showTabs: 'yes', ignoreWhitespace: 'unknown' }), defaultReviewPreferences)
  assert.deepEqual(parseReviewPreferences({ ...defaultReviewPreferences, context: 10, showTabs: true, ignoreWhitespace: 'IGNORE_ALL' }), { ...defaultReviewPreferences, context: 10, showTabs: true, ignoreWhitespace: 'IGNORE_ALL' })
})
test('Gerrit whitespace modes normalize comparison only and map source columns', () => {
  const line = '\t foo  bar \t'
  assert.equal(normalizeReviewLine(line, 'IGNORE_NONE'), line)
  assert.equal(normalizeReviewLine(line, 'IGNORE_TRAILING'), '\t foo  bar')
  assert.equal(normalizeReviewLine(line, 'IGNORE_LEADING_AND_TRAILING'), 'foo  bar')
  assert.equal(normalizeReviewLine(line, 'IGNORE_ALL'), 'foobar')
  assert.equal(reviewSourceColumn(line, 1, 'IGNORE_LEADING_AND_TRAILING'), 3)
  assert.equal(reviewSourceColumn(line, 4, 'IGNORE_ALL'), 8)
  assert.equal(reviewSourceColumn(line, 7, 'IGNORE_ALL'), line.length + 1)
})

test('Gerrit preference synchronization preserves local fit setting and manual-review inversion', async () => {
  const { fromGerritPreferences, toGerritPreferences } = await import('./review-preferences.ts')
  const local = { ...defaultReviewPreferences, fitToScreen: false, context: 20, autoMarkReviewed: true }
  const remote = toGerritPreferences(local)
  assert.equal(remote.manual_review, false)
  assert.ok(!('fitToScreen' in remote))
  assert.deepEqual(fromGerritPreferences(remote, local), local)
  assert.equal(fromGerritPreferences({ context: -1 }).context, -1)
})
