import type { FixSuggestion, ReviewComment } from '../../shared/types.ts'

/** Gerrit's fenced suggestions replace the exact commented range. */
export function commentSuggestions(comment: ReviewComment): FixSuggestion[] {
  const suggestions = [...(comment.fix_suggestions ?? [])]
  const sourceLine = comment.context_lines?.find(source => source.line_number === comment.line)?.context_line
  const range = comment.range ?? (comment.line && sourceLine !== undefined ? { start_line: comment.line, start_character: 0, end_line: comment.line, end_character: sourceLine.length } : undefined)
  if (!range || comment.side === 'PARENT') return suggestions
  for (const match of (comment.message ?? '').matchAll(/^```suggestion[ \t]*\n([\s\S]*?)^```\s*$/gm)) {
    suggestions.push({ description: 'Suggested change', replacements: [{ path: comment.path, range, replacement: match[1]!.replace(/\n$/, '') }] })
  }
  return suggestions
}
export function commentDate(value: string): Date { return new Date(value.replace(' ', 'T').replace(/(\.\d{3})\d+/, '$1') + (/[zZ]|[+-]\d\d:\d\d$/.test(value) ? '' : 'Z')) }
export function relativeCommentDate(value: string, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor((now - commentDate(value).getTime()) / 1000))
  if (!Number.isFinite(seconds)) return value
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return formatter.format(-Math.floor(seconds / 60), 'minute')
  if (seconds < 86400) return formatter.format(-Math.floor(seconds / 3600), 'hour')
  return formatter.format(-Math.floor(seconds / 86400), 'day')
}
/** A bounded local declaration index, useful even without a language server. */
export function reviewOutline(text: string): { line: number; name: string }[] {
  const items: { line: number; name: string }[] = []
  let line = 0
  for (const match of text.matchAll(/^.*$/gm)) {
    const source = match[0]
    line++
    if (/^\s*(?:(?:export|public|private|protected|static|async|abstract|final|internal|pub)\s+)*(?:(?:class|interface|enum|struct|trait|impl|namespace|module|function|def|fn|func)\s+\w|(?:const|let|var)\s+\w+\s*=\s*(?:async\s+)?(?:\([^)]*\)|\w+)\s*=>|(?:[\w<>[\],?]+\s+)?(?!if\b|for\b|while\b|switch\b|catch\b)\w+\s*\([^;]*\)\s*(?::\s*[^={]+)?(?:throws\s+[\w, ]+)?\s*\{)/.test(source)) {
      items.push({ line, name: source.trim().slice(0, 160) })
      if (items.length === 2000) break
    }
  }
  return items
}
