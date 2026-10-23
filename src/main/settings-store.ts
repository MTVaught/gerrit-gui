import type { BadgeStyle, DiffThemePreference, MergerRule, SettingsInput, SettingsStatus, SlackWorkspace, Team, ThemePreference, TrayClickAction, UiState } from '../shared/types.ts'
import { parseReviewPreferences, patchReviewPreferences, type ReviewPreferences } from '../shared/review-preferences.ts'
import { readSettingsFile, writeSettingsFile } from './settings-file.ts'
import { requireReplacementPassword, sameCredentialIdentity } from '../shared/credentials.ts'
import { allowLocalTestHttp } from './transport-policy.ts'
import { SecretStorage, type CredentialIdentity, type SecretBackend } from './secret-storage.ts'
import { normalizeDiffTheme, normalizeTheme } from '../shared/theme.ts'
import { normalizeServerUrl } from '../shared/url.ts'
import { normalizeMergers, normalizePrimaryTeam, normalizeSlackWorkspaces, normalizeTeams, storedTeams } from '../shared/model.ts'

export interface StoredSettings {
  diffTheme?: DiffThemePreference
  theme?: ThemePreference
  serverUrl: string
  username: string
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
  separateReviewWindows?: boolean
  reviewPreferences?: ReviewPreferences
  showTrayCounts?: boolean
  trayClickAction?: TrayClickAction
  /** Legacy plaintext or base64 ciphertext. New secrets require an OS keychain. */
  password?: string
  passwordEncrypted?: boolean
  passwordStorageVersion?: number
  passwordIdentity?: CredentialIdentity
  ui?: UiState
}

/** One instance per process. Browser environment passwords never enter the disk settings. */
export function settingsStore(file: string, backend?: SecretBackend, env: NodeJS.ProcessEnv = {}) {
  const secrets = new SecretStorage(backend)
  // Copy credentials at construction. Later process.env changes cannot rebind them.
  const environment = { serverUrl: env.GERRIT_URL, username: env.GERRIT_USER, password: env.GERRIT_PASSWORD }
  const empty = () => ({ serverUrl: '', username: '', projects: [] })
  const raw = async (): Promise<StoredSettings> => await readSettingsFile<StoredSettings>(file) ?? empty()
  const environmentIdentity = environment.password ? raw().then(effective) : undefined
  // Serialize reads, migrations and writes, including window-state writes.
  let version = 0
  let pending: Promise<unknown> = Promise.resolve()
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const result = pending.then(fn)
    pending = result.catch(() => undefined)
    return result
  }
  async function migrate(s: StoredSettings): Promise<StoredSettings> {
    const migration = secrets.migrate(s)
    if (migration.changed) await writeSettingsFile(file, migration.stored)
    migration.commit()
    return migration.stored
  }
  async function read(): Promise<StoredSettings> { return migrate(await raw()) }
  function effective(s: StoredSettings): CredentialIdentity {
    let serverUrl = environment.serverUrl || s.serverUrl
    try { serverUrl = normalizeServerUrl(serverUrl, allowLocalTestHttp()) } catch {
      // Invalid legacy/override URLs remain visible. Credentials still validate transport.
    }
    return { serverUrl, username: (environment.username || s.username).trim() }
  }
  async function environmentPassword(identity: CredentialIdentity): Promise<string | undefined> {
    return environment.password && environmentIdentity && sameCredentialIdentity(await environmentIdentity, identity) ? environment.password : undefined
  }
  async function getStatus(): Promise<SettingsStatus> {
    const stored = await read()
    const identity = effective(stored)
    const s = { ...stored, ...identity }
    return {
      version,
      theme: normalizeTheme(s.theme),
      diffTheme: normalizeDiffTheme(s.diffTheme),
      serverUrl: s.serverUrl,
      username: s.username,
      projects: s.projects ?? [],
      ...storedTeams(s),
      mergers: s.mergers ?? [],
      badgeStyle: s.badgeStyle ?? 'color',
      showZeroCounts: s.showZeroCounts ?? false,
      compactOnTop: s.compactOnTop ?? true,
      slackWorkspaces: s.slackWorkspaces ?? [],
      showAppBadge: s.showAppBadge ?? true,
      showTrayCounts: s.showTrayCounts ?? true,
      trayClickAction: s.trayClickAction === 'my-reviews' ? 'my-reviews' : 'menu',
      localReview: s.localReview === true,
      separateReviewWindows: s.separateReviewWindows === true,
      ...secrets.status(stored, identity, await environmentPassword(identity)),
    }
  }

  async function getCredentials(): Promise<{ serverUrl: string; username: string; password: string } | null> {
    const stored = await raw()
    const identity = effective(stored)
    if (!identity.serverUrl) return null
    const serverUrl = normalizeServerUrl(identity.serverUrl, allowLocalTestHttp())
    // Authorize transport before decrypting or migrating any saved credential.
    const ready = await migrate(stored)
    const password = await environmentPassword(identity) || secrets.password(ready, identity)
    if (!identity.username || !password) return null
    return { serverUrl, username: identity.username, password }
  }

  async function save(input: SettingsInput): Promise<void> {
    const serverUrl = normalizeServerUrl(input.serverUrl, allowLocalTestHttp())
    const prev = await raw()
    const identity = effective(prev)
    if (environmentIdentity && !sameCredentialIdentity(await environmentIdentity, input)) {
      throw new Error('Connection credentials are set by GERRIT_PASSWORD. To change the server origin or username, update GERRIT_URL, GERRIT_USER and GERRIT_PASSWORD in the environment and restart browser mode.')
    }
    const usable = await environmentPassword(identity) || secrets.password(prev, identity)
    // A locked saved copy also requires replacement for its current identity.
    requireReplacementPassword({ ...identity, password: usable || (prev.password && secrets.matches(prev, identity) ? 'retained' : undefined) }, input)
    const next: StoredSettings = {
      theme: normalizeTheme(input.theme),
      diffTheme: normalizeDiffTheme(input.diffTheme),
      serverUrl,
      username: input.username.trim(),
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
      separateReviewWindows: input.separateReviewWindows === true,
      reviewPreferences: prev.reviewPreferences,
      password: prev.password,
      passwordEncrypted: prev.passwordEncrypted,
      passwordStorageVersion: prev.passwordStorageVersion,
      ui: prev.ui,
    }
    const update = secrets.prepare(prev, next, input.password)
    await writeSettingsFile(file, update.stored)
    update.commit()
    version++
  }

  async function getUi(): Promise<UiState> {
    return (await read()).ui ?? { compact: false }
  }

  async function saveUi(patch: Partial<UiState>): Promise<UiState> {
    const prev = await raw()
    const cleanup = secrets.migrate(prev)
    const ui: UiState = { ...(prev.ui ?? { compact: false }), ...patch }
    await writeSettingsFile(file, { ...cleanup.stored, ui })
    cleanup.commit()
    return ui
  }

  async function patch(input: Partial<SettingsInput>): Promise<SettingsStatus> {
    const current = await getStatus()
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid settings patch')
    for (const [name, value] of Object.entries(input)) {
      if (name === 'version' || name === 'hasPassword' || name === 'encrypted') throw new Error('Invalid settings field')
      if (!(name in current) && name !== 'password') throw new Error('Unknown settings field')
      const previous = current[name as keyof SettingsStatus]
      if (previous !== undefined && typeof value !== typeof previous) throw new Error('Invalid settings value')
      if (Array.isArray(previous) && !Array.isArray(value)) throw new Error('Invalid settings list')
    }
    await save({ ...current, ...input })
    return getStatus()
  }
  async function getReviewPreferences(legacy?: unknown) {
    const stored = await raw()
    if (!stored.reviewPreferences) {
      stored.reviewPreferences = parseReviewPreferences(legacy)
      await writeSettingsFile(file, stored)
      version++
    }
    return { version, value: parseReviewPreferences(stored.reviewPreferences) }
  }
  async function patchPreferences(patch: Partial<ReviewPreferences>) {
    const stored = await raw()
    const value = patchReviewPreferences(parseReviewPreferences(stored.reviewPreferences), patch)
    await writeSettingsFile(file, { ...stored, reviewPreferences: value })
    return { version: ++version, value }
  }
  return {
    patch: (input: Partial<SettingsInput>) => serial(() => patch(input)),
    getReviewPreferences: (legacy?: unknown) => serial(() => getReviewPreferences(legacy)),
    patchReviewPreferences: (input: Partial<ReviewPreferences>) => serial(() => patchPreferences(input)),
    getStatus: () => serial(getStatus),
    getCredentials: () => serial(getCredentials),
    save: (input: SettingsInput) => serial(() => save(input)),
    getUi: () => serial(getUi),
    saveUi: (patch: Partial<UiState>) => serial(() => saveUi(patch)),
  }
}
