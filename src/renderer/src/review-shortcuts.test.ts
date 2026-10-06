import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reviewShortcut } from './review-shortcuts.ts'

test('Gerrit review keys retain case and context', () => {
  assert.equal(reviewShortcut({ key: 'j' }), 'nextLine')
  assert.equal(reviewShortcut({ key: 'k', repeat: true }), 'previousLine')
  assert.equal(reviewShortcut({ key: 'c' }), 'comment')
  assert.equal(reviewShortcut({ key: 'a' }), 'review')
  assert.equal(reviewShortcut({ key: 'h' }), 'toggleComments')
  assert.equal(reviewShortcut({ key: 'N', shiftKey: true }), 'nextThread')
  assert.equal(reviewShortcut({ key: 'P', shiftKey: true }), 'previousThread')
  assert.equal(reviewShortcut({ key: 'n' }), 'nextChunk')
  assert.equal(reviewShortcut({ key: 'p' }), 'previousChunk')
  assert.equal(reviewShortcut({ key: ']' }), 'nextFile')
  assert.equal(reviewShortcut({ key: '[' }), 'previousFile')
  assert.equal(reviewShortcut({ key: '.', repeat: false }), 'visibleLine')
  assert.equal(reviewShortcut({ key: 'ArrowLeft', shiftKey: true }), 'leftPane')
  assert.equal(reviewShortcut({ key: 'ArrowRight', shiftKey: true }), 'rightPane')
  assert.equal(reviewShortcut({ key: '?' , shiftKey: true }), 'help')
  assert.equal(reviewShortcut({ key: 'm' }), 'toggleMode')
  assert.equal(reviewShortcut({ key: 'u' }), 'up')
  assert.equal(reviewShortcut({ key: 'j' }, { fileList: true }), 'nextFileCursor')
  assert.equal(reviewShortcut({ key: 'Enter' }, { fileList: true }), 'openFile')
  assert.equal(reviewShortcut({ key: 'o' }), null)
  assert.equal(reviewShortcut({ key: 'b' }), 'blame')
  assert.equal(reviewShortcut({ key: ',' }), 'preferences')
  assert.equal(reviewShortcut({ key: 'r' }), 'toggleReviewed')
})

test('typing, IME, modified keys, and repeats cannot accidentally navigate', () => {
  for (const key of ['j', 'n', '[', '?', 'u', 'c', 'a', 'h', 'N', 'P']) {
    assert.equal(reviewShortcut({ key }, { textEntry: true }), null)
    for (const flag of ['ctrlKey', 'metaKey', 'altKey', 'isComposing']) assert.equal(reviewShortcut({ key, [flag]: true }), null)
  }
  assert.equal(reviewShortcut({ key: 'n', repeat: true }), null)
  assert.equal(reviewShortcut({ key: 'J', shiftKey: true }), null)
  assert.equal(reviewShortcut({ key: 'M', shiftKey: true }), 'nextUnreviewed')
  assert.equal(reviewShortcut({ key: 'ArrowLeft' }), null)
})
