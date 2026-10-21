import { test } from 'node:test'
import assert from 'node:assert/strict'
import { defaultReviewPreferences, parseReviewPreferences, normalizeReviewLine, reviewSourceColumn, loadReviewPreferences, saveReviewPreferences } from './review-preferences.ts'

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

test('local settings survive reopening and ignore a legacy Gerrit sync marker', (t) => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const data = new Map<string, string>([['local-review-gerrit-preferences-synced', 'true']])
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => data.set(key, value),
  } })
  t.after(() => { if (previous) Object.defineProperty(globalThis, 'localStorage', previous); else Reflect.deleteProperty(globalThis, 'localStorage') })
  assert.deepEqual(loadReviewPreferences(), defaultReviewPreferences)
  const local = { ...defaultReviewPreferences, context: 25, fontSize: 16, fitToScreen: false }
  saveReviewPreferences(local)
  assert.deepEqual(loadReviewPreferences(), local)
  assert.equal(data.get('local-review-gerrit-preferences-synced'), 'true')
  data.delete('local-review-gerrit-preferences-synced')
  assert.deepEqual(loadReviewPreferences(), local)
  data.set('local-review-diff-preferences', JSON.stringify({ ...local, tabWidth: 99 }))
  assert.deepEqual(loadReviewPreferences(), { ...local, tabWidth: 4 })
  data.set('local-review-diff-preferences', '{broken')
  assert.deepEqual(loadReviewPreferences(), defaultReviewPreferences)
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, get: () => { throw new Error('Storage blocked') } })
  assert.deepEqual(loadReviewPreferences(), defaultReviewPreferences)
})
