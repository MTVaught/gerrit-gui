import { useLayoutEffect, useSyncExternalStore } from 'react'
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

function subscribeAppearance(onChange: () => void) {
  const appearance = window.matchMedia('(prefers-color-scheme: dark)')
  appearance.addEventListener('change', onChange)
  return () => appearance.removeEventListener('change', onChange)
}

export function useResolvedTheme(preference: ThemePreference = 'system'): 'light' | 'dark' {
  const systemDark = useSyncExternalStore(subscribeAppearance, () => window.matchMedia('(prefers-color-scheme: dark)').matches)
  return resolveTheme(preference, systemDark)
}
