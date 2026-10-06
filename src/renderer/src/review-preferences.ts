export type ReviewWhitespace = 'IGNORE_NONE' | 'IGNORE_TRAILING' | 'IGNORE_LEADING_AND_TRAILING' | 'IGNORE_ALL'
export interface ReviewPreferences {
  context: number
  fitToScreen: boolean
  diffWidth: number
  tabWidth: number
  fontSize: number
  showTabs: boolean
  showTrailingWhitespace: boolean
  syntaxHighlighting: boolean
  autoMarkReviewed: boolean
  ignoreWhitespace: ReviewWhitespace
}
export const defaultReviewPreferences: ReviewPreferences = {
  context: -1, fitToScreen: true, diffWidth: 100, tabWidth: 4, fontSize: 13,
  showTabs: false, showTrailingWhitespace: true, syntaxHighlighting: true,
  autoMarkReviewed: false, ignoreWhitespace: 'IGNORE_NONE',
}
export const whitespaceOptions = [
  ['IGNORE_NONE', 'None'], ['IGNORE_TRAILING', 'Trailing'],
  ['IGNORE_LEADING_AND_TRAILING', 'Leading and trailing'], ['IGNORE_ALL', 'All'],
] as const
const key = 'local-review-diff-preferences'
export function parseReviewPreferences(value: unknown): ReviewPreferences {
  const result = { ...defaultReviewPreferences }
  if (!value || typeof value !== 'object') return result
  const input = value as Record<string, unknown>
  for (const name of ['fitToScreen', 'showTabs', 'showTrailingWhitespace', 'syntaxHighlighting', 'autoMarkReviewed'] as const) {
    if (typeof input[name] === 'boolean') result[name] = input[name]
  }
  for (const [name, min, max] of [['context', -1, 1000], ['diffWidth', 20, 1000], ['tabWidth', 1, 16], ['fontSize', 8, 32]] as const) {
    const n = input[name]
    if (typeof n === 'number' && Number.isInteger(n) && n >= min && n <= max) result[name] = n
  }
  if (whitespaceOptions.some(([mode]) => mode === input.ignoreWhitespace)) result.ignoreWhitespace = input.ignoreWhitespace as ReviewWhitespace
  return result
}
export function loadReviewPreferences(): ReviewPreferences {
  try { return parseReviewPreferences(JSON.parse(localStorage.getItem(key) ?? 'null')) }
  catch { return { ...defaultReviewPreferences } }
}
export function saveReviewPreferences(preferences: ReviewPreferences): void {
  localStorage.setItem(key, JSON.stringify(preferences))
  localStorage.setItem('local-review-gerrit-preferences-synced', 'true')
}

/** Keep the displayed source untouched; normalization is only for diff computation. */
export function normalizeReviewLine(line: string, mode: ReviewWhitespace): string {
  switch (mode) {
    case 'IGNORE_TRAILING': return line.trimEnd()
    case 'IGNORE_LEADING_AND_TRAILING': return line.trim()
    case 'IGNORE_ALL': return line.replace(/\s/g, '')
    default: return line
  }
}
/** Translate a normalized diff column back to a column in the actual source. */
export function reviewSourceColumn(line: string, column: number, mode: ReviewWhitespace): number {
  if (mode === 'IGNORE_NONE' || mode === 'IGNORE_TRAILING') return Math.min(column, line.length + 1)
  if (mode === 'IGNORE_LEADING_AND_TRAILING') return Math.min(column + line.length - line.trimStart().length, line.length + 1)
  let remaining = column - 1
  for (let i = 0; i < line.length; i++) {
    if (/\s/.test(line[i]!)) continue
    if (remaining === 0) return i + 1
    remaining--
  }
  return line.length + 1
}

export function fromGerritPreferences(input: import('../../shared/types.ts').GerritDiffPreferences, current = defaultReviewPreferences): ReviewPreferences {
  return parseReviewPreferences({ ...current, context: input.context ?? current.context, diffWidth: input.line_length ?? current.diffWidth,
    tabWidth: input.tab_size ?? current.tabWidth, fontSize: input.font_size ?? current.fontSize,
    showTabs: input.show_tabs ?? false, showTrailingWhitespace: input.show_whitespace_errors ?? false,
    syntaxHighlighting: input.syntax_highlighting ?? false, autoMarkReviewed: input.manual_review === undefined ? current.autoMarkReviewed : !input.manual_review,
    ignoreWhitespace: input.ignore_whitespace ?? current.ignoreWhitespace })
}
export function toGerritPreferences(input: ReviewPreferences): import('../../shared/types.ts').GerritDiffPreferences {
  return { context: input.context, line_length: input.diffWidth, tab_size: input.tabWidth, font_size: input.fontSize,
    show_tabs: input.showTabs, show_whitespace_errors: input.showTrailingWhitespace, syntax_highlighting: input.syntaxHighlighting,
    manual_review: !input.autoMarkReviewed, ignore_whitespace: input.ignoreWhitespace }
}

/** Preserve Whole file (or a legacy local choice) until the first account save. */
export function reviewContextIsSynced(): boolean {
  try { return localStorage.getItem('local-review-gerrit-preferences-synced') === 'true' } catch { return false }
}
