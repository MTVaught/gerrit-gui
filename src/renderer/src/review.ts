import type { ReviewDiff } from '../../shared/types.ts'

export interface DiffRow {
  a?: string
  b?: string
  lineA?: number
  lineB?: number
  changed: boolean
}

/** Preserve every line, including empty lines, and align additions/deletions. */
export function diffRows(diff: ReviewDiff): DiffRow[] {
  const rows: DiffRow[] = []
  let lineA = 0
  let lineB = 0
  for (const chunk of diff.content) {
    if (chunk.skip) throw new Error('The diff is missing file content')
    if (chunk.ab) {
      for (const text of chunk.ab) rows.push({ a: text, b: text, lineA: ++lineA, lineB: ++lineB, changed: false })
    } else {
      for (let i = 0; i < Math.max(chunk.a?.length ?? 0, chunk.b?.length ?? 0); i++) {
        const a = chunk.a?.[i]
        const b = chunk.b?.[i]
        rows.push({ a, b, lineA: a === undefined ? undefined : ++lineA, lineB: b === undefined ? undefined : ++lineB, changed: true })
      }
    }
  }
  return rows
}

export const REVIEW_ROW_HEIGHT = 22
export function visibleRows(top: number, height: number, total: number): [number, number] {
  return [Math.max(0, Math.floor(top / REVIEW_ROW_HEIGHT) - 12), Math.min(total, Math.ceil((top + height) / REVIEW_ROW_HEIGHT) + 12)]
}

export function findReviewRow(rows: DiffRow[], query: string, start: number, direction: 1 | -1): number {
  if (!query || !rows.length) return -1
  const needle = query.toLowerCase()
  for (let step = 1; step <= rows.length; step++) {
    const index = ((start + step * direction) % rows.length + rows.length) % rows.length
    const row = rows[index]!
    if (row.a?.toLowerCase().includes(needle) || row.b?.toLowerCase().includes(needle)) return index
  }
  return -1
}
