import { useState } from 'react'
import type { AccountInfo, ChangeAction, ChangeView } from '../../../shared/types.ts'
import { STATE_LABEL, displayName, shortChangeId, type ChangeFamily } from '../../../shared/model.ts'
import { ForkIcon } from './Icons.tsx'
import { READY_TO_MERGE_TAG } from '../../../shared/constants.ts'
import { ago } from '../time.ts'
import { ReviewButton } from './ReviewButton.tsx'
import { AddReviewer } from './AddReviewer.tsx'
import { api } from '../api.ts'

interface RowProps {
  view: ChangeView
  self: AccountInfo
  onAct: (a: ChangeAction) => Promise<void>
}

export function ChangeRow(props: RowProps) {
  const { view: v } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'

  return (
    <li className={`change state-${v.state}`}>
      <div className="change-main">
        <div className="change-title">
          <button className="link subject" onClick={() => void api.openChange({ id, project: c.project })} title="Open in Gerrit">
            {c.subject}
          </button>
          <span className={`badge ${v.state}`}>{STATE_LABEL[v.state]}</span>
          {open && (
            <span className={'badge ' + (v.wip ? 'wip' : 'active')} title={v.wip ? 'Work in progress: CI is not running on this change' : 'Active: CI runs on this change'}>
              {v.wip ? 'WIP' : 'Active'}
            </span>
          )}
          {v.staleReadyToMerge && <span className="badge stale">ready-to-merge tag is stale</span>}
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
        <Reviewers {...props} />
      </div>

      <Actions {...props} />
    </li>
  )
}

/**
 * One Change-Id on several branches: one card, one table row per branch.
 * Every member is listed, merged ones included and greyed, so any tab shows
 * where the change is still open and where it is already in. Each row keeps
 * its own reviewers and buttons, because Gerrit reviews each branch on its own.
 */
export function FamilyCard(props: { family: ChangeFamily; lead: ChangeView; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void> }) {
  const { family: f, lead } = props
  const c = lead.change
  return (
    <li className={`change family state-${lead.state}`}>
      <div className="change-main">
        <div className="change-title">
          <button className="link subject" onClick={() => void api.openChange({ id: c._number, project: c.project })} title={`Open #${c._number} in Gerrit`}>
            {c.subject}
          </button>
          <span className="badge branch" title={`Change-Id ${f.key}`}>
            <ForkIcon /> {f.members.length} branches
          </span>
          <span className="muted small">
            Change-Id <code>{shortChangeId(f.key)}</code> · {c.project} · {lead.isMine ? 'you' : displayName(c.owner)}
          </span>
        </div>
        <div className="branches-wrap">
        <table className="branches">
          <thead>
            <tr>
              <th>Branch</th>
              <th>State</th>
              <th>CI</th>
              <th className="col-num">Change</th>
              <th>PS</th>
              <th>Reviewers</th>
              <th className="col-diff">Diff</th>
              <th className="col-updated">Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {f.members.map((v) => (
              <BranchRow key={v.change.id} view={v} self={props.self} onAct={props.onAct} />
            ))}
          </tbody>
        </table>
        </div>
      </div>
    </li>
  )
}

function BranchRow(props: RowProps) {
  const { view: v } = props
  const c = v.change
  const open = c.status === 'NEW'
  return (
    <tr className={open ? '' : 'closed'}>
      <td className="branch" title={c.project}>
        <code>{c.branch}</code>
      </td>
      <td>
        <span className={`badge ${v.state}`}>
          {STATE_LABEL[v.state]}
          {c.status === 'MERGED' && ` ${ago(c.submitted ?? c.updated)}`}
        </span>
        {v.staleReadyToMerge && <span className="badge stale">stale tag</span>}
      </td>
      <td>
        {open ? (
          <span className={'badge ' + (v.wip ? 'wip' : 'active')} title={v.wip ? 'Work in progress: CI is not running on this change' : 'Active: CI runs on this change'}>
            {v.wip ? 'WIP' : 'Active'}
          </span>
        ) : (
          <span className="muted">—</span>
        )}
      </td>
      <td className="col-num">
        <button className="link" onClick={() => void api.openChange({ id: c._number, project: c.project })} title="Open in Gerrit">
          #{c._number}
        </button>
      </td>
      <td>
        {v.patchSet}
        {open && v.reviewRequested && (
          <span className="req" title="Review requested for this patch set">
            asked
          </span>
        )}
        {open && v.requestedPatchSet !== null && !v.reviewRequested && (
          <span className="req stale" title="Votes on that patch set no longer apply to the current one">
            asked PS {v.requestedPatchSet}
          </span>
        )}
      </td>
      <td className="cell-reviewers">
        <Reviewers {...props} bare />
      </td>
      <td className="col-diff">
        {c.insertions !== undefined && (
          <>
            <span className="ins">+{c.insertions}</span> <span className="del">−{c.deletions}</span>
          </>
        )}
        {(c.unresolved_comment_count ?? 0) > 0 && <span className="muted"> · {c.unresolved_comment_count} unresolved</span>}
      </td>
      <td className="col-updated muted">{ago(c.updated)}</td>
      <td className="cell-actions">
        <Actions {...props} inline />
      </td>
    </tr>
  )
}

/** Reviewer chips with votes; `bare` leaves out the "Needs review by" label for table cells. */
function Reviewers(props: RowProps & { bare?: boolean }) {
  const { view: v, self } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const owner = open && v.isMine
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className={props.bare ? 'reviewers bare' : 'reviewers'}>
          {!props.bare && open && v.reviewers.length > 0 && (
            <span className={'reviewers-label ' + (v.reviewRequested ? 'asked' : 'not-asked')}>
              {!v.reviewRequested
                ? 'Review not requested'
                : v.pending.length > 0
                  ? 'Needs review by'
                  : 'Reviewed by everyone'}
            </span>
          )}
          {v.reviewers.length === 0 && open && (
            <span className="chip warn" title={v.teamScoped && v.externalReviewers.length > 0 ? 'Only team votes decide the state, and nobody on the team is a reviewer' : undefined}>
              {v.teamScoped && v.externalReviewers.length > 0 ? 'no team reviewers' : 'no reviewers'}
            </span>
          )}
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
            <button className="chip add" onClick={() => setAdding((a) => !a)} title="Add reviewer">
              {props.bare ? '+' : '+ reviewer'}
            </button>
          )}
        </div>
        {v.externalReviewers.length > 0 && (
          <div className="reviewers external">
            <span className="reviewers-label not-asked" title="Reviewers outside your team. Their votes do not change the state.">
              Outside the team
            </span>
            {[...v.externalReviewers]
              .sort((a, b) => Number(b.vote === 0) - Number(a.vote === 0))
              .map((r) => (
                <span
                  key={r.account._account_id}
                  className={'chip ext ' + (r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : '')}
                  title={
                    r.vote !== 0
                      ? `outside the team, voted ${fmtVote(r.vote)} on patch set ${v.patchSet}; this vote does not change the state`
                      : 'outside the team, has not voted; not waited for'
                  }
                >
                  {displayName(r.account)}
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
          </div>
        )}
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

/** The buttons for one change; `inline` lays them out in a row for table cells. */
function Actions(props: RowProps & { inline?: boolean }) {
  const { view: v } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const owner = open && v.isMine
  const merger = v.canMerge && (v.state === 'ready-to-merge' || v.staleReadyToMerge)
  const requestLabel =
    v.requestedPatchSet !== null && v.requestedPatchSet < v.patchSet
      ? `Re-request review (PS ${v.patchSet})`
      : `Request review (PS ${v.patchSet})`
  return (
    <div className={props.inline ? 'actions inline' : 'actions'}>
      {owner && !v.reviewRequested && v.state !== 'approved' && v.state !== 'ready-to-merge' && (
        <button
          className="btn primary"
          disabled={v.reviewers.length === 0 && v.externalReviewers.length === 0}
          title={
            v.reviewers.length === 0 && v.externalReviewers.length === 0
              ? 'Add a reviewer first'
              : v.reviewers.length === 0
                ? 'Only external reviewers are on this change; it cannot be approved until a team member is added'
                : 'Ask every reviewer to look at this patch set'
          }
          onClick={() => void props.onAct({ type: 'requestReview', id, patchSet: v.patchSet })}
        >
          {requestLabel}
        </button>
      )}
      {owner && v.reviewRequested && v.state === 'needs-review' && (
        <button className="btn" onClick={() => void props.onAct({ type: 'withdrawReview', id })}>
          Withdraw request
        </button>
      )}
      {owner && v.state === 'approved' && (
        <button className="btn primary" onClick={() => void props.onAct({ type: 'hashtag', id, add: [READY_TO_MERGE_TAG] })}>
          Ready to merge
        </button>
      )}
      {v.canMerge && v.state === 'ready-to-merge' && (
        <button
          className="btn primary"
          disabled={v.wip}
          title={v.wip ? 'Still WIP, so CI has not run. Mark it active first.' : 'Vote +2 on this patch set and submit it'}
          onClick={() => void props.onAct({ type: 'merge', id })}
        >
          +2 and submit
        </button>
      )}
      {open && (v.state === 'ready-to-merge' || v.staleReadyToMerge) && (v.isMine || merger) && (
        <button className="btn" onClick={() => void props.onAct({ type: 'hashtag', id, remove: [READY_TO_MERGE_TAG] })}>
          Clear ready-to-merge
        </button>
      )}
      {(owner || (merger && v.wip)) && (
        <button
          className="btn subtle"
          title={v.wip ? 'Clear WIP so CI runs on this change' : 'Mark WIP so CI stops running on this change'}
          onClick={() => void props.onAct({ type: 'setWip', id, wip: !v.wip })}
        >
          {v.wip ? 'Mark active (runs CI)' : 'Mark WIP'}
        </button>
      )}
      {open && v.iAmReviewer && !v.isMine && <ReviewButton view={v} />}
    </div>
  )
}

function fmtVote(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}
