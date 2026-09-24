import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BadgeStyle, MergerRule, SettingsInput, SettingsStatus, SlackWorkspace, Team, UiState } from '../shared/types.ts'
import { normalizeServerUrl } from '../shared/url.ts'
import { normalizeMergers, normalizePrimaryTeam, normalizeSlackWorkspaces, normalizeTeams, storedTeams } from '../shared/model.ts'

interface StoredSettings {
  serverUrl: string
  username: string
  projects?: string[]
  /** Before teams had names: one list, the user's own team. Read as the primary team named "Team". */
  team?: string[]
  teams?: Team[]
  primaryTeam?: string
  includeOwnTeam?: boolean
  mergers?: MergerRule[]
  badgeStyle?: BadgeStyle
  showZeroCounts?: boolean
  compactOnTop?: boolean
  slackWorkspaces?: SlackWorkspace[]
  showAppBadge?: boolean
  showTrayCounts?: boolean
  /** base64 of safeStorage ciphertext, or plaintext when no keychain is available. */
  password?: string
  passwordEncrypted?: boolean
  ui?: UiState
}

function file(): string {
  return path.join(app.getPath('userData'), 'settings.json')
}

async function read(): Promise<StoredSettings> {
  try {
    return JSON.parse(await fs.readFile(file(), 'utf8')) as StoredSettings
  } catch {
    return { serverUrl: '', username: '', projects: [] }
  }
}

export async function getStatus(): Promise<SettingsStatus> {
  const s = await read()
  return {
    serverUrl: s.serverUrl,
    username: s.username,
    projects: s.projects ?? [],
    ...storedTeams(s),
    includeOwnTeam: s.includeOwnTeam ?? false,
    mergers: s.mergers ?? [],
    badgeStyle: s.badgeStyle ?? 'color',
    showZeroCounts: s.showZeroCounts ?? false,
    compactOnTop: s.compactOnTop ?? true,
    slackWorkspaces: s.slackWorkspaces ?? [],
    showAppBadge: s.showAppBadge ?? true,
    showTrayCounts: s.showTrayCounts ?? true,
    hasPassword: Boolean(s.password),
    encrypted: safeStorage.isEncryptionAvailable(),
  }
}

export async function getCredentials(): Promise<{ serverUrl: string; username: string; password: string } | null> {
  const s = await read()
  if (!s.serverUrl || !s.username || !s.password) return null
  const password = s.passwordEncrypted
    ? safeStorage.decryptString(Buffer.from(s.password, 'base64'))
    : s.password
  return { serverUrl: s.serverUrl, username: s.username, password }
}

export async function save(input: SettingsInput): Promise<void> {
  const prev = await read()
  const next: StoredSettings = {
    serverUrl: normalizeServerUrl(input.serverUrl),
    username: input.username.trim(),
    projects: input.projects.map((p) => p.trim()).filter(Boolean),
    teams: normalizeTeams(input.teams),
    primaryTeam: normalizePrimaryTeam(input.primaryTeam, normalizeTeams(input.teams)),
    includeOwnTeam: input.includeOwnTeam === true,
    mergers: normalizeMergers(input.mergers ?? []),
    badgeStyle: input.badgeStyle,
    showZeroCounts: input.showZeroCounts,
    compactOnTop: input.compactOnTop,
    slackWorkspaces: normalizeSlackWorkspaces(input.slackWorkspaces ?? []),
    showAppBadge: input.showAppBadge,
    showTrayCounts: input.showTrayCounts,
    password: prev.password,
    passwordEncrypted: prev.passwordEncrypted,
    ui: prev.ui,
  }
  if (input.password) {
    if (safeStorage.isEncryptionAvailable()) {
      next.password = safeStorage.encryptString(input.password).toString('base64')
      next.passwordEncrypted = true
    } else {
      next.password = input.password
      next.passwordEncrypted = false
    }
  }
  await fs.mkdir(path.dirname(file()), { recursive: true })
  await fs.writeFile(file(), JSON.stringify(next, null, 2), { mode: 0o600 })
}

export async function getUi(): Promise<UiState> {
  return (await read()).ui ?? { compact: false }
}

export async function saveUi(patch: Partial<UiState>): Promise<UiState> {
  const prev = await read()
  const ui: UiState = { ...(prev.ui ?? { compact: false }), ...patch }
  await fs.mkdir(path.dirname(file()), { recursive: true })
  await fs.writeFile(file(), JSON.stringify({ ...prev, ui }, null, 2), { mode: 0o600 })
  return ui
}
