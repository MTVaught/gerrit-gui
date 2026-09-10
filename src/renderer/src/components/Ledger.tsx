import { Fragment, useEffect, useState, type ReactNode } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, ReviewerStatus } from '../../../shared/types.ts'
import { STATE_LABEL, displayName, reviewLink, type ChangeFamily, type SortId } from '../../../shared/model.ts'
import { ageCell } from '../age.ts'
import { Reviewers } from './ChangeRow.tsx'
import { Highlight } from './Highlight.tsx'
import { ForkIcon } from './Icons.tsx'
import { ReviewButton } from './ReviewButton.tsx'
import { actionClass, changeActions } from './actions.ts'
import type { Section } from './Board.tsx'
import { api } from '../api.ts'

/**
 * Compact layout: a ledger with one line per change. Columns are fixed so
 * the subject column absorbs the width; the reviewers column carries the
 * votes as badges on avatars; the last column holds the one primary action.
 * Opening a row shows the state badges, the reviewer chips and the rest.
 * A Change-Id family is a box: a header line with the subject, then one
 * line per branch, titled by its branch, each with its own reviewers and
 * action.
 */
export function Ledger(props: {
  sections: Section[]
  sort: SortId
  /** Search text from the View menu, marked in the subject. */
  search: string
  self: AccountInfo
  onAct: (a: ChangeAction) => Promise<void>
}) {
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
      {props.sections.map((g) => (
        <tbody key={g.title}>
          <tr className="g">
            <td colSpan={columns}>
              {g.title} <span className="count">{g.items.length}</span>
              {g.hint && <span className="hint">{g.hint}</span>}
            </td>
          </tr>
          {g.rows.map((r) => {
            const line = { self: props.self, onAct: props.onAct, sort: props.sort, search: props.search, showCi: !narrow, columns }
            if (!r.family) return <LedgerRow key={r.view.change.id} view={r.view} {...line} />
            return <FamilyBox key={r.family.key} family={r.family} lead={r.view} {...line} />
          })}
        </tbody>
      ))}
    </table>
  )
}

/**
 * One Change-Id on several branches: an island in the section, as the cards
 * are on the full window. A spacer, a header line with the subject and the
 * branch count, one line per branch, and a spacer. Every member is listed,
 * merged ones included and greyed, so the box says where the change is
 * still open and where it is already in.
 */
function FamilyBox(props: { family: ChangeFamily; lead: ChangeView } & LineProps) {
  const { family: f, lead, ...line } = props
  return (
    <>
      <tr className="fsp">
        <td colSpan={line.columns} />
      </tr>
      <tr className="fh">
        <td colSpan={line.columns}>
          <span className="t" title={`Change-Id ${f.key}`}>
            <ForkIcon />
            <span className="txt">
              <Highlight text={lead.change.subject} term={line.search} />
            </span>
          </span>
          <span className="n muted">{f.members.length} branches</span>
        </td>
      </tr>
      {f.members.map((v, i) => (
        <LedgerRow key={v.change.id} view={v} {...line} member={{ last: i === f.members.length - 1 }} />
      ))}
      <tr className="fsp">
        <td colSpan={line.columns} />
      </tr>
    </>
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

/** What every line of the ledger gets from the table. */
interface LineProps {
  self: AccountInfo
  onAct: (a: ChangeAction) => Promise<void>
  sort: SortId
  search: string
  showCi: boolean
  columns: number
}

function LedgerRow(
  props: LineProps & {
    view: ChangeView
    /** A branch line inside a family box: titled by its branch, the subject is on the box's header. */
    member?: { last: boolean }
  },
) {
  const { view: v, self } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const [expanded, setExpanded] = useState(false)
  const actions = changeActions(v, props.onAct)
  const primary = actions.find((a) => a.primary)
  const rest = actions.filter((a) => a !== primary)
  const reviewer = open && v.iAmReviewer && !v.isMine
  const toggle = () => setExpanded((e) => !e)

  // The line is clipped at the right, so the age, which carries the sort order, comes early and the diff last.
  const age = ageCell(v, props.sort, true)
  const sub: ReactNode[] = [`#${id}`]
  sub.push(<span title={age.title}>{age.text}</span>)
  if (!v.isMine) sub.push(displayName(c.owner))
  sub.push(`PS ${v.patchSet}`)
  if ((c.unresolved_comment_count ?? 0) > 0) sub.push(`${c.unresolved_comment_count} unresolved`)
  if (c.insertions !== undefined) {
    sub.push(
      <>
        <span className="ins">+{c.insertions}</span> <span className="del">−{c.deletions}</span>
      </>,
    )
  }

  // In a box, the bottom edge of the box follows the last member's line, or its detail row while open.
  const mem = props.member ? ` mem${!open ? ' closed' : ''}${props.member.last && !expanded ? ' end' : ''}` : ''
  return (
    <>
      <tr className={`lrow state-${v.state}${expanded ? ' open' : ''}${mem}`}>
        <td className="c" onClick={toggle}>
          <button
            className="link t"
            aria-expanded={expanded}
            onClick={(e) => {
              e.stopPropagation()
              toggle()
            }}
          >
            {props.member ? <code>{c.branch}</code> : <Highlight text={c.subject} term={props.search} />}
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
          ) : reviewer ? (
            <ReviewShort view={v} />
          ) : (
            <button className="btn sm more" aria-label={expanded ? 'Hide details' : 'Show details'} aria-expanded={expanded} onClick={toggle}>
              ···
            </button>
          )}
        </td>
      </tr>
      {expanded && (
        <tr className={`ldetail${props.member ? ` mem${props.member.last ? ' end' : ''}` : ''}`}>
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
            <Reviewers view={v} self={self} onAct={props.onAct} />
            <div className="ldet-actions">
              {rest.map((a) => (
                <button key={a.key} className={actionClass(a, 'sm')} disabled={a.disabled} title={a.title} onClick={a.run}>
                  {a.label}
                </button>
              ))}
              {reviewer && <ReviewButton view={v} />}
              <button className="btn sm" onClick={() => void api.openChange({ id, project: c.project })}>
                Open in Gerrit ↗
              </button>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

/** The column-sized form of the reviewer's button: opens the diff since their last review. The split button with the other views is in the detail row. */
function ReviewShort(props: { view: ChangeView }) {
  const { view: v } = props
  const link = reviewLink(v)
  const upToDate = v.lastReviewedPatchSet !== null && v.lastReviewedPatchSet >= v.patchSet
  const title = upToDate
    ? `You already reviewed patch set ${v.patchSet}. Opens it in Gerrit.`
    : link.basePatchSet !== undefined
      ? `Opens the diff from patch set ${link.basePatchSet}, the last one you reviewed, to patch set ${v.patchSet}`
      : `Opens patch set ${v.patchSet} against base in Gerrit`
  return (
    <button className={'btn sm' + (v.needsMyReview ? ' primary' : '')} title={title} onClick={() => void api.openChange(link)}>
      {upToDate ? 'Open' : v.needsMyReview ? 'Review' : 'Diff'} ↗
    </button>
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
    if (!open) return null
    const onlyExternal = v.teamScoped && v.externalReviewers.length > 0
    return (
      <span className="none" title={onlyExternal ? 'Only team votes decide the state, and nobody on the team is a reviewer' : 'No reviewers yet'}>
        {onlyExternal ? 'no team' : 'none'}
      </span>
    )
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

function fmtVote(v: number): string {
  return v > 0 ? `+${v}` : String(v)
}

/** "Bob" -> "B", "Matthew Vaught" -> "MV", "Erin (other team)" -> "E": a second letter only from a capitalised last word. */
function initials(name: string): string {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? '?'
  const last = words.length >= 2 ? words[words.length - 1]![0]! : ''
  return (first + (/\p{Lu}/u.test(last) ? last : '')).toUpperCase()
}
