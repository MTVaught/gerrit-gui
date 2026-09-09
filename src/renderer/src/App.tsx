import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeAction, ChangeView, DashboardData, SettingsStatus } from '../../shared/types.ts'
import { DEFAULT_SORT, SORT_OPTIONS, actionCounts, classifyAll, totalActions, type SortId } from '../../shared/model.ts'
import { POLL_INTERVAL_MS } from '../../shared/constants.ts'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { Board, type TabId, TABS } from './components/Board.tsx'
import { ago } from './time.ts'
import { renderBadgeIcon, renderTrayStrip } from './badge.ts'
import { ExpandIcon, GearIcon, PinIcon, RefreshIcon } from './components/Icons.tsx'
import { api, isBrowserMode } from './api.ts'
import { UpdateBanner, UpdatePill, useUpdateState } from './components/Update.tsx'

export function App() {
  const [settings, setSettings] = useState<SettingsStatus | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<TabId>(initialTab)
  const [sort, setSort] = useState<SortId>(initialSort)
  const [compact, setCompact] = useState(false)
  const [, setTick] = useState(0)
  const update = useUpdateState()
  const seenNeedsReview = useRef<Set<number> | null>(null)

  const configured = Boolean(settings?.serverUrl && settings?.username && settings?.hasPassword)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const d = await api.fetchDashboard()
      setData(d)
      setError(null)
      notifyNewReviews(d, seenNeedsReview)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void api.getSettings().then((s) => {
      setSettings(s)
      if (!(s.serverUrl && s.username && s.hasPassword)) setShowSettings(true)
    })
    void api.getUi().then((u) => setCompact(u.compact))
    const offCompact = api.onCompactChanged(setCompact)
    const offRefresh = api.onRefreshRequested(() => void refresh())
    const offTab = api.onTabRequested(setTab)
    return () => {
      offCompact()
      offRefresh()
      offTab()
    }
  }, [refresh])

  useEffect(() => {
    if (!configured) return
    void refresh()
    const poll = setInterval(() => void refresh(), POLL_INTERVAL_MS)
    const tick = setInterval(() => setTick((t) => t + 1), 30_000)
    const onFocus = () => void refresh()
    window.addEventListener('focus', onFocus)
    return () => {
      clearInterval(poll)
      clearInterval(tick)
      window.removeEventListener('focus', onFocus)
    }
  }, [configured, refresh])

  const views = useMemo<ChangeView[]>(
    () => (data ? classifyAll([...data.open, ...data.merged], data.self._account_id) : []),
    [data],
  )

  const act = useCallback(
    async (action: ChangeAction) => {
      setBusy(true)
      try {
        await api.act(action)
        setError(null)
      } catch (e) {
        setError(String((e as Error).message ?? e))
      } finally {
        await refresh()
      }
    },
    [refresh],
  )

  const counts = useMemo(() => {
    const c: Record<TabId, number> = {
      'needs-my-review': 0,
      reviewing: 0,
      mine: 0,
      'ready-to-merge': 0,
      merged: 0,
    }
    for (const v of views) {
      if (v.change.status === 'MERGED') c.merged++
      if (v.needsMyReview) c['needs-my-review']++
      if (v.iAmReviewer && !v.isMine && v.change.status === 'NEW') c.reviewing++
      if (v.isMine && v.change.status === 'NEW') c.mine++
      if (v.state === 'ready-to-merge' || v.staleReadyToMerge) c['ready-to-merge']++
    }
    return c
  }, [views])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {
      // Storage may be unavailable; the choice then lasts for this session only.
    }
  }, [sort])

  const actions = useMemo(() => actionCounts(views), [views])
  const badgeStyle = settings?.badgeStyle ?? 'color'
  const showZeroCounts = settings?.showZeroCounts ?? false
  useEffect(() => {
    if (!data) return
    api.setBadge({
      counts: actions,
      style: badgeStyle,
      showZeroCounts,
      iconDataUrl: renderBadgeIcon(totalActions(actions)),
      strip: badgeStyle === 'color' ? renderTrayStrip(actions, showZeroCounts) : null,
    })
  }, [actions, badgeStyle, showZeroCounts, data])

  return (
    <div className={'app' + (compact ? ' compact' : '')}>
      <header className="topbar">
        <nav className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={'tab' + (tab === t.id ? ' active' : '')}
              onClick={() => setTab(t.id)}
            >
              {t.label}
              <span className={'count' + (t.id === 'needs-my-review' && counts[t.id] > 0 ? ' hot' : '')}>
                {counts[t.id]}
              </span>
            </button>
          ))}
        </nav>
        <div className="topbar-right">
          {data && (
            <span className="muted" title={data.fetchedAt}>
              {data.self.name ?? data.self.username} · updated {ago(new Date(data.fetchedAt))}
            </span>
          )}
          <UpdatePill state={update} />
          <select
            className="btn sort"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortId)}
            title="Sort order for every tab"
            aria-label="Sort order"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.id} value={o.id} title={o.title}>
                {o.label}
              </option>
            ))}
          </select>
          <button className={'btn icon' + (busy ? ' spinning' : '')} onClick={() => void refresh()} disabled={busy || !configured} title="Refresh" aria-label="Refresh">
            <RefreshIcon />
          </button>
          <button
            className={'btn icon' + (compact ? ' active' : '')}
            aria-label={compact ? 'Expand' : 'Compact mode'}
            onClick={() => void api.setCompact(!compact)}
            title={compact ? 'Back to the full window' : 'Compact window that stays on top'}
          >
            {compact ? <ExpandIcon /> : <PinIcon />}
          </button>
          <button className="btn icon" onClick={() => setShowSettings(true)} title="Settings" aria-label="Settings">
            <GearIcon />
          </button>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
      <UpdateBanner state={update} />
      {isBrowserMode && !data && !error && (
        <div className="banner" role="status">
          Browser mode: the UI is served by Vite and talks to the local API in <code>src/server</code>. Tray, badge and
          compact mode are Electron-only.
        </div>
      )}
      {data?.truncated && (
        <div className="banner warn" role="status">
          Gerrit capped a result list, so some changes may be missing. Narrow the project scope in Settings.
        </div>
      )}

      {showSettings || !settings ? (
        settings && (
          <SettingsPanel
            initial={settings}
            onClose={() => setShowSettings(false)}
            onSaved={async () => {
              const s = await api.getSettings()
              setSettings(s)
              setShowSettings(false)
              setData(null)
              seenNeedsReview.current = null
            }}
          />
        )
      ) : (
        <Board
          tab={tab}
          views={views}
          sort={sort}
          self={data?.self ?? null}
          loading={!data && busy}
          onAct={act}
          onGoTo={setTab}
        />
      )}
    </div>
  )
}

const SORT_KEY = 'gerrit-gui.sort'

function initialSort(): SortId {
  try {
    const s = localStorage.getItem(SORT_KEY)
    return SORT_OPTIONS.some((o) => o.id === s) ? (s as SortId) : DEFAULT_SORT
  } catch {
    return DEFAULT_SORT
  }
}

function initialTab(): TabId {
  const m = /tab=([a-z-]+)/.exec(window.location.hash)
  const id = m?.[1] as TabId | undefined
  return id && TABS.some((t) => t.id === id) ? id : 'needs-my-review'
}

function notifyNewReviews(d: DashboardData, seen: React.RefObject<Set<number> | null>) {
  const now = new Set(
    classifyAll(d.open, d.self._account_id)
      .filter((v) => v.needsMyReview)
      .map((v) => v.change._number),
  )
  if (seen.current && typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
    const fresh = d.open.filter((c) => now.has(c._number) && !seen.current!.has(c._number))
    for (const c of fresh) {
      new Notification(`Review requested: ${c.subject}`, { body: `${c.project} · ${c.owner.name ?? ''}` })
    }
  }
  seen.current = now
}
