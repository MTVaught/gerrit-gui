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

test('identity comparison is independent of HTTP transport permission', () => {
  for (const serverUrl of ['http://127.0.0.1:8080', 'http://[::1]:8080', 'http://gerrit.example']) {
    const identity = { serverUrl, username: 'dummy' }
    assert.equal(sameCredentialIdentity(identity, { serverUrl: serverUrl + '/other', username: ' dummy ' }), true)
    assert.equal(sameCredentialIdentity(identity, { ...identity, username: 'other' }), false)
    assert.equal(sameCredentialIdentity(identity, { ...identity, serverUrl: serverUrl.replace('http:', 'https:') }), false)
  }
  assert.equal(sameCredentialIdentity({ serverUrl: 'http://127.0.0.1:8080', username: 'dummy' }, { serverUrl: 'http://127.0.0.1:8081', username: 'dummy' }), false)
})
