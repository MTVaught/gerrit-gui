import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ReviewWindows } from './review-windows.ts'

test('duplicate changes keep separate contexts, close tokens and lifetimes', () => {
  const registry = new ReviewWindows<object>()
  const first = {}, second = {}
  const context = { kind: 'review' as const, link: { id: 42, project: 'demo', patchSet: 3 }, subject: 'Subject', connection: 1 }
  registry.add(10, first, context)
  registry.add(11, second, context)
  assert.equal(registry.size, 2)
  assert.notEqual(registry.get(10)?.context.instanceId, registry.get(11)?.context.instanceId)
  const token = registry.requestClose(10)!
  assert.equal(registry.requestClose(10), undefined)
  assert.equal(registry.finishClose(11, token), undefined)
  assert.equal(registry.finishClose(10, token), first)
  registry.delete(10)
  assert.equal(registry.size, 1)
  assert.equal(registry.get(11)?.window, second)
})

test('review roles reject other changes, board controls, and stale connection operations', () => {
  const registry = new ReviewWindows<object>()
  registry.add(10, {}, { kind: 'review', connection: 2, link: { id: 42, project: 'demo', patchSet: 3 } })
  const check = (channel: string, args: unknown[] = [], connection = 2) => registry.authorize(10, channel, args, connection)
  check('gerrit:reviewDiff', [{ id: 42, project: 'demo', patchSet: 1 }])
  check('gerrit:reviewDiscussion', [42])
  for (const channel of ['gerrit:fetchDashboard', 'window:openReview', 'ui:setCompact', 'ui:badge', 'gerrit:setPretend', 'connection:open']) assert.throws(() => check(channel), /limited/)
  assert.throws(() => check('gerrit:reviewDiscussion', [99]), /selected change/)
  assert.throws(() => check('gerrit:reviewFiles', [{ id: 42, project: 'other' }]), /selected change/)
  assert.throws(() => check('gerrit:submitReview', [{ id: 42 }], 3), /Connection changed/)
  assert.throws(() => check('settings:patch', [{ username: 'bob' }]), /appearance/)
  check('settings:patch', [{ diffTheme: 'dark' }])
  registry.delete(10)
  assert.equal(registry.get(10), undefined)
})
