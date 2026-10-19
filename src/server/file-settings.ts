// Browser passwords stay in server memory. Environment passwords are never saved.
import os from 'node:os'
import path from 'node:path'
import { settingsStore } from '../main/settings-store.ts'
import type { SettingsStore } from '../main/service.ts'

export function fileSettings(file = path.join(os.homedir(), '.config', 'gerrit-gui', 'web-settings.json'), env: NodeJS.ProcessEnv = process.env): SettingsStore {
  return settingsStore(file, undefined, env)
}
