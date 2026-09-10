import { useState } from 'react'
import type { AccountInfo, ChangeAction, ChangeView } from '../../../shared/types.ts'
import { STATE_LABEL, displayName } from '../../../shared/model.ts'
import { ago } from '../time.ts'
import { VoteDialog } from './VoteDialog.tsx'
import { ReviewerChips } from './ReviewerChips.tsx'
import { actionClass, changeActions } from './actions.ts'
import { api } from '../api.ts'

/** Full-size card row: everything visible, actions in a column on the right. */
export function ChangeRow(props: { view: ChangeView; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void> }) {
  const { view: v, self } = props
  const c = v.change
  const [voting, setVoting] = useState(false)
  const id = c._number
  const open = c.status === 'NEW'
  const actions = changeActions(v, props.onAct, () => setVoting(true))

  return (
    <li className={`change state-${v.state}`}>
      <div className="change-main">
        <div className="change-title">
          <button className="link subject" onClick={() => void api.openChange(id)} title="Open in Gerrit">
            {c.subject}
          </button>
          <span className="badges">
            <span className={`badge ${v.state}`}>{STATE_LABEL[v.state]}</span>
            {open && (
              <span className={'badge ' + (v.wip ? 'wip' : 'active')} title={v.wip ? 'Work in progress: CI is not running on this change' : 'Active: CI runs on this change'}>
                {v.wip ? 'WIP' : 'Active'}
              </span>
            )}
            {v.staleReadyToMerge && <span className="badge stale">ready-to-merge tag is stale</span>}
          </span>
        </div>
        <div className="change-meta muted">
          <span>#{id}</span>
          <span>{c.project}</span>
          <span>{c.branch}</span>
          <span>{v.isMine ? 'you' : displayName(c.owner)}</span>
          <span>PS {v.patchSet}</span>
          {open && v.reviewRequested && <span>review requested for PS {v.patchSet}</span>}
          {open && v.requestedPatchSet !== null && !v.reviewRequested && (
            <span title="Votes on that patch set no longer apply to the current one">last requested on PS {v.requestedPatchSet}</span>
          )}
          {c.insertions !== undefined && (
            <span>
              <span className="ins">+{c.insertions}</span> <span className="del">−{c.deletions}</span>
            </span>
          )}
          {(c.unresolved_comment_count ?? 0) > 0 && <span>{c.unresolved_comment_count} unresolved</span>}
          <span>{ago(c.updated)}</span>
        </div>
        <ReviewerChips view={v} self={self} onAct={props.onAct} />
      </div>

      <div className="actions">
        {actions.map((a) => (
          <button key={a.key} className={actionClass(a)} disabled={a.disabled} title={a.title} onClick={a.run}>
            {a.label}
          </button>
        ))}
      </div>

      {voting && (
        <VoteDialog
          subject={c.subject}
          range={v.canVote}
          current={v.myVote}
          onCancel={() => setVoting(false)}
          onVote={async (value, message) => {
            setVoting(false)
            await props.onAct({ type: 'vote', id, value, message })
          }}
        />
      )}
    </li>
  )
}
