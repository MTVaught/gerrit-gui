import { Fragment, useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AccountInfo, ChangeAction, ChangeView, ReviewerStatus } from '../../../shared/types.ts'
import { STATE_LABEL, displayName, sortViews, type SortId } from '../../../shared/model.ts'
import { ago } from '../time.ts'
import { VoteDialog } from './VoteDialog.tsx'
import { ReviewerChips } from './ReviewerChips.tsx'
import { actionClass, changeActions, fmtVote } from './actions.ts'
import type { Group } from './Board.tsx'
import { api } from '../api.ts'

/**
 * Compact layout: a ledger with one line per change. Columns are fixed so
 * the subject column absorbs the width; the reviewers column carries the
 * votes as badges on avatars; the last column holds the one primary action.
 * Opening a row shows the state badges, the reviewer chips and the rest.
 */
export function Ledger(props: { groups: Group[]; sort: SortId; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void> }) {
  // Below 400px the CI column goes; WIP still shows in the detail row.
  const narrow = useMediaQuery('(max-width: 399px)')
  const columns = narrow ? 3 : 4
  return (
    <table className="ledger">
      <colgroup>
        <col />
        {!narrow && <col className="ci" />}
        <col className="rv" />
        <col className="ac" />
      </colgroup>
      <thead>
        <tr>
          <th>Change</th>
          {!narrow && <th>CI</th>}
          <th>Reviewers</th>
          <th aria-label="Action" />
        </tr>
      </thead>
      {props.groups.map((g) => (
        <tbody key={g.title}>
          <tr className="g">
            <td colSpan={columns}>
              {g.title} <span className="count">{g.items.length}</span>
              {g.hint && <span className="hint">{g.hint}</span>}
            </td>
          </tr>
          {sortViews(g.items, props.sort).map((v) => (
            <LedgerRow key={v.change.id} view={v} self={props.self} onAct={props.onAct} showCi={!narrow} columns={columns} />
          ))}
        </tbody>
      ))}
    </table>
  )
}

function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = () => setMatches(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return matches
}

function LedgerRow(props: {
  view: ChangeView
  self: AccountInfo
  onAct: (a: ChangeAction) => Promise<void>
  showCi: boolean
  columns: number
}) {
  const { view: v, self } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const [expanded, setExpanded] = useState(false)
  const [voting, setVoting] = useState(false)
  const actions = changeActions(v, props.onAct, () => setVoting(true))
  const primary = actions.find((a) => a.primary)
  const rest = actions.filter((a) => a !== primary)
  const toggle = () => setExpanded((e) => !e)

  const sub: ReactNode[] = [`#${id}`]
  if (!v.isMine) sub.push(displayName(c.owner))
  sub.push(`PS ${v.patchSet}`)
  if (c.insertions !== undefined) {
    sub.push(
      <>
        <span className="ins">+{c.insertions}</span> <span className="del">−{c.deletions}</span>
      </>,
    )
  }
  if ((c.unresolved_comment_count ?? 0) > 0) sub.push(`${c.unresolved_comment_count} unresolved`)
  sub.push(ago(c.updated))

  return (
    <>
      <tr className={`lrow state-${v.state}${expanded ? ' open' : ''}`}>
        <td className="c" onClick={toggle}>
          <button className="link t" aria-expanded={expanded} onClick={(e) => { e.stopPropagation(); toggle() }}>
            {c.subject}
          </button>
          <div className="s" title={`${c.project} · ${c.branch}`}>
            {sub.map((part, i) => (
              <Fragment key={i}>
                {i > 0 && <span className="sep">·</span>}
                {part}
              </Fragment>
            ))}
          </div>
        </td>
        {props.showCi && (
          <td className="ci" onClick={toggle}>
            {open && <CiBadge wip={v.wip} />}
          </td>
        )}
        <td className="r" onClick={toggle}>
          <Avatars reviewers={v.reviewers} view={v} self={self} />
        </td>
        <td className="a">
          {primary ? (
            <button className={actionClass(primary, 'sm')} disabled={primary.disabled} title={primary.title ?? primary.label} onClick={primary.run}>
              {primary.short}
            </button>
          ) : (
            <button className="btn sm more" aria-label={expanded ? 'Hide details' : 'Show details'} aria-expanded={expanded} onClick={toggle}>
              ···
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className="ldetail">
          <td colSpan={props.columns}>
            <div className="ldet-badges">
              <span className={`badge ${v.state}`}>{STATE_LABEL[v.state]}</span>
              {open && !props.showCi && <CiBadge wip={v.wip} />}
              {v.staleReadyToMerge && <span className="badge stale">ready-to-merge tag is stale</span>}
              <span className="muted">
                {c.project} · {c.branch}
                {open && v.reviewRequested && ` · review requested for PS ${v.patchSet}`}
                {open && v.requestedPatchSet !== null && !v.reviewRequested && ` · last requested on PS ${v.requestedPatchSet}`}
              </span>
            </div>
            <ReviewerChips view={v} self={self} onAct={props.onAct} />
            <div className="ldet-actions">
              {rest.map((a) => (
                <button key={a.key} className={actionClass(a, 'sm')} disabled={a.disabled} title={a.title} onClick={a.run}>
                  {a.label}
                </button>
              ))}
              <button className="btn sm" onClick={() => void api.openChange(id)}>
                Open in Gerrit ↗
              </button>
            </div>
          </td>
        </tr>
      )}
      {voting &&
        createPortal(
          <VoteDialog
            subject={c.subject}
            range={v.canVote}
            current={v.myVote}
            onCancel={() => setVoting(false)}
            onVote={async (value, message) => {
              setVoting(false)
              await props.onAct({ type: 'vote', id, value, message })
            }}
          />,
          document.body,
        )}
    </>
  )
}

function CiBadge(props: { wip: boolean }) {
  return (
    <span className={'badge ' + (props.wip ? 'wip' : 'active')} title={props.wip ? 'Work in progress: CI is not running' : 'Active: CI runs on this change'}>
      {props.wip ? 'WIP' : 'Active'}
    </span>
  )
}

/** The column fits three circles, so four or more reviewers become two plus a "+n". */
const MAX_AVATARS = 3

function Avatars(props: { reviewers: ReviewerStatus[]; view: ChangeView; self: AccountInfo }) {
  const { view: v } = props
  const open = v.change.status === 'NEW'
  if (props.reviewers.length === 0) {
    return open ? <span className="none" title="No reviewers yet">none</span> : null
  }
  // Pending reviewers first, so what still blocks the change is visible even when the stack is cut.
  const sorted = [...props.reviewers].sort((a, b) => Number(b.vote === 0) - Number(a.vote === 0))
  const shown = sorted.slice(0, sorted.length > MAX_AVATARS ? MAX_AVATARS - 1 : MAX_AVATARS)
  const extra = sorted.length - shown.length
  return (
    <span className="stack">
      {shown.map((r) => {
        const me = r.account._account_id === props.self._account_id
        const name = me ? `you (${displayName(r.account)})` : displayName(r.account)
        const status =
          r.vote !== 0
            ? `voted ${fmtVote(r.vote)} on PS ${v.patchSet}`
            : open && v.reviewRequested
              ? 'asked to review, has not voted yet'
              : 'reviewer, review not requested'
        return (
          <span key={r.account._account_id} className={`av h${r.account._account_id % 6}${me ? ' you' : ''}`} title={`${name}: ${status}`}>
            {initials(displayName(r.account))}
            {r.vote !== 0 && <i className={'v ' + (r.vote > 0 ? 'pos' : 'neg')}>{fmtVote(r.vote)}</i>}
            {r.vote === 0 && open && v.reviewRequested && <i className="v pend" />}
          </span>
        )
      })}
      {extra > 0 && (
        <span className="av extra" title={sorted.slice(shown.length).map((r) => displayName(r.account)).join(', ')}>
          +{extra}
        </span>
      )}
    </span>
  )
}

/** "Bob" -> "B", "Matthew Vaught" -> "MV", "Erin (other team)" -> "E": a second letter only from a capitalised last word. */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? '?'
  const last = words.length >= 2 ? words[words.length - 1]![0]! : ''
  return (first + (/\p{Lu}/u.test(last) ? last : '')).toUpperCase()
}
