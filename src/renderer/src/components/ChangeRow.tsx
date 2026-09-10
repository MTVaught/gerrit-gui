import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, ReviewerStatus } from '../../../shared/types.ts'
import { STATE_LABEL, displayName, type ChangeFamily } from '../../../shared/model.ts'
import { ForkIcon } from './Icons.tsx'
import { actionClass, changeActions } from './actions.ts'
import { ago } from '../time.ts'
import { ReviewButton } from './ReviewButton.tsx'
import { AddReviewer } from './AddReviewer.tsx'
import { api } from '../api.ts'

interface RowProps {
  view: ChangeView
  self: AccountInfo
  onAct: (a: ChangeAction) => Promise<void>
}

/**
 * One change on one branch: a card with a title line and one row. It is the
 * same row a family card uses for each of its branches, so a change reads
 * the same whether or not it has cherry-picks.
 */
export function ChangeRow(props: RowProps) {
  const { view: v } = props
  return (
    <li className={`change state-${v.state}`}>
      <CardHead view={v} />
      <BranchRow {...props} />
    </li>
  )
}

/**
 * One Change-Id on several branches: one card, one row per branch. Every
 * member is listed, merged ones included and greyed, so any tab shows where
 * the change is still open and where it is already in. Each row keeps its
 * own reviewers and buttons, because Gerrit reviews each branch on its own.
 */
export function FamilyCard(props: { family: ChangeFamily; lead: ChangeView; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void> }) {
  const { family: f, lead } = props
  return (
    <li className={`change family state-${lead.state}`}>
      <CardHead view={lead} family={f} />
      {f.members.map((v) => (
        <BranchRow key={v.change.id} view={v} self={props.self} onAct={props.onAct} />
      ))}
    </li>
  )
}

/** Subject, branch count for a family, and who owns it where. */
function CardHead(props: { view: ChangeView; family?: ChangeFamily }) {
  const { view: v, family: f } = props
  const c = v.change
  return (
    <div className="change-head">
      <button className="link subject" onClick={() => void api.openChange({ id: c._number, project: c.project })} title={`Open #${c._number} in Gerrit`}>
        {c.subject}
      </button>
      {f && (
        <span className="badge branch" title={`Change-Id ${f.key}`}>
          <ForkIcon /> {f.members.length} branches
        </span>
      )}
      <span className="muted small origin">
        {c.project} · {v.isMine ? 'you' : displayName(c.owner)}
      </span>
    </div>
  )
}

/**
 * The cells of one branch: branch, state, CI, number, patch set, reviewers,
 * diff, age, buttons. The card is a subgrid of its list, so every card in a
 * section lines these up in the same columns.
 */
function BranchRow(props: RowProps) {
  const { view: v } = props
  const c = v.change
  const open = c.status === 'NEW'
  return (
    <div className={open ? 'change-row' : 'change-row closed'}>
      <span className="cell c-branch" title={c.project}>
        <code>{c.branch}</code>
      </span>
      <span className="cell c-state">
        <span className={`badge ${v.state}`}>
          {STATE_LABEL[v.state]}
          {c.status === 'MERGED' && ` ${ago(c.submitted ?? c.updated)}`}
        </span>
        {v.staleReadyToMerge && (
          <span className="badge stale" title="Tagged ready-to-merge, but a new patch set reset the approval">
            stale tag
          </span>
        )}
      </span>
      <span className="cell c-ci">
        {open && (
          <span className={'badge ' + (v.wip ? 'wip' : 'active')} title={v.wip ? 'Work in progress: CI is not running on this change' : 'Active: CI runs on this change'}>
            {v.wip ? 'WIP' : 'Active'}
          </span>
        )}
      </span>
      <span className="cell c-num">
        <button className="link" onClick={() => void api.openChange({ id: c._number, project: c.project })} title="Open in Gerrit">
          #{c._number}
        </button>
      </span>
      <span className="cell c-ps">
        <span>PS {v.patchSet}</span>
        {open && v.reviewRequested && (
          <span className="req" title="Review requested for this patch set">
            asked
          </span>
        )}
        {open && v.requestedPatchSet !== null && !v.reviewRequested && (
          <span className="req stale" title="Review was requested for an earlier patch set; votes on it no longer apply">
            asked PS {v.requestedPatchSet}
          </span>
        )}
      </span>
      <div className="cell c-reviewers">
        <Reviewers {...props} />
      </div>
      <span className="cell c-diff">
        {c.insertions !== undefined && (
          <span>
            <span className="ins">+{c.insertions}</span> <span className="del">−{c.deletions}</span>
          </span>
        )}
        {(c.unresolved_comment_count ?? 0) > 0 && <span className="muted">{c.unresolved_comment_count} unresolved</span>}
      </span>
      <span className="cell c-updated muted" title={c.updated}>
        {ago(c.updated)}
      </span>
      <div className="cell c-actions">
        <Actions {...props} />
      </div>
    </div>
  )
}

/** Votes first, a -1 before a +1, so the chips that matter survive truncation. */
function byVote(rs: ReviewerStatus[]): ReviewerStatus[] {
  const rank = (r: ReviewerStatus) => (r.vote < 0 ? 0 : r.vote > 0 ? 1 : 2)
  return [...rs].sort((a, b) => rank(a) - rank(b))
}

/**
 * Reviewer chips with votes: the team on the first line, reviewers outside
 * the team on a second one (dashed, since their votes do not change the
 * state). Each line is one row of chips; what does not fit is behind "+N".
 */
export function Reviewers(props: RowProps) {
  const { view: v, self } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const owner = open && v.isMine
  const [adding, setAdding] = useState(false)

  const remove = (r: ReviewerStatus) =>
    owner && (
      <button className="chip-x" title="Remove reviewer" onClick={() => void props.onAct({ type: 'removeReviewer', id, accountId: r.account._account_id })}>
        ×
      </button>
    )
  const name = (r: ReviewerStatus) => (r.account._account_id === self._account_id ? 'you' : displayName(r.account))
  const label = (r: ReviewerStatus) => (r.vote !== 0 ? `${name(r)} ${fmtVote(r.vote)}` : name(r))
  const body = (r: ReviewerStatus) => (
    <>
      {name(r)}
      {r.vote !== 0 && <b> {fmtVote(r.vote)}</b>}
      {remove(r)}
    </>
  )

  const team: Chip[] = byVote(v.reviewers).map((r) => ({
    key: String(r.account._account_id),
    className: r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : open && v.reviewRequested ? 'pending' : '',
    title:
      r.vote !== 0
        ? `voted ${fmtVote(r.vote)} on patch set ${v.patchSet}`
        : v.reviewRequested
          ? 'asked to review this patch set, has not voted yet'
          : 'reviewer, but review has not been requested for this patch set',
    label: label(r),
    children: body(r),
  }))
  if (team.length === 0 && open) {
    const onlyExternal = v.teamScoped && v.externalReviewers.length > 0
    team.push({
      key: 'none',
      className: 'warn',
      title: onlyExternal ? 'Only team votes decide the state, and nobody on the team is a reviewer' : 'Add a reviewer to get this change reviewed',
      label: onlyExternal ? 'no team reviewers' : 'no reviewers',
      children: onlyExternal ? 'no team reviewers' : 'no reviewers',
    })
  }
  const external: Chip[] = byVote(v.externalReviewers).map((r) => ({
    key: String(r.account._account_id),
    className: 'ext ' + (r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : ''),
    title:
      r.vote !== 0
        ? `outside the team, voted ${fmtVote(r.vote)} on patch set ${v.patchSet}; this vote does not change the state`
        : 'outside the team, has not voted; not waited for',
    label: label(r),
    children: body(r),
  }))

  return (
    <>
      <ChipRow
        chips={team}
        trailing={
          owner && (
            <button className="chip add" onClick={() => setAdding((a) => !a)} title="Add reviewer">
              +
            </button>
          )
        }
      />
      {external.length > 0 && <ChipRow className="external" chips={external} />}
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

interface Chip {
  key: string
  className: string
  title: string
  /** Plain text for the tooltip of the "+N" chip that stands in for hidden ones. */
  label: string
  children: ReactNode
}

/**
 * One line of chips. Chips that do not fit are replaced by a "+N" chip, which
 * lists them in its tooltip and expands the line on click. The line is
 * measured after every render that shows all chips: on mount, when the chips
 * change, and when the line is resized.
 */
function ChipRow(props: { chips: Chip[]; trailing?: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  // null: all chips are rendered so they can be measured.
  const [limit, setLimit] = useState<number | null>(null)
  const [expanded, setExpanded] = useState(false)
  const n = props.chips.length
  const signature = props.chips.map((c) => c.key + '\0' + c.label).join('\n')

  useLayoutEffect(() => setLimit(null), [signature])
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    let width = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return
      width = el.clientWidth
      setLimit(null)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useLayoutEffect(() => {
    if (limit !== null || expanded) return
    const el = ref.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0
    const kids = Array.from(el.children) as HTMLElement[]
    // Where each chip ends, as laid out, so margins and fractional widths count.
    const ends = kids.filter((k) => k.dataset['chip'] !== undefined).map((k) => k.getBoundingClientRect().right - box.left)
    const ghost = kids.find((k) => k.dataset['ghost'] !== undefined)?.getBoundingClientRect().width ?? 0
    const reserved = kids.filter((k) => k.dataset['trailing'] !== undefined).reduce((s, k) => s + k.getBoundingClientRect().width + gap, 0)
    if (ends.length === 0 || ends[ends.length - 1]! + reserved <= box.width) {
      setLimit(ends.length)
      return
    }
    // Room for the "+N" chip after the ones that stay.
    let k = ends.length - 1
    while (k > 0 && ends[k - 1]! + gap + ghost + reserved > box.width) k--
    setLimit(k)
  })

  const shown = expanded || limit === null ? props.chips : props.chips.slice(0, limit)
  const hidden = props.chips.slice(shown.length)
  return (
    <div ref={ref} className={['reviewers', props.className, expanded ? 'expanded' : ''].filter(Boolean).join(' ')}>
      {shown.map((c) => (
        <span key={c.key} data-chip="" className={'chip ' + c.className} title={c.title}>
          {c.children}
        </span>
      ))}
      {hidden.length > 0 && (
        <button className="chip more" title={hidden.map((c) => c.label).join(', ')} onClick={() => setExpanded(true)}>
          +{hidden.length}
        </button>
      )}
      {expanded && n > 0 && (
        <button
          className="chip more"
          title="Show fewer"
          onClick={() => {
            setExpanded(false)
            setLimit(null)
          }}
        >
          less
        </button>
      )}
      {props.trailing && (
        <span data-trailing="" className="trailing">
          {props.trailing}
        </span>
      )}
      <span data-ghost="" className="chip more ghost" aria-hidden="true">
        +{n}
      </span>
    </div>
  )
}

/** The buttons for one change, in a row at the end of its cells. */
function Actions(props: RowProps) {
  const { view: v } = props
  const open = v.change.status === 'NEW'
  return (
    <div className="actions">
      {changeActions(v, props.onAct).map((a) => (
        <button key={a.key} className={actionClass(a)} disabled={a.disabled} title={a.title} onClick={a.run}>
          {a.label}
        </button>
      ))}
      {open && v.iAmReviewer && !v.isMine && <ReviewButton view={v} />}
    </div>
  )
}

function fmtVote(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}
