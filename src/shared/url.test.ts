import { test } from 'node:test'
import assert from 'node:assert/strict'
import { changePath, normalizeServerUrl } from './url.ts'

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
  assert.equal(normalizeServerUrl('http://localhost:8080'), 'http://localhost:8080')
  assert.equal(normalizeServerUrl('  '), '')
})

test('change path points at the change page, one patch set, or a patch-set range', () => {
  assert.equal(changePath({ id: 42, project: 'demo' }), '/c/demo/+/42')
  assert.equal(changePath({ id: 42, project: 'demo', patchSet: 5 }), '/c/demo/+/42/5')
  assert.equal(changePath({ id: 42, project: 'demo', patchSet: 5, basePatchSet: 3 }), '/c/demo/+/42/3..5')
})

test('change path encodes a project with slashes', () => {
  assert.equal(changePath({ id: 7, project: 'team/lib', patchSet: 2 }), '/c/team%2Flib/+/7/2')
})
