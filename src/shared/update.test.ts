import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  initialUpdateState,
  onAvailable,
  onCheckFailure,
  onCheckStart,
  onDownloadFailure,
  onDownloadProgress,
  onDownloadStart,
  onDownloaded,
  onInstallFailure,
  onNoUpdate,
  plainReleaseNotes,
  updateAction,
  updateButtonLabel,
  updateMenuLabel,
  updateSummary,
} from './update.ts'

const at = '2026-09-09T10:00:00.000Z'

test('check, available, download, downloaded, install', () => {
  let s = initialUpdateState('0.1.0')
  assert.equal(s.status, 'idle')
  assert.equal(updateAction(s), 'check')
  s = onCheckStart(s, at)
  assert.equal(updateAction(s), 'none')
  s = onAvailable(s, '0.2.0', '• Fix things', at)
  assert.equal(s.status, 'available')
  assert.equal(s.releaseUrl, 'https://github.com/MTVaught/gerrit-gui/releases/tag/v0.2.0')
  assert.equal(updateAction(s), 'download')
  assert.equal(updateButtonLabel(s), 'Download')
  assert.equal(updateMenuLabel(s), 'Download update 0.2.0')
  s = onDownloadProgress(onDownloadStart(s), 42.5)
  assert.equal(s.status, 'downloading')
  assert.equal(updateAction(s), 'none')
  assert.equal(updateSummary(s), 'Downloading version 0.2.0… 42%')
  s = onDownloaded(s, '0.2.0')
  assert.equal(s.status, 'downloaded')
  assert.equal(s.downloadPercent, 100)
  assert.equal(updateAction(s), 'install')
  assert.equal(updateButtonLabel(s), 'Restart to install')
  assert.equal(updateMenuLabel(s), 'Restart to install 0.2.0')
})

test('disabled state has no action', () => {
  const s = initialUpdateState('0.1.0', 'Automatic updates only work in the packaged app.')
  assert.equal(s.status, 'disabled')
  assert.equal(updateAction(s), 'none')
  assert.match(updateSummary(s), /packaged app/)
})

test('no update after a check', () => {
  const s = onNoUpdate(onCheckStart(initialUpdateState('0.1.0'), at), at)
  assert.equal(s.status, 'up-to-date')
  assert.equal(s.checkedAt, at)
  assert.equal(updateAction(s), 'check')
  assert.equal(updateSummary(s), 'Version 0.1.0 is the latest.')
})

test('failed check can be retried', () => {
  const s = onCheckFailure(onCheckStart(initialUpdateState('0.1.0'), at), 'net::ERR_INTERNET_DISCONNECTED', at)
  assert.equal(s.status, 'error')
  assert.equal(s.errorContext, 'check')
  assert.equal(updateAction(s), 'check')
  assert.match(updateSummary(s), /ERR_INTERNET_DISCONNECTED/)
})

test('failed download keeps the release available for a retry', () => {
  let s = onAvailable(initialUpdateState('0.1.0'), '0.2.0', null, at)
  s = onDownloadFailure(onDownloadStart(s), 'disk full')
  assert.equal(s.status, 'available')
  assert.equal(s.errorContext, 'download')
  assert.equal(updateAction(s), 'download')
  assert.equal(updateButtonLabel(s), 'Retry download')
  assert.match(updateSummary(s), /disk full/)
})

test('a downloaded update survives later checks', () => {
  let s = onDownloaded(onAvailable(initialUpdateState('0.1.0'), '0.2.0', 'notes', at), '0.2.0')
  s = onCheckStart(s, at)
  assert.equal(s.releaseNotes, 'notes')
  assert.equal(onNoUpdate(s, at).status, 'downloaded')
  assert.equal(onCheckFailure(s, 'offline', at).status, 'downloaded')
  const again = onAvailable(s, '0.2.0', null, at)
  assert.equal(again.status, 'downloaded')
  assert.equal(again.releaseNotes, 'notes')
  // A release newer than the downloaded one goes back to "available".
  const newer = onAvailable(s, '0.3.0', null, at)
  assert.equal(newer.status, 'available')
  assert.equal(newer.downloadedVersion, null)
})

test('failed install keeps the downloaded state', () => {
  const s = onInstallFailure(onDownloaded(initialUpdateState('0.1.0'), '0.2.0'), 'boom')
  assert.equal(updateAction(s), 'install')
  assert.equal(updateSummary(s), 'Could not install version 0.2.0: boom')
})

test('release notes from the GitHub feed become plain lines', () => {
  const html =
    '<h2>What&#39;s Changed</h2>\n<ul>\n' +
    '<li>Add sorting by <a href="https://github.com/me">@me</a> in <a href="https://github.com/MTVaught/gerrit-gui/pull/4">https://github.com/MTVaught/gerrit-gui/pull/4</a></li>\n' +
    '<li>Fix &lt;pills&gt; &amp; badges</li>\n</ul>\n' +
    '<p><strong>Full Changelog</strong>: <a href="https://github.com/MTVaught/gerrit-gui/compare/v0.1.0...v0.2.0">v0.1.0...v0.2.0</a></p>'
  assert.equal(plainReleaseNotes(html), "What's Changed\n• Add sorting by @me (#4)\n• Fix <pills> & badges")
  assert.equal(plainReleaseNotes(''), null)
  assert.equal(plainReleaseNotes(null), null)
  assert.equal(plainReleaseNotes([{ version: '0.2.0', note: '<p>One</p>' }]), '0.2.0\nOne')
})
