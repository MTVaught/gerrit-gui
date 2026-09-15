import { useEffect, useRef, useState } from 'react'
import type { AccountInfo, ChangeAction, ChangeView } from '../../../shared/types.ts'
import { READY_TO_MERGE_TAG } from '../../../shared/constants.ts'
import { accountKey, accountKeys, addMerger, displayName, mergerTags, mergersFor } from '../../../shared/model.ts'
import { api } from '../api.ts'
import { useNames } from '../names.ts'
import { useSettings } from '../settings-context.ts'
import type { ActionSpec } from './actions.ts'

const LAST_KEY = 'gerrit-gui.lastMerger'

/** The person last asked for each project, so the usual merger is preselected. */
function lastMergers(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function rememberLast(project: string, merger: string): void {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ ...lastMergers(), [project]: merger }))
  } catch {
    // Storage may be unavailable; the pick then only lasts for this session.
  }
}

/**
 * The owner's "Ready to Merge" button (and, once asked, "Change merger"): a
 * menu that names one person. The mergers set for this project in Settings
 * come first; anyone else on the server is a search away. Confirming tags the
 * change ready-to-merge for that person.
 */
export function MergerPicker(props: { view: ChangeView; spec: ActionSpec; onAct: (a: ChangeAction) => Promise<void>; small?: boolean }) {
  const { view: v, spec } = props
  const c = v.change
  const { settings, save } = useSettings()
  const rules = settings?.mergers ?? []
  const listed = mergersFor(c.project, rules)
  const nameFor = useNames(listed)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [choice, setChoice] = useState<string | null>(null)
  /** An account picked from the search, which is not on the list. */
  const [other, setOther] = useState<AccountInfo | null>(null)
  const [remember, setRemember] = useState(false)
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<AccountInfo[]>([])
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && wrap.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      api
        .suggestAccounts(q.trim())
        .then((s) => {
          if (!cancelled) setSuggestions(s)
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q])

  function toggle() {
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: document.documentElement.clientWidth - r.right })
      // The current merger, else the one asked last time for this project, else the first on the list.
      const current = v.requestedMerger
      const last = lastMergers()[c.project]
      const initial = current && listed.includes(current) ? current : last && listed.includes(last) ? last : (listed[0] ?? null)
      setChoice(initial)
      setOther(current && !listed.includes(current) ? { _account_id: 0, username: current } : null)
      setRemember(false)
      setQ('')
      setSuggestions([])
    }
    setOpen((o) => !o)
  }

  function pickOther(a: AccountInfo) {
    setOther(a)
    setChoice(accountKeys(a)[0] ?? null)
    setQ('')
    setSuggestions([])
  }

  const otherKey = other ? (accountKeys(other)[0] ?? null) : null
  const chosen = choice
  const chosenName = chosen === null ? '' : otherKey === chosen && other ? displayName(other) : nameFor(chosen)
  const changing = spec.key === 'change-merger'

  async function confirm() {
    if (!chosen) return
    setOpen(false)
    rememberLast(c.project, chosen)
    if (remember && otherKey === chosen) await save({ mergers: addMerger(rules, c.project, chosen) })
    await props.onAct({ type: 'requestMerge', id: c._number, merger: chosen, replace: mergerTags(c) })
  }

  const cls = ['btn', spec.primary ? 'primary' : '', props.small ? 'sm' : ''].filter(Boolean).join(' ')
  return (
    <div className="split picker-wrap" ref={wrap}>
      <button className={cls} title={spec.title} disabled={spec.disabled} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        {props.small ? spec.short : spec.label}
        <span className="arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && pos && (
        <div className="menu picker" role="dialog" aria-label="Ask to merge" style={{ top: pos.top, right: pos.right }}>
          <h4>{changing ? 'Ask someone else to merge' : 'Ask to merge'}</h4>
          {listed.length === 0 && !other && <p className="muted small">No mergers are set for {c.project} in Settings. Search for the person to ask.</p>}
          {listed.map((m) => (
            <label key={m} className="opt">
              <input type="radio" name={`merger-${c._number}`} checked={chosen === m} onChange={() => setChoice(m)} />
              <span>{nameFor(m)}</span>
              {nameFor(m) !== m && <span className="muted">{m}</span>}
            </label>
          ))}
          {other && otherKey && (
            <label className="opt">
              <input type="radio" name={`merger-${c._number}`} checked={chosen === otherKey} onChange={() => setChoice(otherKey)} />
              <span>{displayName(other)}</span>
              <span className="muted">{otherKey}</span>
            </label>
          )}
          <div className="picker-search add-reviewer">
            <input
              value={q}
              placeholder={listed.length === 0 ? 'Name, username or email' : 'Someone else: name, username or email'}
              aria-label="Search for someone else"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (suggestions[0]) pickOther(suggestions[0])
                  else if (q.trim()) pickOther({ _account_id: 0, username: accountKey(q) })
                }
              }}
            />
            {suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((a) => (
                  <li key={a._account_id}>
                    <button type="button" className="link" onClick={() => pickOther(a)}>
                      {displayName(a)} <span className="muted">{a.username ?? ''}{a.email ? ` <${a.email}>` : ''}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {other && otherKey && chosen === otherKey && !listed.includes(otherKey) && (
            <label className="opt small">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              <span>Add to the mergers for {c.project}</span>
            </label>
          )}
          <div className="picker-foot">
            {changing && (
              <button
                type="button"
                className="link muted"
                title="Take the change off the merger's queue; it goes back to Approved"
                onClick={() => {
                  setOpen(false)
                  void props.onAct({ type: 'hashtag', id: c._number, remove: [READY_TO_MERGE_TAG, ...mergerTags(c)] })
                }}
              >
                Clear ready-to-merge
              </button>
            )}
            <button type="button" className="btn primary" disabled={!chosen} onClick={() => void confirm()}>
              {chosen ? `Ask ${chosenName} to merge` : 'Pick a person'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
