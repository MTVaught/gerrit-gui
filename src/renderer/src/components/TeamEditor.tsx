import { useEffect, useState } from 'react'
import type { AccountInfo } from '../../../shared/types.ts'
import { displayName, normalizeTeam } from '../../../shared/model.ts'
import { api } from '../api.ts'

/**
 * The team list in Settings: one chip per member, an input that suggests
 * Gerrit accounts as you type, and Enter or Add to take the typed text as is.
 * Members are stored as usernames or email addresses, which is what the
 * classifier compares against, so the list stays readable in the settings file.
 */
export function TeamEditor(props: { members: string[]; onChange: (members: string[]) => void; canSearch: boolean }) {
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

  function remove(entry: string) {
    props.onChange(props.members.filter((m) => m !== entry))
  }

  return (
    <div className="team-editor">
      <div className="team-members">
        {props.members.length === 0 && <span className="muted small">No team yet: every reviewer counts.</span>}
        {props.members.map((m) => (
          <span key={m} className="chip member">
            {m}
            <button type="button" className="chip-x" title={`Remove ${m} from the team`} aria-label={`Remove ${m}`} onClick={() => remove(m)}>
              ×
            </button>
          </span>
        ))}
      </div>
      <div className="team-add">
        <div className="add-reviewer">
          <input
            value={q}
            placeholder="Username or email"
            aria-label="Add a team member"
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (q.trim()) add(q.trim())
              }
              if (e.key === 'Escape') setSuggestions([])
            }}
          />
          {suggestions.length > 0 && (
            <ul className="suggestions">
              {suggestions.map((a) => {
                const key = a.username ?? a.email
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
        <button type="button" className="btn" disabled={!q.trim()} onClick={() => add(q.trim())}>
          Add
        </button>
      </div>
    </div>
  )
}
