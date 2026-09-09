import { app, safeStorage } from 'electron'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BadgeStyle, SettingsInput, SettingsStatus, UiState } from '../shared/types.ts'
import { normalizeServerUrl } from '../shared/url.ts'
import { normalizeTeam } from '../shared/model.ts'

interface StoredSettings {
  serverUrl: string
  username: string
  projects?: string[]
  team?: string[]
  badgeStyle?: BadgeStyle
  showZeroCounts?: boolean
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
    team: s.team ?? [],
    badgeStyle: s.badgeStyle ?? 'color',
    showZeroCounts: s.showZeroCounts ?? false,
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
    team: normalizeTeam(input.team),
    badgeStyle: input.badgeStyle,
    showZeroCounts: input.showZeroCounts,
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
