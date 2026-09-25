import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, SuggestedReviewerInfo } from '../../../shared/types.ts'
import { accountKey, accountKeys, displayName, normalizeTeam, allMembers } from '../../../shared/model.ts'
import { api } from '../api.ts'
import { useNames } from '../names.ts'
import { useSettings } from '../settings-context.ts'

/** One line of the checklist: a team member, or a person or group picked from the search. */
interface Pick {
  /** What the action names: a username or email for a team member, an account id or group id from the search. */
  reviewer: string
  label: string
  /** Username or email, beside the name. */
  detail: string
  /** Where the entry came from; a search pick is listed after the team and can be dropped again. */
  fromSearch: boolean
  group: boolean
}

/**
 * The "+" on the reviewer chips and the panel it opens. The team from
 * Settings is a checklist; anyone else on the server is a search away and
 * joins the list once picked. One button adds everyone checked. The owner
 * chooses between primary reviewers (tagged; their votes decide) and other
 * reviewers (added in Gerrit only, groups allowed); anyone else adds primary
 * reviewers only.
 */
export function AddReviewer(props: { view: ChangeView; self: AccountInfo; allowOther?: boolean; onAct: (a: ChangeAction) => Promise<void> }) {
  const { view: v } = props
  const id = v.change._number
  const { settings } = useSettings()
  const selfKeys = accountKeys(props.self)
  // The checklist: the primary team, or without one everyone on any team.
  const teams = settings?.teams ?? []
  const own = teams.find((t) => t.name === settings?.primaryTeam)
  const team = normalizeTeam(own ? own.members : allMembers(teams)).filter((k) => !selfKeys.includes(k))
  const nameFor = useNames(team)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [anchor, setAnchor] = useState<{ top: number; bottom: number } | null>(null)
  const [primary, setPrimary] = useState(true)
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [extra, setExtra] = useState<Pick[]>([])
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestedReviewerInfo[]>([])
  const wrap = useRef<HTMLSpanElement>(null)
  const panel = useRef<HTMLDivElement>(null)

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
    if (!open || q.trim().length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      api
        .suggestReviewers(id, q.trim())
        .then((s) => {
          if (!cancelled) setSuggestions(primary ? s.filter((x) => x.account) : s)
        })
        .catch(() => {
          if (!cancelled) setSuggestions([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [open, q, id, primary])

  function toggle() {
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      // Under the "+", kept inside the window on the right; flipped above once its height is known.
      setAnchor({ top: r.top, bottom: r.bottom })
      setPos({ top: r.bottom + 4, left: Math.max(8, Math.min(r.left, document.documentElement.clientWidth - 348)) })
      setPrimary(true)
      setChecked(new Set())
      setExtra([])
      setQ('')
      setSuggestions([])
    }
    setOpen((o) => !o)
  }

  // The panel is position: fixed, so page scrolling never reveals it. When it would run off the
  // bottom of the window, put it above the "+" instead; when it fits neither way, pin it to the top
  // and let it scroll (max-height in CSS).
  useLayoutEffect(() => {
    if (!open || !anchor || !panel.current) return
    const h = panel.current.offsetHeight
    const room = document.documentElement.clientHeight
    setPos((p) => {
      if (!p) return p
      let top = anchor.bottom + 4
      if (top + h > room - 8) top = anchor.top - 4 - h
      if (top < 8) top = 8
      return top === p.top ? p : { ...p, top }
    })
  }, [open, anchor, extra.length, suggestions.length, primary])

  // Who is on the change already: primary reviewers by their tag key, everyone by account.
  const primaryKeys = new Set(v.reviewers.flatMap((r) => (r.key ? [r.key] : accountKeys(r.account))))
  const otherKeys = new Set(v.otherReviewers.flatMap((r) => accountKeys(r.account)))
  const isPrimary = (keys: string[]) => keys.some((k) => primaryKeys.has(k))
  const isOther = (keys: string[]) => keys.some((k) => otherKeys.has(k))

  /** Why a line cannot be checked, or null when it can. */
  function blocked(keys: string[]): string | null {
    if (isPrimary(keys)) return 'already primary'
    if (!primary && isOther(keys)) return 'already on the change'
    return null
  }

  function setOn(reviewer: string, on: boolean) {
    setChecked((s) => {
      const next = new Set(s)
      if (on) next.add(reviewer)
      else next.delete(reviewer)
      return next
    })
  }

  function pickSuggestion(s: SuggestedReviewerInfo) {
    const pick: Pick = s.account
      ? {
          reviewer: String(s.account._account_id),
          label: displayName(s.account),
          detail: s.account.username ?? s.account.email ?? '',
          fromSearch: true,
          group: false,
        }
      : { reviewer: s.group!.id, label: s.group!.name, detail: 'group', fromSearch: true, group: true }
    addPick(pick, s.account ? accountKeys(s.account) : [])
  }

  /** The typed text as is, for a server without account search or a name Gerrit does not suggest. */
  function pickTyped() {
    const key = accountKey(q)
    if (!key) return
    addPick({ reviewer: key, label: key, detail: '', fromSearch: true, group: false }, [key])
  }

  function addPick(pick: Pick, keys: string[]) {
    setQ('')
    setSuggestions([])
    if (blocked(keys)) return
    setExtra((xs) => (xs.some((x) => x.reviewer === pick.reviewer) ? xs : [...xs, pick]))
    setOn(pick.reviewer, true)
  }

  const lines: { pick: Pick; keys: string[] }[] = [
    ...team.map((k) => ({ pick: { reviewer: k, label: nameFor(k), detail: nameFor(k) === k ? '' : k, fromSearch: false, group: false }, keys: [k] })),
    ...extra.map((p) => ({ pick: p, keys: p.group ? [] : [p.reviewer, p.detail].map(accountKey).filter(Boolean) })),
  ]
  const chosen = lines.filter((l) => checked.has(l.pick.reviewer) && !blocked(l.keys) && (primary ? !l.pick.group : true))
  const n = chosen.length

  async function confirm() {
    if (n === 0) return
    setOpen(false)
    for (const l of chosen) {
      await props.onAct(primary ? { type: 'addPrimaryReviewer', id, reviewer: l.pick.reviewer } : { type: 'addReviewer', id, reviewer: l.pick.reviewer })
    }
  }

  const title = props.allowOther
    ? 'Add a primary reviewer, or a reviewer who is not waited for'
    : 'Add a primary reviewer: added to the change in Gerrit and tagged; their vote decides'
  return (
    <span className="picker-wrap" ref={wrap}>
      <button className="chip add" onClick={toggle} title={title} aria-haspopup="dialog" aria-expanded={open}>
        +
      </button>
      {open && pos && (
        <div className="menu picker" role="dialog" aria-label="Add reviewers" ref={panel} style={{ top: pos.top, left: pos.left }}>
          <h4>Add reviewers</h4>
          {team.length === 0 && extra.length === 0 && <p className="muted small">No team is set in Settings. Search for the person to add.</p>}
          <div className="picker-list">
            {lines.map(({ pick, keys }) => {
              const why = blocked(keys) ?? (primary && pick.group ? 'groups cannot be primary' : null)
              const on = why ? isPrimary(keys) || isOther(keys) : checked.has(pick.reviewer)
              return (
                <label key={pick.reviewer} className={'opt' + (why ? ' blocked' : '')}>
                  <input type="checkbox" checked={on} disabled={Boolean(why)} onChange={(e) => setOn(pick.reviewer, e.target.checked)} />
                  <span>{pick.label}</span>
                  <span className="muted">{why ?? (primary && isOther(keys) ? 'on the change, not primary' : pick.detail)}</span>
                </label>
              )
            })}
          </div>
          <div className="picker-search add-reviewer">
            <input
              autoFocus
              value={q}
              placeholder={team.length === 0 ? (primary ? 'Name, username or email' : 'Name, username, email, or group') : 'Someone else: name, username or email'}
              aria-label="Search for someone else"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  if (suggestions[0]) pickSuggestion(suggestions[0])
                  else if (q.trim()) pickTyped()
                  else void confirm()
                }
              }}
            />
            {suggestions.length > 0 && (
              <ul className="suggestions">
                {suggestions.map((s) => (
                  <li key={s.account ? String(s.account._account_id) : s.group!.id}>
                    <button type="button" className="link" onClick={() => pickSuggestion(s)}>
                      {s.account ? displayName(s.account) : s.group!.name}{' '}
                      <span className="muted">{s.account ? `${s.account.username ?? ''}${s.account.email ? ` <${s.account.email}>` : ''}` : '(group)'}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {props.allowOther && (
            <div className="add-mode">
              <label title="Added in Gerrit and tagged reviewer:<name>; their votes decide the state">
                <input type="radio" name={`add-mode-${id}`} checked={primary} onChange={() => setPrimary(true)} /> Primary
              </label>
              <label title="Added in Gerrit only; shown on the change, not waited for">
                <input type="radio" name={`add-mode-${id}`} checked={!primary} onChange={() => setPrimary(false)} /> Other
              </label>
            </div>
          )}
          <div className="picker-foot">
            <button type="button" className="link muted" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={n === 0} onClick={() => void confirm()}>
              {n === 0 ? 'Pick someone' : primary ? `Add ${n} as primary` : `Add ${n} as other`}
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
