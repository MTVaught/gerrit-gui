import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ago } from './time.ts'

describe('ago', () => {
  const now = Date.parse('2026-09-17T12:00:00Z')
  const at = (hoursBefore: number) => new Date(now - hoursBefore * 3600_000)

  it('shows hours only below 24', () => {
    assert.equal(ago(at(23), now), '23h ago')
    assert.equal(ago(at(23.6), now), '1d ago')
  })

  it('rolls over to whole days at 24 hours', () => {
    assert.equal(ago(at(24), now), '1d ago')
    assert.equal(ago(at(47), now), '1d ago')
    assert.equal(ago(at(48), now), '2d ago')
  })
})
