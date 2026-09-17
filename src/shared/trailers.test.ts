import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageBody, parseTrailers, shownTrailers } from './trailers.ts'

const msg = ['Add retries to the S3 uploader', '', 'Uploads over a flaky link gave up on the first 5xx.', 'Retry three times.', '', 'Bug: 4821', 'Test: unit; manual against minio', 'Change-Id: I2f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e'].join('\n')

test('reads the Key: value lines of the last paragraph', () => {
  assert.deepEqual(parseTrailers(msg), [
    { key: 'Bug', value: '4821' },
    { key: 'Test', value: 'unit; manual against minio' },
    { key: 'Change-Id', value: 'I2f0e9d8c7b6a5f4e3d2c1b0a9f8e7d6c5b4a3f2e' },
  ])
})

test('body is what sits between the subject and the trailers', () => {
  assert.equal(messageBody(msg), 'Uploads over a flaky link gave up on the first 5xx.\nRetry three times.')
  assert.equal(messageBody('Subject only\n\nChange-Id: I1'), '')
  assert.equal(messageBody('Subject\n\nJust a body.'), 'Just a body.')
})

test('a subject alone, or a last paragraph of prose, has no trailers', () => {
  assert.deepEqual(parseTrailers('Fix it'), [])
  assert.deepEqual(parseTrailers('Fix it\n\nNote: this is prose\nand it goes on.'), [])
  assert.deepEqual(parseTrailers('Bug: 1\nTest: none'), [])
})

test('indented lines continue the trailer above them', () => {
  assert.deepEqual(parseTrailers('S\n\nTest: ran the suite\n  twice\nBug: 9\n'), [
    { key: 'Test', value: 'ran the suite twice' },
    { key: 'Bug', value: '9' },
  ])
})

test('Change-Id and Signed-off-by are noise', () => {
  const shown = shownTrailers(parseTrailers(msg + '\nSigned-off-by: A <a@example.com>'))
  assert.deepEqual(
    shown.map((t) => t.key),
    ['Bug', 'Test'],
  )
  assert.deepEqual(shownTrailers(parseTrailers('S\n\nChange-Id: I1')), [])
})

test('windows line endings and trailing blank lines are fine', () => {
  assert.deepEqual(parseTrailers('S\r\n\r\nBug: 3\r\n\r\n'), [{ key: 'Bug', value: '3' }])
})
