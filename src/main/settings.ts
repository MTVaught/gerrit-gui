import { app, safeStorage } from 'electron'
import path from 'node:path'
import { settingsStore } from './settings-store.ts'
import type { SettingsInput, UiState } from '../shared/types.ts'

// Resolve userData after Electron is ready. Keep session secrets in this process only.
let storeFile: string | undefined
let store: ReturnType<typeof settingsStore> | undefined
function settings() {
  const file = path.join(app.getPath('userData'), 'settings.json')
  if (store && storeFile === file) return store
  storeFile = file
  return store = settingsStore(file, {
    storage: safeStorage,
    platform: process.platform,
  })
}
export const getStatus = () => settings().getStatus()
export const getCredentials = () => settings().getCredentials()
export const save = (input: SettingsInput) => settings().save(input)
export const patch = (input: Partial<SettingsInput>) => settings().patch(input)
export const getReviewPreferences = (legacy?: unknown) => settings().getReviewPreferences(legacy)
export const patchReviewPreferences = (input: Partial<import('../shared/review-preferences.ts').ReviewPreferences>) => settings().patchReviewPreferences(input)
export const getUi = () => settings().getUi()
export const saveUi = (patch: Partial<UiState>) => settings().saveUi(patch)
