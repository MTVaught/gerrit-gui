import type { DiffThemePreference, ThemePreference } from './types.ts'

export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(value: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value
}

export const diffThemeOptions = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'application', label: 'Follow application' },
] satisfies { value: DiffThemePreference; label: string }[]

export function normalizeDiffTheme(value: unknown): DiffThemePreference {
  return value === 'light' || value === 'dark' ? value : 'application'
}

export function resolveDiffTheme(value: DiffThemePreference, applicationTheme: 'light' | 'dark'): 'light' | 'dark' {
  return value === 'application' ? applicationTheme : value
}
