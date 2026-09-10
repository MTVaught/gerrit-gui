import { useState } from 'react'
import type { AccountInfo, ChangeAction, ChangeView } from '../../../shared/types.ts'
import { displayName } from '../../../shared/model.ts'
import { AddReviewer } from './AddReviewer.tsx'
import { fmtVote } from './actions.ts'

/** Reviewer chips with votes; the owner can remove reviewers and add new ones. */
export function ReviewerChips(props: { view: ChangeView; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void> }) {
  const { view: v, self } = props
  const [adding, setAdding] = useState(false)
  const id = v.change._number
  const open = v.change.status === 'NEW'
  const owner = open && v.isMine
  return (
    <>
      <div className="reviewers">
        {open && v.reviewers.length > 0 && (
          <span className={'reviewers-label ' + (v.reviewRequested ? 'asked' : 'not-asked')}>
            {!v.reviewRequested ? 'Review not requested' : v.pending.length > 0 ? 'Needs review by' : 'Reviewed by everyone'}
          </span>
        )}
        {v.reviewers.length === 0 && open && <span className="chip warn">no reviewers</span>}
        {[...v.reviewers]
          .sort((a, b) => Number(b.vote === 0) - Number(a.vote === 0))
          .map((r) => (
            <span
              key={r.account._account_id}
              className={'chip ' + (r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : open && v.reviewRequested ? 'pending' : '')}
              title={
                r.vote !== 0
                  ? `voted ${fmtVote(r.vote)} on patch set ${v.patchSet}`
                  : v.reviewRequested
                    ? 'asked to review this patch set, has not voted yet'
                    : 'reviewer, but review has not been requested for this patch set'
              }
            >
              {r.account._account_id === self._account_id ? 'you' : displayName(r.account)}
              {r.vote !== 0 && <b> {fmtVote(r.vote)}</b>}
              {owner && (
                <button
                  className="chip-x"
                  title="Remove reviewer"
                  onClick={() => void props.onAct({ type: 'removeReviewer', id, accountId: r.account._account_id })}
                >
                  ×
                </button>
              )}
            </span>
          ))}
        {owner && (
          <button className="chip add" onClick={() => setAdding((a) => !a)}>
            + reviewer
          </button>
        )}
      </div>
      {adding && (
        <AddReviewer
          changeId={id}
          onDone={async (reviewer) => {
            setAdding(false)
            if (reviewer) await props.onAct({ type: 'addReviewer', id, reviewer })
          }}
        />
      )}
    </>
  )
}
