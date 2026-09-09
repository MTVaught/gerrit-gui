import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeServerUrl } from './url.ts'

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
