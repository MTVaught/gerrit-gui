import { useEffect, useMemo, useRef, useState } from 'react'
import type { AccountInfo, ChangeView } from '../../../shared/types.ts'
import {
  AUTHOR_SCOPES,
  DEFAULT_SORT,
  EMPTY_FILTER,
  SORT_OPTIONS,
  accountMatches,
  displayName,
  ownersOf,
  type AuthorScope,
  type SortId,
  type ViewFilter,
} from '../../../shared/model.ts'
import { SlidersIcon } from './Icons.tsx'
import { api } from '../api.ts'

/** Non-default settings the button's badge counts: the search, the author filter, the sort. */
export function activeViewCount(filter: ViewFilter, sort: SortId): number {
  return (filter.search.trim() ? 1 : 0) + (filter.authors.length + filter.scopes.length > 0 ? 1 : 0) + (sort !== DEFAULT_SORT ? 1 : 0)
}

/** Owners shown before typing: the people with the most changes on the tab. */
const QUICK_PICKS = 5

/**
 * The View button in the top bar and its panel: a search over the subjects,
 * an author filter, and the sort order. The author field suggests the owners
 * of the changes on the current tab first, with their counts, then any Gerrit
 * account, so it works the same on a project with ten users or ten thousand.
 * Ctrl+F (Cmd+F) opens the panel with the search focused.
 */
export function ViewMenu(props: {
  sort: SortId
  onSort: (s: SortId) => void
  filter: ViewFilter
  onFilter: (f: ViewFilter) => void
  /** The changes on the current tab, before the filter. */
  tabViews: ChangeView[]
  /** The team scopes need a team from Settings. */
  teamConfigured: boolean
  compact: boolean
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [remote, setRemote] = useState<AccountInfo[]>([])
  const root = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const { filter, onFilter } = props
  const count = activeViewCount(filter, props.sort)

  // Close on a click elsewhere or Escape; the author field takes Escape first to clear itself.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'f') {
        e.preventDefault()
        setOpen(true)
        // Already open: the input exists, so focus it now; otherwise autoFocus does it on mount.
        searchRef.current?.focus()
        searchRef.current?.select()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Owners on this tab, most changes first, minus the ones already picked.
  const picked = useMemo(() => new Set(filter.authors.map((a) => a._account_id)), [filter.authors])
  const owners = useMemo(() => ownersOf(props.tabViews), [props.tabViews])
  const local = useMemo(() => {
    const m = owners.filter((o) => !picked.has(o.account._account_id) && accountMatches(o.account, q))
    return q.trim() ? m : m.slice(0, QUICK_PICKS)
  }, [owners, picked, q])

  // The rest of Gerrit, once two characters are typed; accounts already listed above are left out.
  useEffect(() => {
    if (!open || q.trim().length < 2) {
      setRemote([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      api
        .suggestAccounts(q.trim())
        .then((s) => {
          if (!cancelled) setRemote(s)
        })
        .catch(() => {
          // No account search on this server, or no connection: the owners on the tab still work.
          if (!cancelled) setRemote([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, open])
  const onTab = useMemo(() => new Set(owners.map((o) => o.account._account_id)), [owners])
  const remoteShown = remote.filter((a) => !picked.has(a._account_id) && !onTab.has(a._account_id))

  const pick = (a: AccountInfo) => {
    onFilter({ ...filter, authors: [...filter.authors, a] })
    setQ('')
  }
  const unpick = (a: AccountInfo) => onFilter({ ...filter, authors: filter.authors.filter((x) => x._account_id !== a._account_id) })
  const toggleScope = (s: AuthorScope) =>
    onFilter({ ...filter, scopes: filter.scopes.includes(s) ? filter.scopes.filter((x) => x !== s) : [...filter.scopes, s] })
  const reset = () => {
    onFilter(EMPTY_FILTER)
    props.onSort(DEFAULT_SORT)
    setQ('')
  }
  const scopes = AUTHOR_SCOPES.filter((s) => !s.needsTeam || props.teamConfigured)

  return (
    <div className="view" ref={root}>
      <button
        className={'btn view-btn' + (count > 0 ? ' active' : '')}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Search, filter and sort (Ctrl+F)"
        onClick={() => setOpen((o) => !o)}
      >
        <SlidersIcon />
        {!props.compact && <span>View</span>}
        {count > 0 && (
          <span className="count hot" aria-label={`${count} active`}>
            {count}
          </span>
        )}
        <span className="arrow" aria-hidden>
          ▾
        </span>
      </button>
      {open && (
        <div className="view-panel" role="dialog" aria-label="Search, filter and sort">
          <input
            ref={searchRef}
            type="search"
            autoFocus
            placeholder="Search titles"
            aria-label="Search titles"
            value={filter.search}
            onChange={(e) => onFilter({ ...filter, search: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && filter.search) {
                e.stopPropagation()
                onFilter({ ...filter, search: '' })
              }
            }}
          />
          <h4>Author</h4>
          <div className="author-chips">
            {filter.authors.map((a) => (
              <span key={a._account_id} className="chip filt" title={`Changes owned by ${displayName(a)}`}>
                {displayName(a)}
                <button className="chip-x" aria-label={`Remove ${displayName(a)}`} onClick={() => unpick(a)}>
                  ×
                </button>
              </span>
            ))}
            {scopes.map((s) => (
              <button
                key={s.id}
                className={'chip tog' + (filter.scopes.includes(s.id) ? ' on' : '')}
                aria-pressed={filter.scopes.includes(s.id)}
                title={s.title}
                onClick={() => toggleScope(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Add author"
            aria-label="Add author"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && q) {
                e.stopPropagation()
                setQ('')
              }
              if (e.key === 'Enter') {
                const first = local[0]?.account ?? remoteShown[0]
                if (first) pick(first)
              }
            }}
          />
          {(local.length > 0 || remoteShown.length > 0) && (
            <ul className="view-sugg">
              {local.length > 0 && <li className="head">On this tab</li>}
              {local.map((o) => (
                <li key={o.account._account_id}>
                  <button className="menu-item" onClick={() => pick(o.account)}>
                    <span>{displayName(o.account)}</span>
                    <span className="muted">{o.count}</span>
                  </button>
                </li>
              ))}
              {remoteShown.length > 0 && <li className="head">All of Gerrit</li>}
              {remoteShown.map((a) => (
                <li key={a._account_id}>
                  <button className="menu-item" onClick={() => pick(a)}>
                    <span>{displayName(a)}</span>
                    <span className="muted">{a.email ?? a.username ?? ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <h4>Sort by</h4>
          {SORT_OPTIONS.map((o) => (
            <label key={o.id} className="opt" title={o.title}>
              <input type="radio" name="sort" checked={props.sort === o.id} onChange={() => props.onSort(o.id)} />
              {o.label}
            </label>
          ))}
          <div className="view-foot">
            <span className="muted">Applies to every tab</span>
            <button className="link" disabled={count === 0} onClick={reset}>
              Reset
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
