import { DefaultLinesDiffComputer } from 'monaco-editor/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer'
import { normalizeReviewLine, reviewSourceColumn, type ReviewWhitespace } from './review-preferences.ts'
import type { IRange } from 'monaco-editor/editor/editor.api'

export interface ReviewDiffRequest { id: number; original: string[]; modified: string[]; whitespace: ReviewWhitespace; timeout: number }
export interface ReviewDiffResult {
  id: number
  identical: boolean
  quitEarly: boolean
  changes: { original: [number, number]; modified: [number, number]; innerChanges: { original: IRange; modified: IRange }[] }[]
}
export function computeReviewDiff(request: ReviewDiffRequest): ReviewDiffResult {
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
