// Diagnostic for the reported false conflict, not a passing behavior regression.
// Requires a throwaway Gerrit 3.11.2 seeded with test/seed-gerrit.sh.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { GerritClient } from '../src/main/gerrit.ts'
import { draftVersion, requireDraftVersion } from '../src/shared/draft-version.ts'
import type { DraftCommentInput, ReviewComment } from '../src/shared/types.ts'

const base = process.env.GERRIT_TEST_URL ?? 'http://127.0.0.1:18080'
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a throwaway loopback server and dummy users')
const alice = new GerritClient(base, 'alice', 'alicepw')
const bob = new GerritClient(base, 'bob', 'bobpw')
async function fixture(method: string, resource: string, body: unknown, contentType = 'application/json'): Promise<any> {
  const response = await fetch(base + '/a' + resource, {
    method, redirect: 'error',
    headers: { Authorization: 'Basic ' + Buffer.from('alice:alicepw').toString('base64'), 'Content-Type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(body) : String(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${resource}: ${response.status} ${text}`)
  return text.startsWith(")]}'") ? JSON.parse(text.slice(4)) : text
}
const version = JSON.parse((await (await fetch(base + '/config/server/version')).text()).slice(4))
assert.equal(version, '3.11.2')
const change = await fixture('POST', '/changes/', { project: 'demo', branch: 'master', subject: 'Draft autosave API investigation', work_in_progress: true })
const id = change._number
await fixture('PUT', `/changes/${id}/edit/review.ts`, 'export const attempts = 3;\nexport const timeout = 1000;\n', 'text/plain')
await fixture('POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
await fixture('POST', `/changes/${id}/reviewers`, { reviewer: 'bob' })
await fixture('POST', `/changes/${id}/revisions/2/review`, { comments: { 'review.ts': [{ line: 1, message: 'Explain this limit.', unresolved: true }] }, notify: 'NONE' })
const parent = (await alice.comments(id))['review.ts']![0]!
const cases: Record<string, DraftCommentInput> = {
  line: { path: 'review.ts', side: 'REVISION', line: 1, message: 'Line draft', unresolved: true },
  file: { path: 'review.ts', side: 'REVISION', message: 'File draft', unresolved: true },
  range: { path: 'review.ts', side: 'REVISION', line: 1, range: { start_line: 1, start_character: 0, end_line: 1, end_character: 6 }, message: 'Range draft', unresolved: true },
  reply: { path: 'review.ts', side: 'REVISION', line: 1, in_reply_to: parent.id, message: 'Reply draft', unresolved: true },
  validSummary: { path: '/PATCHSET_LEVEL', message: 'Summary without side', unresolved: false },
}
const results = []
for (const [name, input] of Object.entries(cases)) {
  const saved = await bob.saveDraft(id, 2, input)
  const listed = (await bob.comments(id, true))[input.path]!.find(c => c.id === saved.id)!
  const read: ReviewComment = { ...listed, path: input.path }
  assert.equal(saved.id, read.id)
  assert.equal(saved.message, read.message)
  assert.notEqual(saved.updated, read.updated, 'PUT retains milliseconds; persisted GET truncates them')
  assert.throws(() => requireDraftVersion([read], saved.id, draftVersion(saved)), /Draft conflict/)
  requireDraftVersion([read], saved.id, draftVersion(read))
  // Timestamp normalization alone makes these versions equal. This is a
  // diagnostic control; it does not change the app's comparison function.
  assert.equal(draftVersion({ ...saved, updated: read.updated }), draftVersion(read))
  results.push({ name, saved, read, savedVersion: draftVersion(saved), readVersion: draftVersion(read), falseConflict: true, rereadVersionAccepted: true })
}
let summaryError = ''
try { await bob.saveDraft(id, 2, { path: '/PATCHSET_LEVEL', side: 'REVISION', message: 'Summary as sent by the UI', unresolved: false }) }
catch (error) { summaryError = (error as Error).message }
assert.match(summaryError, /400 patchset-level comments can't have side, range, or line/)
const result = { version, change: id, results, summaryError, platform: 'Node production REST client, real local Gerrit, generated data' }
if (process.env.DRAFT_REPRO_OUTPUT) await writeFile(process.env.DRAFT_REPRO_OUTPUT, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
