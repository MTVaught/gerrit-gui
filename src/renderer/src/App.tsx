import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChangeAction, ChangeView, DashboardData, SettingsInput, SettingsStatus } from '../../shared/types.ts'
import { DEFAULT_SORT, EMPTY_FILTER, SORT_OPTIONS, accountKeys, actionCounts, actionMenu, classifyAll, tabCounts, tabSegments, totalActions, type SortId, type TabSegment, type ViewFilter } from '../../shared/model.ts'
import { POLL_INTERVAL_MS } from '../../shared/constants.ts'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { Board, groupsFor, type TabId, TABS, visibleTabs } from './components/Board.tsx'
import { ViewMenu } from './components/ViewMenu.tsx'
import { ago } from './time.ts'
import { renderBadgeIcon, trayStrips } from './badge.ts'
import { ExpandIcon, GearIcon, LockIcon, PlugIcon, RefreshIcon, ShrinkIcon } from './components/Icons.tsx'
import { api, isBrowserMode } from './api.ts'
import { UpdatePill, useUpdateState } from './components/Update.tsx'
import { rememberAccounts } from './names.ts'
import { SettingsContext, type SettingsHandle } from './settings-context.ts'

export function App() {
  const [settings, setSettings] = useState<SettingsStatus | null>(null)
  const [showSettings, setShowSettings] = useState(initialSettingsOpen)
  const [data, setData] = useState<DashboardData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState<TabId>(initialTab)
  const [sort, setSort] = useState<SortId>(initialSort)
  // Search and author filter last for the session; the sort is remembered.
  const [filter, setFilter] = useState<ViewFilter>(EMPTY_FILTER)
  const [compact, setCompact] = useState(false)
  const [, setTick] = useState(0)
  const update = useUpdateState()
  const seenNeedsReview = useRef<Set<number> | null>(null)
  const seenMergeRequests = useRef<Set<number> | null>(null)
  const tabsRef = useRef<HTMLElement>(null)
  const topbarRef = useRef<HTMLElement>(null)
  const ghostRef = useRef<HTMLElement>(null)
  const rightRef = useRef<HTMLDivElement>(null)
  // Full tab labels when they fit on the one row with the controls; the short ones otherwise.
  const [shortTabs, setShortTabs] = useState(false)

  const configured = Boolean(settings?.serverUrl && settings?.username && settings?.hasPassword)

  const refresh = useCallback(async () => {
    setBusy(true)
    try {
      const d = await api.fetchDashboard()
      rememberAccounts([d.self, ...d.open.flatMap((c) => [c.owner, ...(c.reviewers?.REVIEWER ?? [])])])
      setData(d)
      setError(null)
      notifyNewReviews(d, seenNeedsReview)
      notifyMergeRequests(d, seenMergeRequests)
    } catch (e) {
      setError(String((e as Error).message ?? e))
    } finally {
      setBusy(false)
    }
  }, [])

  // New credentials from the connection window: forget the old server's board and start over.
  const reconnect = useCallback(async () => {
    setSettings(await api.getSettings())
    setData(null)
    setError(null)
    seenNeedsReview.current = null
    seenMergeRequests.current = null
  }, [])

  useEffect(() => {
    void api.getSettings().then(setSettings)
    void api.getUi().then((u) => setCompact(u.compact))
    const offCompact = api.onCompactChanged(setCompact)
    const offSettings = api.onSettingsChanged(() => void api.getSettings().then(setSettings))
    const offRefresh = api.onRefreshRequested(() => void refresh())
    const offTab = api.onTabRequested(setTab)
    const offConnection = api.onConnectionChanged(() => void reconnect())
    return () => {
      offCompact()
      offSettings()
      offRefresh()
      offTab()
      offConnection()
    }
  }, [refresh, reconnect])

  // Browser mode has no push channel from the connection tab; re-read the settings when this tab is back.
  useEffect(() => {
    if (!isBrowserMode) return
    const onFocus = () => {
      void api.getSettings().then((s) => {
        setSettings((prev) => {
          if (prev && (prev.serverUrl !== s.serverUrl || prev.username !== s.username || prev.hasPassword !== s.hasPassword)) void reconnect()
          return s
        })
      })
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reconnect])

  // The compact tab strip scrolls sideways; keep the active tab in view.
  useEffect(() => {
    if (!compact) return
    tabsRef.current?.querySelector<HTMLElement>('.tab.active')?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [compact, tab])

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

  // The project scope changes what is fetched, so a change to it reloads the board.
  const projectsKey = settings?.projects.join(',')
  const lastProjects = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (projectsKey === undefined) return
    if (lastProjects.current !== undefined && lastProjects.current !== projectsKey && configured) void refresh()
    lastProjects.current = projectsKey
  }, [projectsKey, configured, refresh])

  const team = settings?.team ?? NO_TEAM
  const views = useMemo<ChangeView[]>(
    () => (data ? classifyAll([...data.open, ...data.merged], data.self._account_id, team, accountKeys(data.self)) : []),
    [data, team],
  )
  // The parts of the board that read or write settings directly (the merger picker).
  const settingsHandle = useMemo<SettingsHandle>(
    () => ({
      settings,
      save: async (patch: Partial<SettingsInput>) => {
        const current = await api.getSettings()
        await api.saveSettings({ ...current, ...patch })
        setSettings(await api.getSettings())
      },
    }),
    [settings],
  )
  const tabs = useMemo(() => visibleTabs(team.length > 0), [team])
  // What the current tab lists before the filter: the author picker suggests these owners first.
  const tabViews = useMemo(() => groupsFor(tab, views).flatMap((g) => g.items), [tab, views])
  // Clearing the team hides the External Reviews tab; fall back if it was selected.
  // Not before the settings are in, or an initial External Reviews tab would be lost.
  useEffect(() => {
    if (settings && !tabs.some((t) => t.id === tab)) setTab('needs-my-review')
  }, [settings, tabs, tab])

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

  const counts = useMemo(() => tabCounts(views), [views])
  const segments = useMemo(() => tabSegments(views), [views])
  // One row: the tabs and the controls. A hidden copy of the strip with the full labels is measured
  // against the room left of the controls; when it does not fit, the tabs use their short labels.
  useLayoutEffect(() => {
    if (compact) return
    const bar = topbarRef.current
    const ghost = ghostRef.current
    const right = rightRef.current
    if (!bar || !ghost || !right) return
    const measure = () => {
      const style = getComputedStyle(bar)
      const room = bar.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - right.offsetWidth - parseFloat(style.columnGap || '0')
      setShortTabs(ghost.scrollWidth > room)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(bar)
    ro.observe(right)
    return () => ro.disconnect()
  }, [compact, tabs, counts, segments, data, update])

  useEffect(() => {
    try {
      localStorage.setItem(SORT_KEY, sort)
    } catch {
      // Storage may be unavailable; the choice then lasts for this session only.
    }
  }, [sort])

  const actions = useMemo(() => actionCounts(views), [views])
  const menu = useMemo(() => actionMenu(views), [views])
  const badgeStyle = settings?.badgeStyle ?? 'color'
  const showZeroCounts = settings?.showZeroCounts ?? false
  const showAppBadge = settings?.showAppBadge ?? true
  const showTrayCounts = settings?.showTrayCounts ?? true
  useEffect(() => {
    if (!data) return
    api.setBadge({
      counts: actions,
      menu,
      style: badgeStyle,
      showZeroCounts,
      showAppBadge,
      showTrayCounts,
      iconDataUrl: renderBadgeIcon(totalActions(actions)),
      strip: showTrayCounts && badgeStyle === 'color' ? trayStrips(actions, showZeroCounts) : null,
    })
  }, [actions, menu, badgeStyle, showZeroCounts, showAppBadge, showTrayCounts, data])

  return (
    <SettingsContext.Provider value={settingsHandle}>
    <div className={'app' + (compact ? ' compact' : '')}>
      <header className="topbar" ref={topbarRef}>
        <nav className={'tabs' + (shortTabs ? ' short' : '')} role="tablist" ref={tabsRef}>
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id && !showSettings}
              aria-label={t.label}
              className={'tab' + (tab === t.id && !showSettings ? ' active' : '')}
              onClick={() => {
                setTab(t.id)
                setShowSettings(false)
              }}
            >
              {compact || shortTabs ? t.short : t.label}
              <TabCount total={counts[t.id]} hot={t.id === 'needs-my-review'} segments={segments[t.id] ?? []} />
            </button>
          ))}
        </nav>
        {!compact && (
          <nav className="tabs ghost" aria-hidden="true" ref={ghostRef}>
            {tabs.map((t) => (
              <span key={t.id} className="tab">
                {t.label}
                <TabCount total={counts[t.id]} hot={false} segments={segments[t.id] ?? []} />
              </span>
            ))}
          </nav>
        )}
        <div className="topbar-right" ref={rightRef}>
          <UpdatePill state={update} />
          <ViewMenu
            sort={sort}
            onSort={setSort}
            filter={filter}
            onFilter={setFilter}
            tabViews={tabViews}
            compact={compact}
          />
          <button
            className={'btn icon' + (busy ? ' spinning' : '')}
            onClick={() => void refresh()}
            disabled={busy || !configured}
            title={data ? `${data.self.name ?? data.self.username} · updated ${ago(new Date(data.fetchedAt))}. Refresh` : 'Refresh'}
            aria-label="Refresh"
          >
            <RefreshIcon />
          </button>
          <button
            className={'btn icon' + (compact ? ' active' : '')}
            aria-label={compact ? 'Expand' : 'Compact window'}
            onClick={() => void api.setCompact(!compact)}
            title={compact ? 'Back to the full window' : 'Switch to the narrow compact window'}
          >
            {compact ? <ExpandIcon /> : <ShrinkIcon />}
          </button>
          <button
            className={'btn icon' + (showSettings ? ' on' : '')}
            aria-pressed={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </button>
        </div>
      </header>

      {error && (
        <div className="banner error" role="alert">
          {error}
        </div>
      )}
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

      {!settings ? null : showSettings ? (
        <SettingsPanel settings={settings} compact={compact} save={settingsHandle.save} />
      ) : !configured ? (
        <div className="panel empty not-connected">
          <p>Not connected to Gerrit yet.</p>
          <button className="btn primary" onClick={() => void api.openConnection()}>
            <PlugIcon /> Set up the connection
          </button>
        </div>
      ) : (
        <Board
          tab={tab}
          views={views}
          sort={sort}
          filter={filter}
          onFilter={setFilter}
          self={data?.self ?? null}
          loading={!data && busy}
          compact={compact}
          onAct={act}
          onGoTo={(t) => {
            setTab(t)
            setShowSettings(false)
          }}
        />
      )}
    </div>
    </SettingsContext.Provider>
  )
}

const SORT_KEY = 'gerrit-gui.sort'
/** Stable empty list so the memo keyed on the team does not rerun every render before settings load. */
const NO_TEAM: string[] = []

function initialSort(): SortId {
  try {
    const s = localStorage.getItem(SORT_KEY)
    return SORT_OPTIONS.some((o) => o.id === s) ? (s as SortId) : DEFAULT_SORT
  } catch {
    return DEFAULT_SORT
  }
}

/**
 * The count beside a tab label. Colored segments sit to the left of a grey
 * remainder: first what waits on the user, then what waits on others in
 * muted tones; with no segment it is the plain pill. Each card is
 * counted once: the grey part is what no segment covers, and it is left out
 * when the segments cover everything. A private count is a lock pill after
 * the capsule, since private is not a state.
 */
function TabCount(props: {
  total: number
  /** Accent the plain pill when non-zero: the tab that waits on the user. */
  hot: boolean
  segments: TabSegment[]
}) {
  const priv = props.segments.find((s) => s.tone === 'private')
  const segs = props.segments.filter((s) => s.tone !== 'private')
  const lock = priv && (
    <span className="count private" title={`${priv.n} private`}>
      <LockIcon />
      {priv.n}
    </span>
  )
  if (segs.length === 0) {
    const shown = Math.max(0, props.total - (priv?.n ?? 0))
    return (
      <>
        <span className={'count' + (props.hot && shown > 0 ? ' hot' : '')}>{shown}</span>
        {lock}
      </>
    )
  }
  // What no segment (nor the lock) covers: on My Changes, the cards waiting on the merger.
  const rest = Math.max(0, props.total - props.segments.reduce((sum, s) => sum + s.n, 0))
  const title = [...segs.map((s) => `${s.n} ${s.label}`), ...(rest > 0 ? [`${rest} other`] : []), `${props.total} total`].join(' · ')
  const mine = segs.filter((s) => s.tone === 'hot' || s.tone === 'pos' || s.tone === 'neg')
  const others = segs.filter((s) => !mine.includes(s))
  const seg = (s: TabSegment) => (
    <span key={s.label} className={s.tone}>
      {s.n}
    </span>
  )
  return (
    <>
      <span className="count split" title={title}>
        {mine.map(seg)}
        {others.map(seg)}
        {rest > 0 && <span>{rest}</span>}
      </span>
      {lock}
    </>
  )
}

function initialTab(): TabId {
  const m = /tab=([a-z-]+)/.exec(window.location.hash)
  const id = m?.[1] as TabId | undefined
  return id && TABS.some((t) => t.id === id) ? id : 'needs-my-review'
}

/** GERRIT_GUI_TAB=settings opens the settings panel instead of a board tab (screenshot hook). */
function initialSettingsOpen(): boolean {
  return /tab=settings\b/.test(window.location.hash)
}

/** A desktop notification for each change that the author just asked this user to merge. */
function notifyMergeRequests(d: DashboardData, seen: React.RefObject<Set<number> | null>) {
  const now = new Set(
    classifyAll(d.open, d.self._account_id, [], accountKeys(d.self))
      .filter((v) => v.state === 'ready-to-merge' && v.mergeRequestedFromMe)
      .map((v) => v.change._number),
  )
  if (seen.current && typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
    const fresh = d.open.filter((c) => now.has(c._number) && !seen.current!.has(c._number))
    for (const c of fresh) {
      new Notification(`Merge requested: ${c.subject}`, { body: `${c.project} · ${c.owner.name ?? ''}` })
    }
  }
  seen.current = now
}

/** A desktop notification for each change the author just asked this user to review, of either kind. */
function notifyNewReviews(d: DashboardData, seen: React.RefObject<Set<number> | null>) {
  const waiting = classifyAll(d.open, d.self._account_id, [], accountKeys(d.self)).filter((v) => v.needsMyReview)
  const now = new Set(waiting.map((v) => v.change._number))
  if (seen.current && typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
    const fresh = waiting.filter((v) => !seen.current!.has(v.change._number))
    for (const { change: c, inPerson } of fresh) {
      new Notification(`${inPerson ? 'In-person review' : 'Review'} requested: ${c.subject}`, { body: `${c.project} · ${c.owner.name ?? ''}` })
    }
  }
  seen.current = now
}
