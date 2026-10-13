import type { ThemePreference } from './types.ts'

export function normalizeTheme(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system'
}

export function resolveTheme(value: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return value === 'system' ? (systemDark ? 'dark' : 'light') : value
}
