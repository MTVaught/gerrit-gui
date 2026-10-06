// Monaco 0.57 ships these runtime modules without declarations. Keep this
// adapter small; review-diff.test.ts and the packaged UI test cover its contract.
declare module 'monaco-editor/editor/common/core/ranges/lineRange' {
  export class LineRange { constructor(start: number, endExclusive: number); startLineNumber: number; endLineNumberExclusive: number }
}
declare module 'monaco-editor/editor/common/diff/rangeMapping' {
  import type { LineRange } from 'monaco-editor/editor/common/core/ranges/lineRange'
  import type { IRange } from 'monaco-editor/editor/editor.api'
  export class RangeMapping { constructor(original: IRange, modified: IRange); originalRange: IRange; modifiedRange: IRange }
  export class DetailedLineRangeMapping {
    constructor(original: LineRange, modified: LineRange, innerChanges?: RangeMapping[])
    original: LineRange; modified: LineRange; innerChanges?: RangeMapping[]
  }
}
declare module 'monaco-editor/editor/common/diff/defaultLinesDiffComputer/defaultLinesDiffComputer' {
  import type { DetailedLineRangeMapping } from 'monaco-editor/editor/common/diff/rangeMapping'
  export class DefaultLinesDiffComputer {
    computeDiff(original: string[], modified: string[], options: { ignoreTrimWhitespace: boolean; maxComputationTimeMs: number; computeMoves: boolean }): { changes: DetailedLineRangeMapping[]; hitTimeout: boolean }
  }
}

declare module 'monaco-editor/editor/standalone/browser/standaloneServices' {
  export const StandaloneServices: { initialize(overrides: Record<string, unknown>): unknown }
}
