import { TooltipButton } from './components/Tooltip.tsx'
import { useTheme } from './theme.ts'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, DashboardData, SettingsInput, SettingsStatus } from '../../shared/types.ts'
import { DEFAULT_SORT, EMPTY_FILTER, NO_TEAMS, SORT_OPTIONS, accountKeys, actionCounts, actionMenu, classifyAll, defaultTeamPick, displayName, tabCounts, tabSegments, teamMembers, teamPicks, teamTabLabel, totalActions, type SortId, type TabSegment, type TeamPick, type TeamSetup, type ViewFilter } from '../../shared/model.ts'
import { POLL_INTERVAL_MS } from '../../shared/constants.ts'
import { SettingsPanel } from './components/SettingsPanel.tsx'
import { Board, groupsFor, type TabId, TABS, visibleTabs } from './components/Board.tsx'
import { TeamTab, teamEntries } from './components/TeamTab.tsx'
import { ViewMenu } from './components/ViewMenu.tsx'
import { ago } from './time.ts'
import { renderBadgeIcon, trayStrips } from './badge.ts'
import { ExpandIcon, GearIcon, PlugIcon, RefreshIcon, ShrinkIcon } from './components/Icons.tsx'
import { api, isBrowserMode } from './api.ts'
import { UpdatePill, useUpdateState } from './components/Update.tsx'
import { rememberAccounts } from './names.ts'
import { LocalReviewProvider } from './review-context.tsx'
import { SettingsContext, type SettingsHandle } from './settings-context.ts'
import { DashboardRefresh } from './dashboard-refresh.ts'
import { newerSettings } from './preference-state.ts'
import { DashboardCache } from './dashboard-cache.ts'

export function App() {
  const [settings, setSettings] = useState<SettingsStatus | null>(null)
  useTheme(settings?.theme)
  const [showSettings, setShowSettings] = useState(initialSettingsOpen)
  const [data, setData] = useState<DashboardData | null>(null)
  const dashboardCache = useRef<DashboardCache | null>(null)
  if (!dashboardCache.current) dashboardCache.current = new DashboardCache(id => api.fetchChange(id), d => {
    if (d) rememberAccounts([d.self, ...[...d.open, ...d.merged].flatMap(c => [c.owner, ...(c.reviewers?.REVIEWER ?? [])])])
    setData(d)
  })
  const [error, setError] = useState<string | null>(null)
  const [refreshBusy, setBusy] = useState(false)
  const [activeActions, setActiveActions] = useState(0)
  const busy = refreshBusy || activeActions > 0
  const dashboardRefresh = useRef(new DashboardRefresh())
  const [tab, setTab] = useState<TabId>(initialTab)
  // Which team the team tab lists, once the user picked one on its caret; until then the default for the setup.
  const [teamPickChoice, setTeamPickChoice] = useState<TeamPick | null>(initialTeamPick)
  const [sort, setSort] = useState<SortId>(initialSort)
  // Search and author filter last for the session; the sort is remembered.
  const [filter, setFilter] = useState<ViewFilter>(EMPTY_FILTER)
  const [compact, setCompact] = useState(false)
  // Debug: the board is shown as this person sees it, read-only. Held by the main process, so a reload of the window keeps it.
  const [pretend, setPretend] = useState<AccountInfo | null>(null)
  const pretendRef = useRef(pretend)
  pretendRef.current = pretend
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
    const isCurrent = dashboardRefresh.current.begin()
    if (!isCurrent) return
    setBusy(true)
    try {
      const ticket = dashboardCache.current!.beginRefresh()
      const d = await api.fetchDashboard()
      if (!isCurrent()) return
      await dashboardCache.current!.acceptDashboard(d, ticket)
      if (!isCurrent()) return
      const reconciled = dashboardCache.current!.snapshot
      if (!reconciled) return
      setError(null)
      // Someone else's board is not something to be notified about.
      if (pretendRef.current) return
      notifyNewReviews(reconciled, seenNeedsReview)
      notifyMergeRequests(reconciled, seenMergeRequests)
    } catch (e) {
      if (isCurrent()) setError(String((e as Error).message ?? e))
    } finally {
      if (isCurrent()) setBusy(false)
    }
  }, [])

  // New credentials from the connection window: forget the old server's board and start over.
  const reconnect = useCallback(async () => {
    dashboardRefresh.current.invalidate()
    setBusy(false)
    dashboardCache.current!.reset()
    setError(null)
    seenNeedsReview.current = null
    seenMergeRequests.current = null
    const saved = await api.getSettings()
    setSettings(previous => newerSettings(previous, saved))
    await refresh()
  }, [refresh])

  useEffect(() => {
    const accept = (saved: SettingsStatus) => setSettings(previous => newerSettings(previous, saved))
    void api.getSettings().then(accept)
    void api.getUi().then((u) => setCompact(u.compact))
    void api.getPretend().then(setPretend, () => undefined)
    const offCompact = api.onCompactChanged(setCompact)
    const offSettings = api.onSettingsChanged(() => void api.getSettings().then(accept))
    const dirty = new Set<number>()
    let reviewTimer: ReturnType<typeof setTimeout> | undefined
    const offReview = api.onReviewChanged?.(event => {
      dashboardCache.current!.markDirty(event.id)
      dirty.add(event.id)
      clearTimeout(reviewTimer)
      reviewTimer = setTimeout(() => {
        for (const id of dirty) void dashboardCache.current!.revalidate(id).catch(error => setError(`Could not refresh change: ${error.message}`))
        dirty.clear()
      }, 25)
    })
    const offRefresh = api.onRefreshRequested(() => void refresh())
    const offTab = api.onTabRequested((tab) => {
      setTab(tab)
      setShowSettings(false)
    })
    const offConnection = api.onConnectionChanged(() => void reconnect())
    return () => {
      clearTimeout(reviewTimer)
      offReview?.()
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

  // Debug: show the board as someone else, or (null) as oneself again. The
  // board is re-read either way; the notifications start over as after a
  // reconnect, so the switch back does not announce everything as new.
  const changePretend = useCallback(
    async (key: string | null) => {
      if (!dashboardRefresh.current.pause()) throw new Error('The board is already switching. Wait for the switch to finish.')
      setBusy(true)
      try {
        const account = await api.setPretend(key)
        pretendRef.current = account
        setPretend(account)
        seenNeedsReview.current = null
        seenMergeRequests.current = null
        dashboardCache.current!.reset()
      } finally {
        // Resume even if account lookup failed; refresh the unchanged identity.
        dashboardRefresh.current.resume()
        await refresh()
      }
    },
    [refresh],
  )

  const setup = useMemo<TeamSetup>(() => (settings ? { teams: settings.teams, primaryTeam: settings.primaryTeam } : NO_TEAMS), [settings])
  // Everyone on a watched team: their open changes are fetched whole, so the list decides what is on the board.
  const members = useMemo(() => teamMembers(setup), [setup])
  // The project scope and the teams change what is fetched, so a change to either reloads the board.
  const fetchKey = settings ? [...settings.projects, '|', ...members].join(',') : undefined
  const lastFetchKey = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (fetchKey === undefined) return
    dashboardCache.current!.setScope(members, settings!.projects)
    if (lastFetchKey.current !== undefined && lastFetchKey.current !== fetchKey && configured) void refresh()
    lastFetchKey.current = fetchKey
  }, [fetchKey, configured, refresh, members, settings])

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
    () => (data ? classifyAll([...data.open, ...data.merged], data.self._account_id, setup, accountKeys(data.self)) : []),
    [data, setup],
  )
  // The parts of the board that read or write settings directly (the merger picker).
  const settingsHandle = useMemo<SettingsHandle>(
    () => ({
      settings,
      save: async (patch: Partial<SettingsInput>) => {
        if (api.patchSettings) {
          const saved = await api.patchSettings(patch)
          setSettings(previous => !previous?.version || !saved.version || saved.version >= previous.version ? saved : previous)
        } else {
          const current = await api.getSettings()
          await api.saveSettings({ ...current, ...patch })
          setSettings(await api.getSettings())
        }
      },
    }),
    [settings],
  )
  const tabs = useMemo(() => visibleTabs(setup), [setup])
  // The team tab: the pick as made while it is still a watched team, else the default (own team, or all watched).
  const picks = useMemo(() => teamPicks(setup), [setup])
  const pick: TeamPick = teamPickChoice !== null && picks.some((p) => p.pick === teamPickChoice) ? teamPickChoice : defaultTeamPick(setup)
  const entries = useMemo(() => teamEntries(setup, views), [setup, views])
  // What the current tab lists before the filter: the author picker suggests these owners first.
  const tabViews = useMemo(() => groupsFor(tab, views, tab === 'team-reviews' ? pick : undefined).flatMap((g) => g.items), [tab, views, pick])
  // Clearing the teams hides their tabs; fall back if one was selected.
  // Not before the settings are in, or an initial team tab would be lost.
  useEffect(() => {
    if (settings && !tabs.some((t) => t.id === tab)) setTab('needs-my-review')
  }, [settings, tabs, tab])

  // The cache protects confirmed writes from lagging dashboard searches.
  const act = useCallback(
    async (action: ChangeAction) => {
      if (pretendRef.current) {
        setError(`Nothing was changed: the board is shown as ${displayName(pretendRef.current)} and read-only. Stop pretending in Settings › Debug first.`)
        return
      }
      const context = dashboardCache.current!.context
      setActiveActions(count => count + 1)
      try {
        const ids = action.type === 'setSequence' ? [action.id, ...action.add, ...action.remove] : [action.id]
        await dashboardCache.current!.mutate(ids, () => api.act(action))
        if (context === dashboardCache.current!.context) setError(null)
      } catch (e) {
        if (context === dashboardCache.current!.context) setError(String((e as Error).message ?? e))
      } finally {
        setActiveActions(count => count - 1)
      }
    },
    [],
  )

  // The team tab's pill counts the list its label names, whatever the caret picked; the menu has the rest.
  const counts = useMemo(() => tabCounts(views, defaultTeamPick(setup)), [views, setup])
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
    <LocalReviewProvider onNativeNavigate={() => setShowSettings(false)} onError={setError} onMutate={async (id, write) => {
      const context = dashboardCache.current!.context
      let written = false
      try {
        await dashboardCache.current!.mutate([id], async () => { await write(); written = true })
      } catch (e) {
        // A confirmed publication must not invite resending just because its
        // board detail read failed. The dirty entry will retry on refresh.
        if (!written) throw e
        if (context === dashboardCache.current!.context) setError(String((e as Error).message ?? e))
      }
    }}>
    <div className={'app' + (compact ? ' compact' : '')}>
      <header className="topbar" ref={topbarRef}>
        <nav className={'tabs' + (shortTabs ? ' short' : '')} role="tablist" ref={tabsRef}>
          {tabs.map((t) =>
            t.id === 'team-reviews' ? (
              <TeamTab
                key={t.id}
                label={teamTabLabel(setup)}
                entries={entries}
                pick={pick}
                active={tab === t.id && !showSettings}
                count={<TabCount total={counts[t.id]} hot={false} segments={segments[t.id] ?? []} />}
                onPick={(choice) => {
                  setTeamPickChoice(choice)
                  setTab(t.id)
                  setShowSettings(false)
                }}
                onSelect={() => {
                  setTeamPickChoice(null)
                  setTab(t.id)
                  setShowSettings(false)
                }}
              />
            ) : (
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
                <TabCount individual={t.id === 'mine'} total={counts[t.id]} hot={t.id === 'needs-my-review'} segments={segments[t.id] ?? []} />
              </button>
            ),
          )}
        </nav>
        {!compact && (
          <nav className="tabs ghost" aria-hidden="true" ref={ghostRef}>
            {tabs.map((t) => (
              <span key={t.id} className="tab">
                {t.id === 'team-reviews' ? teamTabLabel(setup) : t.label}
                <TabCount individual={t.id === 'mine'} total={counts[t.id]} hot={false} segments={segments[t.id] ?? []} />
                {t.id === 'team-reviews' && entries.length > 0 && <span className="tab-caret">▾</span>}
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
          <TooltipButton
            className={'btn icon' + (busy ? ' spinning' : '')}
            onClick={() => void refresh()}
            disabled={busy || !configured}
            title={data ? `${data.self.name ?? data.self.username} · updated ${ago(new Date(data.fetchedAt))}. Refresh` : 'Refresh'}
            aria-label="Refresh"
          >
            <RefreshIcon />
          </TooltipButton>
          <TooltipButton
            className={'btn icon' + (compact ? ' active' : '')}
            aria-label={compact ? 'Expand' : 'Compact window'}
            onClick={() => void api.setCompact(!compact)}
            title={compact ? 'Back to the full window' : 'Switch to the narrow compact window'}
          >
            {compact ? <ExpandIcon /> : <ShrinkIcon />}
          </TooltipButton>
          <TooltipButton
            className={'btn icon' + (showSettings ? ' on' : '')}
            aria-pressed={showSettings}
            onClick={() => setShowSettings((v) => !v)}
            title="Settings"
            aria-label="Settings"
          >
            <GearIcon />
          </TooltipButton>
        </div>
      </header>

      {pretend && (
        <div className="banner warn pretend" role="status">
          <span>
            <b>Read-only: shown as {displayName(pretend)}</b>
            {pretend.username ? ` (${pretend.username})` : ''} would see it. Every button on the board is blocked. Private changes and +2 rights are still your own.
          </span>
          <button type="button" className="btn" onClick={() => void changePretend(null)}>
            Stop pretending
          </button>
        </div>
      )}
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
        <SettingsPanel settings={settings} compact={compact} save={settingsHandle.save} pretend={pretend} onPretend={changePretend} />
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
          setup={setup}
          teamPick={pick}
          onAct={act}
          onGoTo={(t) => {
            setTab(t)
            setShowSettings(false)
          }}
        />
      )}
    </div>
    </LocalReviewProvider>
    </SettingsContext.Provider>
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

/** My Changes counts individual changes; other tabs retain their card summaries. */
function TabCount(props: {
  total: number
  hot: boolean
  segments: TabSegment[]
  individual?: boolean
}) {
  const { total, segments, individual } = props
  if (individual && segments.length === 0) return null
  if (segments.length === 0) return <span className={'count' + (props.hot && total > 0 ? ' hot' : '')}>{total}</span>
  const rest = individual ? 0 : Math.max(0, total - segments.reduce((sum, s) => sum + s.n, 0))
  const title = [...segments.map((s) => `${s.n} ${s.label}`), ...(rest > 0 ? [`${rest} other`] : []), `${total} total`].join(' · ')
  return (
    <span className="count split" title={title}>
      {segments.map((s) => <span key={s.label} className={s.tone}>{s.n}</span>)}
      {rest > 0 && <span>{rest}</span>}
    </span>
  )
}

function initialTab(): TabId {
  const m = /tab=([a-z-]+)/.exec(window.location.hash)
  const id = m?.[1] as TabId | undefined
  return id && TABS.some((t) => t.id === id) ? id : 'needs-my-review'
}

/** `team=<name>` after the tab in the hash picks a watched team on the team tab, `team=-` all of them; without it, the default (screenshot hook). */
function initialTeamPick(): TeamPick | null {
  const m = /team=([^&]*)/.exec(window.location.hash)
  if (!m) return null
  const name = decodeURIComponent(m[1]!)
  return name === '-' ? undefined : name
}

/** GERRIT_GUI_TAB=settings opens the settings panel instead of a board tab (screenshot hook). */
function initialSettingsOpen(): boolean {
  return /tab=settings\b/.test(window.location.hash)
}

/** A desktop notification for each change that the author just asked this user to merge. */
function notifyMergeRequests(d: DashboardData, seen: React.RefObject<Set<number> | null>) {
  const now = new Set(
    classifyAll(d.open, d.self._account_id, NO_TEAMS, accountKeys(d.self))
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
  const waiting = classifyAll(d.open, d.self._account_id, NO_TEAMS, accountKeys(d.self)).filter((v) => v.needsMyReview)
  const now = new Set(waiting.map((v) => v.change._number))
  if (seen.current && typeof Notification !== 'undefined' && Notification.permission !== 'denied') {
    const fresh = waiting.filter((v) => !seen.current!.has(v.change._number))
    for (const { change: c, inPerson } of fresh) {
      new Notification(`${inPerson ? 'In-person review' : 'Review'} requested: ${c.subject}`, { body: `${c.project} · ${c.owner.name ?? ''}` })
    }
  }
  seen.current = now
}
