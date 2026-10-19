import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sameCredentialIdentity } from './credentials.ts'

const saved = { serverUrl: 'https://gerrit.example/gerrit', username: 'alice' }

test('credential identity uses the canonical origin and exact trimmed username', () => {
  for (const serverUrl of ['https://GERRIT.example:443/', 'gerrit.example/gerrit/c/demo/+/1', 'https://gerrit.example/other']) {
    assert.equal(sameCredentialIdentity(saved, { serverUrl, username: ' alice ' }), true, serverUrl)
  }
  for (const input of [
    { ...saved, serverUrl: 'https://other.example' },
    { ...saved, serverUrl: 'https://gerrit.example:444' },
    { ...saved, serverUrl: 'http://gerrit.example' },
    { ...saved, username: 'bob' },
    { ...saved, username: 'Alice' },
    { ...saved, username: '' },
    { ...saved, serverUrl: '' },
    { ...saved, serverUrl: 'https://[' },
    { ...saved, serverUrl: 'https://user:pass@gerrit.example' },
    { ...saved, serverUrl: 'file:///tmp/settings' },
  ]) assert.equal(sameCredentialIdentity(saved, input), false, JSON.stringify(input))
})
