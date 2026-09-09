// Settings store for browser mode: a plain JSON file, password in clear text
// (there is no OS keychain to lean on outside Electron). Mode 0600.
// Environment variables GERRIT_URL / GERRIT_USER / GERRIT_PASSWORD override it.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BadgeStyle, SettingsInput, SettingsStatus } from '../shared/types.ts'
import { normalizeServerUrl } from '../shared/url.ts'
import { normalizeTeam } from '../shared/model.ts'
import type { Credentials, SettingsStore } from '../main/service.ts'

interface Stored {
  serverUrl: string
  username: string
  password?: string
  projects?: string[]
  team?: string[]
  badgeStyle?: BadgeStyle
  showZeroCounts?: boolean
  showAppBadge?: boolean
  showTrayCounts?: boolean
}

export function fileSettings(file = path.join(os.homedir(), '.config', 'gerrit-gui', 'web-settings.json')): SettingsStore {
  async function read(): Promise<Stored> {
    let s: Stored = { serverUrl: '', username: '', projects: [] }
    try {
      s = JSON.parse(await fs.readFile(file, 'utf8')) as Stored
    } catch {
      // first run
    }
    const env = process.env
    if (env['GERRIT_URL']) s.serverUrl = normalizeServerUrl(env['GERRIT_URL'])
    if (env['GERRIT_USER']) s.username = env['GERRIT_USER']
    if (env['GERRIT_PASSWORD']) s.password = env['GERRIT_PASSWORD']
    return s
  }
  return {
    async getStatus(): Promise<SettingsStatus> {
      const s = await read()
      return { serverUrl: s.serverUrl, username: s.username, projects: s.projects ?? [], team: s.team ?? [], badgeStyle: s.badgeStyle ?? 'color', showZeroCounts: s.showZeroCounts ?? false, showAppBadge: s.showAppBadge ?? true, showTrayCounts: s.showTrayCounts ?? true, hasPassword: Boolean(s.password), encrypted: false }
    },
    async getCredentials(): Promise<Credentials | null> {
      const s = await read()
      return s.serverUrl && s.username && s.password ? { serverUrl: s.serverUrl, username: s.username, password: s.password } : null
    },
    async save(input: SettingsInput): Promise<void> {
      const prev = await read()
      const next: Stored = {
        serverUrl: normalizeServerUrl(input.serverUrl),
        username: input.username.trim(),
        password: input.password || prev.password,
        projects: input.projects.map((p) => p.trim()).filter(Boolean),
        team: normalizeTeam(input.team),
        badgeStyle: input.badgeStyle,
        showZeroCounts: input.showZeroCounts,
        showAppBadge: input.showAppBadge,
        showTrayCounts: input.showTrayCounts,
      }
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(next, null, 2), { mode: 0o600 })
    },
  }
}
