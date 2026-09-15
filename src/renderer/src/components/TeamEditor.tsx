import { useEffect, useState } from 'react'
import type { AccountInfo } from '../../../shared/types.ts'
import { accountKey, accountKeys, displayName, normalizeTeam, preferredKey } from '../../../shared/model.ts'
import { api } from '../api.ts'
import { useNames } from '../names.ts'

/**
 * The team list in Settings: one chip per member, an input that suggests
 * Gerrit accounts as you type, and Enter or Add to take the typed text as is.
 * Members are stored as usernames or email addresses, which is what the
 * classifier compares against, so the list stays readable in the settings file.
 * The chips show the account's name, looked up from the server; the stored key
 * is in the tooltip. New entries are written as usernames when the server
 * knows the account; older entries typed as emails still match.
 */
export function TeamEditor(props: {
  members: string[]
  onChange: (members: string[]) => void
  canSearch: boolean
  /** Shown while the list is empty. */
  emptyText?: string
  /** What an entry is called in the labels; "team member" by default. */
  noun?: string
}) {
  const nameFor = useNames(props.members)
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<AccountInfo[]>([])

  useEffect(() => {
    if (!props.canSearch || q.trim().length < 2) {
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
          // No connection yet, or the server has no account search. Typing still works.
          if (!cancelled) setSuggestions([])
        })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, props.canSearch])

  function add(entry: string) {
    const next = normalizeTeam([...props.members, entry])
    props.onChange(next)
    setQ('')
    setSuggestions([])
  }

  /** Typed text: stored as the username when the server resolves it, else as typed. */
  async function addTyped(text: string) {
    const key = accountKey(text)
    if (!key) return
    if (!props.canSearch) return add(key)
    let resolved = key
    try {
      const a = (await api.lookupAccounts([key])).find((x) => accountKeys(x).includes(key))
      if (a) resolved = preferredKey(a) ?? key
    } catch {
      // No connection; the entry is stored as typed and matched either way.
    }
    add(resolved)
  }

  function remove(entry: string) {
    props.onChange(props.members.filter((m) => m !== entry))
  }

  return (
    <div className="team-editor">
      <div className="team-members">
        {props.members.length === 0 && <span className="muted small">{props.emptyText ?? 'No team yet: every reviewer counts.'}</span>}
        {props.members.map((m) => {
          const name = nameFor(m)
          return (
            <span key={m} className="chip member" title={m}>
              {name}
              <button type="button" className="chip-x" title={`Remove ${name}`} aria-label={`Remove ${name}`} onClick={() => remove(m)}>
                ×
              </button>
            </span>
          )
        })}
      </div>
      <div className="team-add">
        <div className="add-reviewer">
          <input
            value={q}
            placeholder="Username or email"
            aria-label={`Add a ${props.noun ?? 'team member'}`}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (q.trim()) void addTyped(q)
              }
              if (e.key === 'Escape') setSuggestions([])
            }}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((a) => {
                const key = preferredKey(a)
                if (!key) return null
                return (
                  <li key={a._account_id}>
                    <button type="button" className="link" onClick={() => add(key)}>
                      {displayName(a)} <span className="muted">{a.username ?? ''}{a.email ? ` <${a.email}>` : ''}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <button type="button" className="btn" disabled={!q.trim()} onClick={() => void addTyped(q)}>
          Add
        </button>
      </div>
    </div>
  )
}
