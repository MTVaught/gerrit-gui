import { useEffect, useState } from 'react'
import type { SuggestedReviewerInfo } from '../../../shared/types.ts'
import { displayName } from '../../../shared/model.ts'
import { api } from '../api.ts'

/**
 * The box under the reviewer chips that adds one person. A primary reviewer
 * is one account, so in that mode group suggestions are left out. The owner
 * may pick "Other" to add a reviewer in Gerrit who is not waited for, with
 * groups allowed; anyone else adds primary reviewers only.
 */
export function AddReviewer(props: { changeId: number; allowOther?: boolean; onDone: (reviewer: string | null, primary: boolean) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [primary, setPrimary] = useState(true)
  const [suggestions, setSuggestions] = useState<SuggestedReviewerInfo[]>([])

  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void api.suggestReviewers(props.changeId, q.trim()).then((s) => {
        if (!cancelled) setSuggestions(primary ? s.filter((x) => x.account) : s)
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, props.changeId, primary])

  return (
    <div className="add-reviewer">
      {props.allowOther && (
        <div className="add-mode">
          <label title="Added in Gerrit and tagged reviewer:<name>; their vote decides the state">
            <input type="radio" name={`add-mode-${props.changeId}`} checked={primary} onChange={() => setPrimary(true)} /> Primary
          </label>
          <label title="Added in Gerrit only; shown on the change, not waited for">
            <input type="radio" name={`add-mode-${props.changeId}`} checked={!primary} onChange={() => setPrimary(false)} /> Other
          </label>
        </div>
      )}
      <input
        autoFocus
        placeholder={primary ? 'Name, username or email' : 'Name, username, email, or group'}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') void props.onDone(null, primary)
          if (e.key === 'Enter' && q.trim()) void props.onDone(q.trim(), primary)
        }}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((s) => {
            const key = s.account ? String(s.account._account_id) : s.group!.id
            const label = s.account ? `${displayName(s.account)} ${s.account.email ? `<${s.account.email}>` : ''}` : `${s.group!.name} (group)`
            return (
              <li key={key}>
                <button className="link" onClick={() => void props.onDone(key, primary)}>
                  {label}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
