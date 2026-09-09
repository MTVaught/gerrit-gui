import { useState } from 'react'

export function VoteDialog(props: {
  subject: string
  range: { min: number; max: number }
  current: number
  onVote: (value: number, message: string) => Promise<void>
  onCancel: () => void
}) {
  const [message, setMessage] = useState('')
  const [value, setValue] = useState<number>(props.current > 0 ? props.current : 1)
  // Reviewers vote +1 or -1. +2 belongs to the merger and is normally cast by
  // the "+2 and submit" button, so it is listed last.
  const options: { v: number; label: string }[] = []
  if (props.range.max >= 1) options.push({ v: 1, label: '+1 Reviewed, looks good' })
  if (props.range.min <= -1) options.push({ v: -1, label: '−1 Needs changes' })
  if (props.range.min <= -2) options.push({ v: -2, label: '−2 Do not merge (sticky across patch sets)' })
  if (props.range.max >= 2) options.push({ v: 2, label: '+2 Merger approval (the Ready to merge tab has a "+2 and submit" button that does this and submits)' })

  return (
    <div className="modal-backdrop" onClick={props.onCancel}>
      <div className="modal" role="dialog" aria-label="Review" onClick={(e) => e.stopPropagation()}>
        <h3>Review: {props.subject}</h3>
        <p className="muted small">
          Any vote removes you from "needs review by" for this patch set. You will only be asked again when the author
          requests review of a newer patch set.
        </p>
        <div className="vote-options">
          {options.map((o) => (
            <label key={o.v} className={'vote-option' + (value === o.v ? ' selected' : '')}>
              <input type="radio" name="vote" checked={value === o.v} onChange={() => setValue(o.v)} />
              {o.label}
            </label>
          ))}
          {options.length === 0 && <p className="error">You are not permitted to vote on Code-Review here.</p>}
        </div>
        <textarea
          rows={4}
          placeholder={value < 0 ? 'What needs to change? (required)' : 'Optional comment'}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
        />
        <div className="row">
          <button
            className="btn primary"
            disabled={options.length === 0 || (value < 0 && message.trim() === '')}
            onClick={() => void props.onVote(value, message.trim())}
          >
            Post review
          </button>
          <button className="btn" onClick={props.onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
