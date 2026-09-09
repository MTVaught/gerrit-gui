// The UI talks to `api`, which is the Electron preload bridge when present and
// an HTTP client to src/server when running in a plain browser (pnpm web).
import type { Api } from '../../shared/api.ts'
import type { UiState } from '../../shared/types.ts'
import { totalActions } from '../../shared/model.ts'

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
  return {
    getSettings: () => call('getSettings'),
    saveSettings: (input) => call('saveSettings', [input]),
    testConnection: () => call('testConnection'),
    fetchDashboard: () => call('fetchDashboard'),
    act: (action) => call('act', [action]),
    suggestReviewers: (id, q) => call('suggestReviewers', [id, q]),
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
    onRefreshRequested: () => () => undefined,
    onTabRequested: () => () => undefined,
  }
}

export const api: Api = typeof window !== 'undefined' && window.api ? window.api : browserApi()
export const isBrowserMode = !(typeof window !== 'undefined' && window.api)
