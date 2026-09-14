// The saved settings, for the parts of the board that read or write them
// without going through the Settings panel: the merger picker reads the
// mergers list and can add a one-off pick to it.
import { createContext, useContext } from 'react'
import type { SettingsInput, SettingsStatus } from '../../shared/types.ts'

export interface SettingsHandle {
  settings: SettingsStatus | null
  /** Save these fields over the current settings and reload them. */
  save: (patch: Partial<SettingsInput>) => Promise<void>
}

export const SettingsContext = createContext<SettingsHandle>({ settings: null, save: async () => undefined })

export function useSettings(): SettingsHandle {
  return useContext(SettingsContext)
}
