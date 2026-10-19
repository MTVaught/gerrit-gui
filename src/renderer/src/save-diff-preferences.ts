import type { DiffThemePreference, GerritDiffPreferences } from '../../shared/types.ts'
import { toGerritPreferences, type ReviewPreferences } from './review-preferences.ts'

/** Keep confirmed preferences as the next retry baseline before saving the theme. */
export async function commitDiffPreferences(
  current: ReviewPreferences, next: ReviewPreferences,
  currentTheme: DiffThemePreference, nextTheme: DiffThemePreference,
  writes: {
    saveGerrit(input: GerritDiffPreferences): Promise<unknown>
    saveLocal(input: ReviewPreferences, synced: boolean): void
    saveTheme(theme: DiffThemePreference): Promise<void>
  },
): Promise<void> {
  const gerritChanged = JSON.stringify(toGerritPreferences(current)) !== JSON.stringify(toGerritPreferences(next))
  if (gerritChanged) await writes.saveGerrit(toGerritPreferences(next))
  if (JSON.stringify(current) !== JSON.stringify(next)) writes.saveLocal(next, gerritChanged)
  if (currentTheme !== nextTheme) await writes.saveTheme(nextTheme)
}
