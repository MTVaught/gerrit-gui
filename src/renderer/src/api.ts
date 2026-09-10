// The UI talks to `api`, which is the Electron preload bridge when present and
// an HTTP client to src/server when running in a plain browser (pnpm web).
import type { Api } from '../../shared/api.ts'
import type { UiState } from '../../shared/types.ts'
import { totalActions } from '../../shared/model.ts'
import { RELEASES_URL, initialUpdateState } from '../../shared/update.ts'

async function call<T>(method: string, args: unknown[] = []): Promise<T> {
  const res = await fetch(`/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
  })
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(body?.error ?? `${method}: ${res.status}`)
  return body
}

function browserApi(): Api {
  const ui: UiState = { compact: false }
  const noUpdates = initialUpdateState('dev', 'Updates are for the desktop app; in the browser, pull the repository.')
  return {
    getSettings: () => call('getSettings'),
    saveSettings: (input) => call('saveSettings', [input]),
    testConnection: () => call('testConnection'),
    fetchDashboard: () => call('fetchDashboard'),
    act: (action) => call('act', [action]),
    suggestReviewers: (id, q) => call('suggestReviewers', [id, q]),
    suggestAccounts: (q) => call('suggestAccounts', [q]),
    openChange: async (link) => {
      window.open(await call<string>('changeUrl', [link]), '_blank', 'noopener')
    },
    changeUrl: (link) => call('changeUrl', [link]),
    // Window/tray features have no browser equivalent.
    getUi: async () => ui,
    setCompact: async () => undefined,
    setBadge: ({ counts }) => {
      const total = totalActions(counts)
      document.title = (total > 0 ? `(${total}) ` : '') + 'Gerrit Review Board'
    },
    onCompactChanged: () => () => undefined,
    onSettingsChanged: () => () => undefined,
    onRefreshRequested: () => () => undefined,
    onTabRequested: () => () => undefined,
    // Nor do updates: the browser serves whatever the checkout contains.
    getUpdateState: async () => noUpdates,
    checkForUpdate: async () => noUpdates,
    downloadUpdate: async () => noUpdates,
    installUpdate: async () => noUpdates,
    openReleaseNotes: async () => {
      window.open(RELEASES_URL, '_blank', 'noopener')
    },
    onUpdateState: () => () => undefined,
  }
}

export const api: Api = typeof window !== 'undefined' && window.api ? window.api : browserApi()
export const isBrowserMode = !(typeof window !== 'undefined' && window.api)
