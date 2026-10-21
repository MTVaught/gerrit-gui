// Reproduce the pre-fix cross-patch-set reply payload on a throwaway, seeded
// Gerrit. The default deliberately sends the faulty anchor. This creates a
// change and publishes test comments; it is not a test of the current renderer.
// It does not drive the UI. See docs/investigations/ported-reply-duplication.md.
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { GerritClient } from '../src/main/gerrit.ts'
import type { ReviewComment } from '../src/shared/types.ts'

const base = process.env.GERRIT_TEST_URL ?? 'http://127.0.0.1:8080'
const originalAnchor = process.argv.includes('--original-anchor')
assert.equal(new URL(base).hostname, '127.0.0.1', 'Use a throwaway loopback Gerrit with dummy accounts')
const alice = new GerritClient(base, 'alice', 'alicepw')
const writes: { method?: string; path: string; body?: unknown; status: number }[] = []
const bob = new GerritClient(base, 'bob', 'bobpw', async (url, init) => {
  const response = await fetch(url, init)
  if (init.method !== 'GET') writes.push({ method: init.method, path: new URL(url).pathname, body: init.body ? JSON.parse(String(init.body)) : undefined, status: response.status })
  return response
})

async function fixture(method: string, path: string, body: unknown, contentType = 'application/json'): Promise<any> {
  const response = await fetch(`${base}/a${path}`, {
    method, redirect: 'error',
    headers: { Authorization: `Basic ${Buffer.from('alice:alicepw').toString('base64')}`, 'Content-Type': contentType },
    body: contentType === 'application/json' ? JSON.stringify(body) : String(body),
  })
  const text = await response.text()
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${text}`)
  return text.startsWith(")]}'") ? JSON.parse(text.slice(4)) : text
}

const version = JSON.parse((await (await fetch(`${base}/config/server/version`)).text()).slice(4))
await alice.self()
await bob.self()
const change = await fixture('POST', '/changes/', {
  project: 'demo', branch: 'master', subject: `Ported reply reproduction ${Date.now()}`, work_in_progress: true,
})
const id: number = change._number
const path = 'reply.ts'
const source = 'export const retries = 3;\nexport const timeout = 1000;\n'
await fixture('PUT', `/changes/${id}/edit/${path}`, source, 'text/plain')
await fixture('POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
await fixture('POST', `/changes/${id}/reviewers`, { reviewer: 'bob' })
await fixture('POST', `/changes/${id}/hashtags`, { add: ['reviewer:bob'] })
await fixture('POST', `/changes/${id}/custom_keyed_values`, { add: { 'review-requested-ps': '3' } })
await fixture('POST', `/changes/${id}/revisions/2/review`, {
  comments: { [path]: [{ line: 1, message: 'Please explain the retry limit.', unresolved: true }] }, notify: 'NONE',
})
const original = (await alice.comments(id))[path]![0]!
await fixture('PUT', `/changes/${id}/edit/${path}`, '// Retry policy\n' + source, 'text/plain')
await fixture('POST', `/changes/${id}/edit:publish`, { notify: 'NONE' })
const mapped = (await bob.portedComments(id, 3))[path]!.find(comment => comment.id === original.id)!
assert.ok(mapped, 'The original comment is visible on patch set 3')
assert.equal(original.line, 1)
assert.equal(mapped.line, 2)
// Gerrit formats published timestamps to whole seconds. Separate the parent
// and reply timestamps so this fast API script preserves UI comment ordering.
await new Promise(resolve => setTimeout(resolve, 1100))

// ReviewComments.replyAnchor currently chooses the displayed anchor, then
// save() sends that patch set and position together with the original parent ID.
const replyPatchSet = originalAnchor ? 2 : 3
const replyLine = originalAnchor ? original.line : mapped.line
const draft = await bob.saveDraft(id, replyPatchSet, {
  path, side: 'REVISION', line: replyLine, in_reply_to: original.id,
  message: 'Three attempts limit server load.', unresolved: true,
})
// The Save button updates the same draft after autosave.
await bob.saveDraft(id, replyPatchSet, {
  id: draft.id, path, side: 'REVISION', line: replyLine, in_reply_to: original.id,
  message: draft.message!, unresolved: true,
})
await bob.submitReview({ id, project: 'demo', patchSet: 3 }, {
  labels: {}, drafts: 'PUBLISH_ALL_REVISIONS', draft_ids_to_publish: [draft.id], notify: 'NONE',
})
const comments = (await bob.comments(id))[path]!
const replies = comments.filter(comment => comment.message === draft.message)
assert.equal(replies.length, 1, 'Gerrit stores one reply, despite the duplicate web display')
assert.equal(replies[0]!.id, draft.id)
assert.equal(replies[0]!.patch_set, replyPatchSet)
assert.equal(replies[0]!.in_reply_to, original.id)
assert.deepEqual(await bob.comments(id, true), {}, 'Publishing leaves no private draft')
const compact = (comment: ReviewComment) => ({ id: comment.id, patch_set: comment.patch_set, line: comment.line, in_reply_to: comment.in_reply_to, message: comment.message })
const result = {
  version, originalAnchor, change: id, url: `${base}/c/demo/+/${id}/3/${path}`,
  original: compact(original), mapped: compact(mapped), comments: comments.map(compact), writes,
  observation: originalAnchor
    ? 'Control case: the reply uses the original anchor. Gerrit shows one ported thread.'
    : 'Open the URL in Gerrit 3.11.2. The one reply appears as a separate thread and in the ported original thread.',
}
if (process.env.GERRIT_REPRO_OUTPUT) await writeFile(process.env.GERRIT_REPRO_OUTPUT, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify(result, null, 2))
