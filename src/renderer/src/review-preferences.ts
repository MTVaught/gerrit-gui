import { defaultReviewPreferences, parseReviewPreferences, type ReviewPreferences, type ReviewWhitespace } from '../../shared/review-preferences.ts'
export * from '../../shared/review-preferences.ts'
const key = 'local-review-diff-preferences'
export function loadReviewPreferences(): ReviewPreferences {
  try { return parseReviewPreferences(JSON.parse(localStorage.getItem(key) ?? 'null')) }
  catch { return { ...defaultReviewPreferences } }
}
export function saveReviewPreferences(preferences: ReviewPreferences): void {
  localStorage.setItem(key, JSON.stringify(preferences))
}

export type ReviewPreferenceErrors = Partial<Record<keyof ReviewPreferences | 'diffTheme', string>>
export type ChangeReviewPreference = <K extends keyof ReviewPreferences>(name: K, value: ReviewPreferences[K]) => boolean

/** Publish only validated, persisted changes. The caller retains its current state on failure. */
export function updateReviewPreference<K extends keyof ReviewPreferences>(
  current: ReviewPreferences, name: K, value: ReviewPreferences[K],
  persist: (preferences: ReviewPreferences) => void = saveReviewPreferences,
): ReviewPreferences {
  const next = parseReviewPreferences({ ...current, [name]: value })
  if (next[name] !== value) throw new Error('Invalid review preference')
  persist(next)
  return next
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
