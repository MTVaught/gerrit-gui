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

export function patchReviewPreferences(current: ReviewPreferences, patch: Partial<ReviewPreferences>): ReviewPreferences {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('Invalid review preferences')
  const next = parseReviewPreferences({ ...current, ...patch })
  for (const [name, value] of Object.entries(patch)) {
    if (!(name in current) || next[name as keyof ReviewPreferences] !== value) throw new Error('Invalid review preference')
  }
  return next
}
