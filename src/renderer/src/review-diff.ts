import { DefaultLinesDiffComputer } from 'monaco-editor/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer'
import { normalizeReviewLine, reviewSourceColumn, type ReviewWhitespace } from './review-preferences.ts'
import type { IRange } from 'monaco-editor/editor/editor.api'
import type { ReviewDiffBlock } from './review.ts'

export interface ReviewDiffRequest { id: number; original: string[]; modified: string[]; whitespace: ReviewWhitespace; timeout: number; blocks?: ReviewDiffBlock[] }
export interface ReviewDiffResult {
  id: number
  identical: boolean
  quitEarly: boolean
  changes: { original: [number, number]; modified: [number, number]; innerChanges: { original: IRange; modified: IRange }[] }[]
}
export function computeReviewDiff(request: ReviewDiffRequest): ReviewDiffResult {
  if (request.blocks) return computeGerritDiff(request)
  const { original, modified, whitespace } = request
  const a = original.map((line) => normalizeReviewLine(line, whitespace))
  const b = modified.map((line) => normalizeReviewLine(line, whitespace))
  const result = new DefaultLinesDiffComputer().computeDiff(a, b, {
    ignoreTrimWhitespace: false, computeMoves: false, maxComputationTimeMs: request.timeout,
  })
  function sourceRange(range: IRange, lines: string[]): IRange {
    return { ...range,
      startColumn: reviewSourceColumn(lines[range.startLineNumber - 1] ?? '', range.startColumn, whitespace),
      endColumn: reviewSourceColumn(lines[range.endLineNumber - 1] ?? '', range.endColumn, whitespace),
    }
  }
  return { id: request.id, identical: original.length === modified.length && original.every((line, i) => line === modified[i]), quitEarly: result.hitTimeout,
    changes: result.changes.map((c) => ({
      original: [c.original.startLineNumber, c.original.endLineNumberExclusive],
      modified: [c.modified.startLineNumber, c.modified.endLineNumberExclusive],
      innerChanges: (c.innerChanges ?? []).map((r) => ({ original: sourceRange(r.originalRange, original), modified: sourceRange(r.modifiedRange, modified) })),
    })),
  }
}

/** Gerrit anchors unchanged lines. Never match repeated code across those anchors. */
function computeGerritDiff(request: ReviewDiffRequest): ReviewDiffResult {
  const changes: ReviewDiffResult['changes'] = []
  const deadline = request.timeout > 0 ? Date.now() + request.timeout : Infinity
  let quitEarly = false
  function append(change: ReviewDiffResult['changes'][number]) {
    const previous = changes.at(-1)
    // Monaco requires an unchanged line between hunks. Joining adjacent server
    // chunks keeps their alignment and separate rebase metadata intact.
    if (previous && previous.original[1] === change.original[0] && previous.modified[1] === change.modified[0]) {
      previous.original[1] = change.original[1]
      previous.modified[1] = change.modified[1]
      for (const inner of change.innerChanges) previous.innerChanges.push(inner)
    } else changes.push(change)
  }
  for (const block of request.blocks!) {
    const aOffset = block.original[0] - 1
    const bOffset = block.modified[0] - 1
    const original = request.original.slice(aOffset, block.original[1] - 1)
    const modified = request.modified.slice(bOffset, block.modified[1] - 1)
    const remaining = deadline - Date.now()
    if (!original.length || !modified.length || remaining <= 0) {
      quitEarly ||= remaining <= 0
      append({ original: [...block.original], modified: [...block.modified], innerChanges: [] })
      continue
    }
    const local = computeReviewDiff({ ...request, blocks: undefined, original, modified, timeout: Number.isFinite(remaining) ? remaining : 0 })
    quitEarly ||= local.quitEarly
    const offset = (range: IRange, lines: number): IRange => ({ ...range, startLineNumber: range.startLineNumber + lines, endLineNumber: range.endLineNumber + lines })
    const innerChanges = (change: ReviewDiffResult['changes'][number]) => change.innerChanges.map(r => ({ original: offset(r.original, aOffset), modified: offset(r.modified, bOffset) }))
    if (request.whitespace === 'IGNORE_NONE') {
      append({ original: [...block.original], modified: [...block.modified], innerChanges: local.changes.flatMap(innerChanges) })
    } else {
      for (const change of local.changes) append({
        original: [change.original[0] + aOffset, change.original[1] + aOffset],
        modified: [change.modified[0] + bOffset, change.modified[1] + bOffset],
        innerChanges: innerChanges(change),
      })
    }
  }
  return { id: request.id, identical: request.original.length === request.modified.length && request.original.every((line, i) => line === request.modified[i]), quitEarly, changes }
}
