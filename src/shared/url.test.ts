import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changePath, normalizeServerUrl, validateServerUrl } from './url.ts'

test('keeps a path prefix the server is mounted under', () => {
  assert.equal(normalizeServerUrl('https://host.example.com/gerrit1'), 'https://host.example.com/gerrit1')
  assert.equal(normalizeServerUrl('https://host.example.com/gerrit1/'), 'https://host.example.com/gerrit1')
})

test('derives the base from a pasted change or dashboard URL', () => {
  assert.equal(normalizeServerUrl('https://host/gerrit1/c/my/project/+/1234/2'), 'https://host/gerrit1')
  assert.equal(normalizeServerUrl('https://host/gerrit1/q/status:open'), 'https://host/gerrit1')
  assert.equal(normalizeServerUrl('https://host/gerrit1/dashboard/self'), 'https://host/gerrit1')
  assert.equal(normalizeServerUrl('https://host/gerrit1/settings/#HTTPCredentials'), 'https://host/gerrit1')
  assert.equal(normalizeServerUrl('https://host/#/c/1234/'), 'https://host')
  assert.equal(normalizeServerUrl('https://host/gerrit1/a/changes/?q=x'), 'https://host/gerrit1')
})

test('adds https when the scheme is missing and leaves plain bases alone', () => {
  assert.equal(normalizeServerUrl('gerrit.example.com'), 'https://gerrit.example.com')
  assert.throws(() => normalizeServerUrl('http://localhost:8080'), /requires HTTPS/)
  assert.equal(normalizeServerUrl('  '), '')
})

test('rejects remote HTTP, other protocols, malformed URLs, and embedded credentials', () => {
  for (const input of ['http://gerrit.example/gerrit1/c/demo/+/1', 'HTTP://gerrit.example', 'ftp://gerrit.example']) {
    assert.throws(() => normalizeServerUrl(input), /requires HTTPS/)
    assert.throws(() => normalizeServerUrl(input, true), /requires HTTPS/)
  }
  assert.throws(() => normalizeServerUrl('https://'), /valid HTTPS/)
  assert.throws(() => normalizeServerUrl('https://dummy:dummy@gerrit.example'), /credentials/)
  assert.equal(normalizeServerUrl('HTTPS://GERRIT.EXAMPLE:443/gerrit1/'), 'https://gerrit.example/gerrit1')
})

test('HTTP test opt-in only permits loopback IPs, never DNS names or LAN addresses', () => {
  for (const host of ['127.0.0.1', '[::1]']) {
    const input = `http://${host}:8080/gerrit1`
    assert.throws(() => validateServerUrl(input), /requires HTTPS/)
    assert.equal(normalizeServerUrl(input, true), input)
  }
  for (const host of ['localhost', 'localhost.example', '127.0.0.1.example', '192.168.1.10', '0.0.0.0', '[::ffff:127.0.0.1]', 'example.com']) {
    assert.throws(() => validateServerUrl(`http://${host}:8080`, true), /requires HTTPS/)
  }
})

test('change path points at the change page, one patch set, or a patch-set range', () => {
  assert.equal(changePath({ id: 42, project: 'demo' }), '/c/demo/+/42')
  assert.equal(changePath({ id: 42, project: 'demo', patchSet: 5 }), '/c/demo/+/42/5')
  assert.equal(changePath({ id: 42, project: 'demo', patchSet: 5, basePatchSet: 3 }), '/c/demo/+/42/3..5')
})

test('change path encodes a project with slashes', () => {
  assert.equal(changePath({ id: 7, project: 'team/lib', patchSet: 2 }), '/c/team%2Flib/+/7/2')
})
