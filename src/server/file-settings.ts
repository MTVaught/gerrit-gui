// Settings store for browser mode: a plain JSON file, password in clear text
// (there is no OS keychain to lean on outside Electron). Mode 0600.
// Environment variables GERRIT_URL / GERRIT_USER / GERRIT_PASSWORD override it.
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { BadgeStyle, DiffThemePreference, MergerRule, SettingsInput, SettingsStatus, SlackWorkspace, Team, ThemePreference, TrayClickAction } from '../shared/types.ts'
import { normalizeDiffTheme, normalizeTheme } from '../shared/theme.ts'
import { normalizeServerUrl } from '../shared/url.ts'
import { requireReplacementPassword, sameCredentialIdentity } from '../shared/credentials.ts'
import { normalizeMergers, normalizePrimaryTeam, normalizeSlackWorkspaces, normalizeTeams, storedTeams } from '../shared/model.ts'
import type { Credentials, SettingsStore } from '../main/service.ts'

interface Stored {
  diffTheme?: DiffThemePreference
  theme?: ThemePreference
  serverUrl: string
  username: string
  password?: string
  projects?: string[]
  /** Before teams had names: one list, the user's own team. Read as the primary team named "Team". */
  team?: string[]
  teams?: Team[]
  primaryTeam?: string
  mergers?: MergerRule[]
  badgeStyle?: BadgeStyle
  showZeroCounts?: boolean
  compactOnTop?: boolean
  slackWorkspaces?: SlackWorkspace[]
  showAppBadge?: boolean
  localReview?: boolean
  showTrayCounts?: boolean
  trayClickAction?: TrayClickAction
}

export function fileSettings(file = path.join(os.homedir(), '.config', 'gerrit-gui', 'web-settings.json')): SettingsStore {
  // Environment credentials are bound to the identity at store startup. A
  // password-only override must not follow later edits to the file's identity.
  const env = {
    serverUrl: process.env['GERRIT_URL'],
    username: process.env['GERRIT_USER'],
    password: process.env['GERRIT_PASSWORD'],
  }
  async function readStored(): Promise<Stored> {
    let s: Stored = { serverUrl: '', username: '', projects: [] }
    try {
      s = JSON.parse(await fs.readFile(file, 'utf8')) as Stored
    } catch {
      // first run
    }
    return s
  }
  function effectiveIdentity(s: Stored) {
    return {
      serverUrl: normalizeServerUrl(env.serverUrl || s.serverUrl),
      username: (env.username || s.username).trim(),
    }
  }
  const environmentIdentity = env.password ? readStored().then(effectiveIdentity) : null
  async function read(): Promise<Stored> {
    const stored = await readStored()
    const identity = effectiveIdentity(stored)
    let password = sameCredentialIdentity(stored, identity) ? stored.password : undefined
    if (env.password && environmentIdentity && sameCredentialIdentity(await environmentIdentity, identity)) {
      password = env.password
    }
    return { ...stored, ...identity, password }
  }
  return {
    async getStatus(): Promise<SettingsStatus> {
      const s = await read()
      return { theme: normalizeTheme(s.theme), diffTheme: normalizeDiffTheme(s.diffTheme), serverUrl: s.serverUrl, username: s.username, projects: s.projects ?? [], ...storedTeams(s), mergers: s.mergers ?? [], badgeStyle: s.badgeStyle ?? 'color', showZeroCounts: s.showZeroCounts ?? false, showAppBadge: s.showAppBadge ?? true, showTrayCounts: s.showTrayCounts ?? true, trayClickAction: s.trayClickAction === 'my-reviews' ? 'my-reviews' : 'menu', localReview: s.localReview === true, compactOnTop: s.compactOnTop ?? true, slackWorkspaces: s.slackWorkspaces ?? [], hasPassword: Boolean(s.password), encrypted: false }
    },
    async getCredentials(): Promise<Credentials | null> {
      const s = await read()
      return s.serverUrl && s.username && s.password ? { serverUrl: s.serverUrl, username: s.username, password: s.password } : null
    },
    async save(input: SettingsInput): Promise<void> {
      const prev = await read()
      if (environmentIdentity && !sameCredentialIdentity(await environmentIdentity, input)) {
        throw new Error('Connection credentials are set by GERRIT_PASSWORD. To change the server origin or username, update GERRIT_URL, GERRIT_USER and GERRIT_PASSWORD in the environment and restart browser mode.')
      }
      requireReplacementPassword(prev, input)
      const next: Stored = {
        theme: normalizeTheme(input.theme),
        diffTheme: normalizeDiffTheme(input.diffTheme),
        serverUrl: normalizeServerUrl(input.serverUrl),
        username: input.username.trim(),
        password: input.password || prev.password,
        projects: input.projects.map((p) => p.trim()).filter(Boolean),
        teams: normalizeTeams(input.teams),
        primaryTeam: normalizePrimaryTeam(input.primaryTeam, normalizeTeams(input.teams)),
            mergers: normalizeMergers(input.mergers ?? []),
        badgeStyle: input.badgeStyle,
        showZeroCounts: input.showZeroCounts,
        compactOnTop: input.compactOnTop,
        slackWorkspaces: normalizeSlackWorkspaces(input.slackWorkspaces ?? []),
        showAppBadge: input.showAppBadge,
        showTrayCounts: input.showTrayCounts,
        trayClickAction: input.trayClickAction === 'my-reviews' ? 'my-reviews' : 'menu',
        localReview: input.localReview === true,
      }
      await fs.mkdir(path.dirname(file), { recursive: true })
      await fs.writeFile(file, JSON.stringify(next, null, 2), { mode: 0o600 })
    },
  }
}
