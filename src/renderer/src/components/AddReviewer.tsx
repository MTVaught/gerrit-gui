import { useEffect, useState } from 'react'
import type { SuggestedReviewerInfo } from '../../../shared/types.ts'
import { displayName } from '../../../shared/model.ts'
import { api } from '../api.ts'

export function AddReviewer(props: { changeId: number; onDone: (reviewer: string | null) => Promise<void> }) {
  const [q, setQ] = useState('')
  const [suggestions, setSuggestions] = useState<SuggestedReviewerInfo[]>([])

  useEffect(() => {
    if (q.trim().length < 2) {
      setSuggestions([])
      return
    }
    let cancelled = false
    const t = setTimeout(() => {
      void api.suggestReviewers(props.changeId, q.trim()).then((s) => {
        if (!cancelled) setSuggestions(s)
      })
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [q, props.changeId])

  return (
    <div className="add-reviewer">
      <input
        autoFocus
        placeholder="Name, username, email, or group"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') void props.onDone(null)
          if (e.key === 'Enter' && q.trim()) void props.onDone(q.trim())
        }}
      />
      {suggestions.length > 0 && (
        <ul className="suggestions">
          {suggestions.map((s) => {
            const key = s.account ? String(s.account._account_id) : s.group!.id
            const label = s.account ? `${displayName(s.account)} ${s.account.email ? `<${s.account.email}>` : ''}` : `${s.group!.name} (group)`
            return (
              <li key={key}>
                <button className="link" onClick={() => void props.onDone(key)}>
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
