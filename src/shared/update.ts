// Update state machine, shared by the main process (which drives it from
// electron-updater events), the renderer and the tray (which show it).
// Nothing here touches Electron, so the transitions are unit-tested.
import type { UpdateState } from './types.ts'

export const RELEASES_URL = 'https://github.com/MTVaught/gerrit-gui/releases'

export function releaseUrl(version: string): string {
  return `${RELEASES_URL}/tag/v${encodeURIComponent(version)}`
}

export function initialUpdateState(currentVersion: string, disabledReason: string | null = null): UpdateState {
  return {
    status: disabledReason ? 'disabled' : 'idle',
    currentVersion,
    availableVersion: null,
    downloadedVersion: null,
    releaseNotes: null,
    releaseUrl: null,
    downloadPercent: null,
    checkedAt: null,
    message: disabledReason,
    errorContext: null,
  }
}

// A downloaded update survives later checks: the installer is on disk and a
// restart still installs it, whatever the next check says.

export function onCheckStart(s: UpdateState, at: string): UpdateState {
  const kept = s.downloadedVersion !== null
  return {
    ...s,
    status: 'checking',
    checkedAt: at,
    releaseNotes: kept ? s.releaseNotes : null,
    releaseUrl: kept ? s.releaseUrl : null,
    downloadPercent: kept ? 100 : null,
    message: null,
    errorContext: null,
  }
}

export function onCheckFailure(s: UpdateState, message: string, at: string): UpdateState {
  if (s.downloadedVersion !== null) {
    return { ...s, status: 'downloaded', checkedAt: at, downloadPercent: 100, message: null, errorContext: null }
  }
  return { ...s, status: 'error', checkedAt: at, downloadPercent: null, message, errorContext: 'check' }
}

export function onAvailable(s: UpdateState, version: string, notes: string | null, at: string): UpdateState {
  const done = s.downloadedVersion === version
  return {
    ...s,
    status: done ? 'downloaded' : 'available',
    availableVersion: version,
    downloadedVersion: done ? version : null,
    releaseNotes: notes ?? (done ? s.releaseNotes : null),
    releaseUrl: releaseUrl(version),
    downloadPercent: done ? 100 : null,
    checkedAt: at,
    message: null,
    errorContext: null,
  }
}

export function onNoUpdate(s: UpdateState, at: string): UpdateState {
  if (s.downloadedVersion !== null) {
    return {
      ...s,
      status: 'downloaded',
      availableVersion: s.downloadedVersion,
      downloadPercent: 100,
      checkedAt: at,
      message: null,
      errorContext: null,
    }
  }
  return {
    ...s,
    status: 'up-to-date',
    availableVersion: null,
    releaseNotes: null,
    releaseUrl: null,
    downloadPercent: null,
    checkedAt: at,
    message: null,
    errorContext: null,
  }
}

export function onDownloadStart(s: UpdateState): UpdateState {
  return { ...s, status: 'downloading', downloadPercent: 0, message: null, errorContext: null }
}

export function onDownloadProgress(s: UpdateState, percent: number): UpdateState {
  return { ...s, status: 'downloading', downloadPercent: clampPercent(percent), message: null, errorContext: null }
}

/** The release is still there to retry, so this goes back to "available" with the reason attached. */
export function onDownloadFailure(s: UpdateState, message: string): UpdateState {
  return { ...s, status: s.availableVersion ? 'available' : 'error', downloadPercent: null, message, errorContext: 'download' }
}

export function onDownloaded(s: UpdateState, version: string): UpdateState {
  return {
    ...s,
    status: 'downloaded',
    availableVersion: version,
    downloadedVersion: version,
    releaseUrl: s.releaseUrl ?? releaseUrl(version),
    downloadPercent: 100,
    message: null,
    errorContext: null,
  }
}

export function onInstallFailure(s: UpdateState, message: string): UpdateState {
  return { ...s, status: 'downloaded', message, errorContext: 'install' }
}

function clampPercent(p: number): number {
  return Number.isFinite(p) ? Math.min(100, Math.max(0, p)) : 0
}

/** What a click on the update control does next. */
export type UpdateAction = 'check' | 'download' | 'install' | 'none'

export function updateAction(s: UpdateState): UpdateAction {
  if (s.status === 'downloaded' && s.downloadedVersion) return 'install'
  if (s.status === 'available') return 'download'
  if (s.status === 'idle' || s.status === 'up-to-date' || s.status === 'error') return 'check'
  return 'none'
}

/** One sentence on where things stand, for tooltips, the banner and Settings. */
export function updateSummary(s: UpdateState): string {
  switch (s.status) {
    case 'disabled':
      return s.message ?? 'Automatic updates are not available.'
    case 'idle':
      return 'Updates are checked shortly after start and then every hour.'
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return `Version ${s.currentVersion} is the latest.`
    case 'available':
      return s.message
        ? `Could not download version ${s.availableVersion}: ${s.message}`
        : `Version ${s.availableVersion} is available.`
    case 'downloading':
      return `Downloading version ${s.availableVersion}… ${Math.floor(s.downloadPercent ?? 0)}%`
    case 'downloaded':
      return s.message
        ? `Could not install version ${s.downloadedVersion}: ${s.message}`
        : `Version ${s.downloadedVersion} is downloaded. Restart to finish the update.`
    case 'error':
      return `Could not check for updates: ${s.message ?? 'unknown error'}`
  }
}

/** Short label for the action button in Settings and the banner. */
export function updateButtonLabel(s: UpdateState): string {
  switch (updateAction(s)) {
    case 'install':
      return 'Restart to install'
    case 'download':
      return s.errorContext === 'download' ? 'Retry download' : 'Download'
    case 'check':
      return 'Check for updates'
    case 'none':
      return s.status === 'checking' ? 'Checking…' : s.status === 'downloading' ? 'Downloading…' : 'Check for updates'
  }
}

/** Label for the tray menu row, with the version so the menu is informative on its own. */
export function updateMenuLabel(s: UpdateState): string {
  switch (updateAction(s)) {
    case 'install':
      return `Restart to install ${s.downloadedVersion}`
    case 'download':
      return `Download update ${s.availableVersion}`
    case 'check':
      return 'Check for updates'
    case 'none':
      return s.status === 'checking'
        ? 'Checking for updates…'
        : s.status === 'downloading'
          ? `Downloading update ${s.availableVersion}…`
          : 'Check for updates'
  }
}

/**
 * GitHub release notes arrive as the HTML of the releases feed. Reduce them to
 * plain lines: bullets for list items, pull request links shortened to #N, and
 * the generated "Full Changelog" link dropped.
 */
export function plainReleaseNotes(
  notes: string | { version: string; note?: string | null }[] | null | undefined,
): string | null {
  if (!notes) return null
  const html = typeof notes === 'string' ? notes : notes.map((n) => `<h2>${n.version}</h2>${n.note ?? ''}`).join('')
  const lines = html
    .replace(/\r/g, '')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|li|tr)>/gi, '\n')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/ in https:\/\/github\.com\/\S+\/pull\/(\d+)/g, ' (#$1)')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^Full Changelog/i.test(l))
  return lines.length ? lines.join('\n') : null
}
