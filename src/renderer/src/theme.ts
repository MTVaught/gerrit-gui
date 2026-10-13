import { useLayoutEffect } from 'react'
import type { ThemePreference } from '../../shared/types.ts'
import { resolveTheme } from '../../shared/theme.ts'

export function useTheme(preference: ThemePreference = 'system'): void {
  useLayoutEffect(() => {
    const appearance = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(preference, appearance.matches)
    }
    apply()
    appearance.addEventListener('change', apply)
    return () => appearance.removeEventListener('change', apply)
  }, [preference])
}
