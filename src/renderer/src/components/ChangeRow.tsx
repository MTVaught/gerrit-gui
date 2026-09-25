import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, ReviewerStatus } from '../../../shared/types.ts'
import { STATE_LABEL, accountKeys, chainTitle, displayName, nextInChain, preferredKey, reviewerTag, reviewerTagsFor, stateTally, type Chain, type ChangeFamily, type ParentLink, type RelatedSet, type SortId } from '../../../shared/model.ts'
import { ageCell } from '../age.ts'
import { Highlight } from './Highlight.tsx'
import { ChainIcon, CheckIcon, CommentIcon, ForkIcon, LockIcon } from './Icons.tsx'
import { SequencePicker } from './SequencePicker.tsx'
import { actionClass, changeActions, type ActionSpec } from './actions.ts'
import { ago } from '../time.ts'
import { ReviewButton } from './ReviewButton.tsx'
import { SplitButton } from './SplitButton.tsx'
import { AddReviewer } from './AddReviewer.tsx'
import { MergerPicker } from './MergerPicker.tsx'
import { FlagsMenu } from './FlagsMenu.tsx'
import { TagsButton } from './TagsButton.tsx'
import { commitMessage } from '../../../shared/trailers.ts'
import { SlackLink } from './SlackLink.tsx'
import { api } from '../api.ts'
import { useNames } from '../names.ts'

/** What the reviewer chips and the buttons of one change need. */
interface ActProps {
  view: ChangeView
  self: AccountInfo
  onAct: (a: ChangeAction) => Promise<void>
}

interface RowProps extends ActProps {
  /** The age cell shows the date the rows are sorted by. */
  sort: SortId
  /** Search text from the View menu, marked in the subject. */
  search: string
  /** What the first cell shows instead of the branch: a sequence row leads with its step and subject. */
  lead?: ReactNode
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
      <SlackLink view={v} onAct={props.onAct} variant="tab" />
      <CardHead view={v} search={props.search} />
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
export function FamilyCard(props: { family: ChangeFamily; lead: ChangeView; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void>; sort: SortId; search: string }) {
  const { family: f, lead } = props
  return (
    <li className={`change family state-${lead.state}`}>
      {/* A family keeps one conversation, on its lead change; the tag is on that change alone. */}
      <SlackLink view={lead} onAct={props.onAct} variant="tab" />
      <CardHead view={lead} family={f} search={props.search} />
      {f.members.map((v) => (
        <BranchRow key={v.change.id} view={v} self={props.self} onAct={props.onAct} sort={props.sort} search={props.search} />
      ))}
    </li>
  )
}

/**
 * A sequence: changes built on each other on one branch, one card with a
 * row per change, base first, so the rows read in review order. The
 * subject takes the branch column; the head line names the sequence (its
 * topic, or the first and last numbers), the branch, a tally of states and,
 * for a reviewer, which change to read next. Each row keeps its own
 * reviewers and buttons, as in a family card. The owner edits the members
 * from the head line.
 */
export function ChainCard(props: { chain: Chain; lead: ChangeView; all: RelatedSet | null; self: AccountInfo; onAct: (a: ChangeAction) => Promise<void>; sort: SortId; search: string }) {
  const { chain, lead } = props
  const c = lead.change
  const next = nextInChain(chain)
  const owner = lead.isMine
  return (
    <li className={`change chain state-${lead.state}`}>
      <SlackLink view={lead} onAct={props.onAct} variant="tab" />
      <div className="change-head">
        <span className="badge chain" title="These changes are built on each other; review them from the top down">
          <ChainIcon /> {chain.members.length} in sequence
        </span>
        <span className="subject">
          <Highlight text={chainTitle(chain)} term={props.search} />
        </span>
        <span className="badge branch" title={`${c.project} · ${c.branch}`}>
          <code>{c.branch}</code>
        </span>
        {stateTally(chain.members).map((t) => (
          <span key={t.state} className={`badge tally ${t.state}`} title={`${t.count} of the ${chain.members.length} changes: ${STATE_LABEL[t.state]}`}>
            {t.count} {STATE_LABEL[t.state]}
          </span>
        ))}
        {next && !owner && (
          <span className="muted small next-hint">
            review from the top down · <b>#{next.change._number}</b> is next for you
          </span>
        )}
        <span className="muted small origin">
          {c.project} · {owner ? 'you' : displayName(c.owner)}
        </span>
        {owner && props.all && <SequencePicker set={props.all} from={lead} label="Edit sequence…" title="Change which of the related changes are in the sequence" onAct={props.onAct} />}
      </div>
      {chain.members.map((v, i) => (
        <BranchRow
          key={v.change.id}
          view={v}
          self={props.self}
          onAct={props.onAct}
          sort={props.sort}
          search={props.search}
          lead={
            <>
              <Step view={v} index={i} next={v === next} />
              <span className="subj-wrap">
                <button className="link subj" onClick={() => void api.openChange({ id: v.change._number, project: v.change.project })} title={`Open #${v.change._number} in Gerrit`}>
                  <Highlight text={v.change.subject} term={props.search} />
                </button>
                <ParentNote link={chain.parents.get(v.change._number)} open={v.change.status === 'NEW'} />
              </span>
            </>
          }
        />
      ))}
    </li>
  )
}

/** Under the subject of a sequence row: the change is built on an older patch set of the one below it, so a rebase is due. */
function ParentNote(props: { link: ParentLink | undefined; open: boolean }) {
  const p = props.link
  if (!p || !p.stale || !props.open) return null
  return (
    <span className="parent-note" title={`Built on patch set ${p.patchSet} of #${p.view.change._number}, which is now on patch set ${p.view.patchSet}; a rebase is due`}>
      on #{p.view.change._number} PS {p.patchSet}, now PS {p.view.patchSet}
    </span>
  )
}

/** The circle before a sequence row: the step number, a tick once the change is approved or in, the accent on the reviewer's next one. */
function Step(props: { view: ChangeView; index: number; next: boolean }) {
  const { view: v } = props
  const done = v.state === 'approved' || v.state === 'ready-to-merge' || v.state === 'merged'
  if (done)
    return (
      <span className="step done" title={`Step ${props.index + 1}: ${STATE_LABEL[v.state]}`}>
        <CheckIcon />
      </span>
    )
  return (
    <span className={'step' + (props.next ? ' next' : '')} title={props.next ? `Step ${props.index + 1}: review this one next` : `Step ${props.index + 1}`}>
      {props.index + 1}
    </span>
  )
}

/**
 * The offer to make a sequence: a dashed card above the cards of a set of
 * the owner's changes that are built on each other but not tagged. The
 * button opens the picker with every change ticked.
 */
export function StubCard(props: { set: RelatedSet; lead: ChangeView; onAct: (a: ChangeAction) => Promise<void> }) {
  const { set, lead } = props
  const nums = set.members.map((v) => `#${v.change._number}`).join(', ')
  return (
    <li className="change stub state-in-progress">
      <div className="change-head">
        <span className="badge chain" title="These changes are built on each other">
          <ChainIcon /> {set.members.length} related
        </span>
        <span className="subject">
          {nums} on <code>{lead.change.branch}</code>
        </span>
        <span className="muted small">shown as separate cards until a sequence is set up</span>
        <SequencePicker set={set} from={lead} label="Set up a sequence…" title="Show these changes to reviewers as one card, in the order they are built on each other" onAct={props.onAct} />
      </div>
    </li>
  )
}

/** Subject, branch count for a family, and who owns it where. */
function CardHead(props: { view: ChangeView; family?: ChangeFamily; search: string }) {
  const { view: v, family: f } = props
  const c = v.change
  return (
    <div className="change-head">
      <button className="link subject" onClick={() => void api.openChange({ id: c._number, project: c.project })} title={`Open #${c._number} in Gerrit`}>
        <Highlight text={c.subject} term={props.search} />
      </button>
      {f && (
        <span className="badge branch" title={`Change-Id ${f.key}`}>
          <ForkIcon /> {f.members.length} branches
        </span>
      )}
      {f &&
        stateTally(f.members).map((t) => (
          <span key={t.state} className={`badge tally ${t.state}`} title={`${t.count} of the ${f.members.length} branches: ${STATE_LABEL[t.state]}`}>
            {t.count} {STATE_LABEL[t.state]}
          </span>
        ))}
      <span className="muted small origin">
        {c.project} · {v.isMine ? 'you' : displayName(c.owner)}
      </span>
    </div>
  )
}

/**
 * The cells of one branch: branch, state, flag (Private, WIP or Active), number over its
 * patch set, tags, reviewers, diff, age, buttons, WIP toggle. The card is a subgrid of its list, so every card in a
 * section lines these up in the same columns.
 */
function BranchRow(props: RowProps) {
  const { view: v } = props
  const c = v.change
  const open = c.status === 'NEW'
  const age = ageCell(v, props.sort, false)
  const merger = mergerLabel(v, useNames(v.requestedMerger ? [v.requestedMerger] : []))
  return (
    <div className={open ? 'change-row' : 'change-row closed'}>
      <span className="cell c-branch">
        {props.lead ?? (
          <button className="link" onClick={() => void api.openChange({ id: c._number, project: c.project })} title={`Open #${c._number} (${c.project}) in Gerrit`}>
            <code>{c.branch}</code>
          </button>
        )}
      </span>
      <span className="cell c-state">
        <span className={`badge ${v.state}`} title={merger ? `The owner asked ${merger} to merge` : undefined}>
          {STATE_LABEL[v.state]}
          {merger && ` · ${merger}`}
          {c.status === 'MERGED' && ` ${ago(c.submitted ?? c.updated)}`}
        </span>
      </span>
      <span className="cell c-ci">{open && <FlagBadge view={v} />}</span>
      <span className="cell c-num">
        <button className="link" onClick={() => void api.openChange({ id: c._number, project: c.project })} title="Open in Gerrit">
          #{c._number}
        </button>
        <span className="ps muted">
          PS {v.patchSet}
          {open && <CiMark view={v} />}
        </span>
      </span>
      <span className="cell c-tags">
        <TagsButton message={commitMessage(c)} state={v.state} />
        <Unresolved count={c.unresolved_comment_count} />
      </span>
      <div className="cell c-reviewers">
        <Reviewers {...props} />
      </div>
      <span className="cell c-diff">
        {c.insertions !== undefined && (
          <span title="Lines the whole change adds and removes">
            <span className="ins">+{c.insertions}</span> <span className="del">−{c.deletions}</span>
            <SinceReview view={v} />
          </span>
        )}
      </span>
      <span className="cell c-updated muted" title={age.title}>
        {age.text}
      </span>
      <Actions {...props} />
    </div>
  )
}

/** Lines changed since the patch set the user last reviewed, in brackets after the whole change's counts: the size of the re-review. */
export function SinceReview(props: { view: ChangeView }) {
  const d = props.view.sinceReview
  if (!d) return null
  return (
    <span className="since" title={`Lines changed from patch set ${d.basePatchSet}, the last one you reviewed, to patch set ${d.patchSet}`}>
      {' '}
      (<span className="ins">+{d.insertions}</span> <span className="del">−{d.deletions}</span> new)
    </span>
  )
}

/**
 * The user's part of the review rounds, over the Review button: the vote they
 * cast on the last patch set they reviewed, so they know whether the
 * re-review starts from a +1 or a −1. Nothing when they never reviewed the
 * change or already reviewed this patch set; with `slot`, an empty line of
 * the same height instead, so the button below sits where it does on every
 * other row.
 */
export function MyLastReview(props: { view: ChangeView; slot?: boolean }) {
  const { view: v } = props
  const last = v.lastReviewedPatchSet
  if (v.change.status !== 'NEW' || v.isMine || last === null || last >= v.patchSet) return props.slot ? <span className="mine" /> : null
  const vote = v.lastReviewedVote
  const title = vote === null ? `You replied on patch set ${last} without voting` : vote === 0 ? `You took your vote on patch set ${last} back` : `You voted ${fmtVote(vote)} on patch set ${last}`
  return (
    <span className="mine" title={title}>
      {vote ? (
        <>
          you <b className={vote > 0 ? 'pos' : 'neg'}>{fmtVote(vote)}</b> on PS {last}
        </>
      ) : (
        `you commented on PS ${last}`
      )}
    </span>
  )
}

/**
 * The Verified vote on the current patch set, after "PS N": a green check
 * when CI passed, a red cross when it failed, nothing while CI has not voted.
 * It sits by the patch set number because that is what the vote is on; a new
 * patch set clears it. Ready to Merge needs the check.
 */
export function CiMark(props: { view: ChangeView }) {
  const { view: v } = props
  if (v.verifiedVote === 0) return null
  const pos = v.verifiedVote > 0
  return (
    <span className={'ci-mark ' + (pos ? 'pos' : 'neg')} title={pos ? `Verified +1 on patch set ${v.patchSet}: CI passed` : `Verified −1 on patch set ${v.patchSet}: CI failed`}>
      {' '}
      {pos ? '✓' : '✕'}
    </span>
  )
}

/** Unresolved comment threads, as a speech bubble with the count beside the tags pill. */
export function Unresolved(props: { count: number | undefined }) {
  const n = props.count ?? 0
  if (n === 0) return null
  return (
    <span className="unresolved" title={`${n} unresolved comment ${n === 1 ? 'thread' : 'threads'}`}>
      <CommentIcon />
      {n}
    </span>
  )
}

/** Gerrit's private flag: the change is hidden from everyone but the people on it. */
/**
 * A row of no height at the top of the grid, holding the widest label each
 * fixed-vocabulary column can show. The columns are sized to content, so
 * without it their widths shift from tab to tab with whatever happens to be
 * on screen ("no tags" against a count, "In-Person Review" against
 * "Approved"). The columns with free text (branch, reviewers) stay
 * content-sized; the number, diff and age get a floor for their usual range.
 * Each badge, pill and note has a column of its own, so a wide number never
 * pushes the tags pill beside it out of line with the row below.
 */
export function SizerRow() {
  const split = (label: string, cls = '') => (
    <span className="split">
      <span className={`btn split-main ${cls}`}>{label}</span>
      <span className={`btn split-caret ${cls}`}>▾</span>
    </span>
  )
  return (
    <div className="change-row sizer" aria-hidden="true">
      <span className="cell c-branch" />
      <span className="cell c-state">
        <span className="badge in-person-review">{STATE_LABEL['in-person-review']}</span>
      </span>
      <span className="cell c-ci">
        <PrivateBadge />
      </span>
      <span className="cell c-num">
        <span className="link">#00000</span>
        <span className="ps muted">PS 00</span>
      </span>
      <span className="cell c-tags">
        <span className="tags">
          <span className="tagbtn missing">no tags</span>
        </span>
      </span>
      <div className="cell c-reviewers" />
      <span className="cell c-diff">
        <span>+0000 −0000</span>
      </span>
      <span className="cell c-updated">00mo ago</span>
      <div className="cell c-wip actions">{split('Mark active')}</div>
      <div className="cell c-actions">
        <div className="btns">{split('Re-request (PS 00)')}</div>
      </div>
    </div>
  )
}

/**
 * The change's flag, one badge: Private when the change is private, since
 * that overrides everything else about who sees it; otherwise WIP or Active,
 * which says whether CI runs.
 */
export function FlagBadge(props: { view: ChangeView }) {
  const { view: v } = props
  if (v.isPrivate) return <PrivateBadge />
  return (
    <span className={'badge ' + (v.wip ? 'wip' : 'active')} title={v.wip ? 'Work in progress: CI is not running on this change' : 'Active: CI runs on this change'}>
      {v.wip ? 'WIP' : 'Active'}
    </span>
  )
}

export function PrivateBadge() {
  return (
    <span className="badge private" title="Private: only the owner, the reviewers and the CCs can see this change in Gerrit">
      <LockIcon />
      Private
    </span>
  )
}

/**
 * Who was asked to merge, for the state badge: "you" for the signed-in user,
 * else the name. Only while the state is Ready to Merge: a tag left over from
 * an earlier patch set (or written without a patch set by an older version)
 * must not dress an Approved change up as a merge request, since the owner's
 * next step is the Ready to Merge button either way.
 */
export function mergerLabel(v: ChangeView, nameFor: (key: string) => string): string | null {
  if (v.change.status !== 'NEW' || !v.requestedMerger) return null
  if (v.state !== 'ready-to-merge') return null
  return v.mergeRequestedFromMe ? 'you' : nameFor(v.requestedMerger)
}

/** Votes first, a -1 before a +1, so the chips that matter survive truncation. */
function byVote(rs: ReviewerStatus[]): ReviewerStatus[] {
  const rank = (r: ReviewerStatus) => (r.vote < 0 ? 0 : r.vote > 0 ? 1 : 2)
  return [...rs].sort((a, b) => rank(a) - rank(b))
}

/**
 * Reviewer chips with votes: the primary reviewers on the first line, every
 * other reviewer on the change on a second one (dashed, since their votes do
 * not change the state). Each line is one row of chips; what does not fit is
 * behind "+N".
 * With no primary reviewer the first line is just the add button: the
 * disabled Request button says why. Anyone may tag or untag a primary
 * reviewer; only the owner adds or removes plain reviewers, as in Gerrit.
 */
export function Reviewers(props: ActProps) {
  const { view: v, self } = props
  const c = v.change
  const id = c._number
  const open = c.status === 'NEW'
  const owner = open && v.isMine
  const nameFor = useNames(v.reviewers.filter((r) => r.tagOnly).map((r) => r.key!))

  const isMe = (r: ReviewerStatus) => r.account._account_id === self._account_id || (r.tagOnly === true && accountKeys(self).includes(r.key!))
  const name = (r: ReviewerStatus) => (isMe(r) ? 'you' : r.tagOnly ? nameFor(r.key!) : displayName(r.account))
  const label = (r: ReviewerStatus) => (r.vote !== 0 ? `${name(r)} ${fmtVote(r.vote)}` : name(r))
  const body = (r: ReviewerStatus, ...buttons: ReactNode[]) => (
    <>
      {name(r)}
      {r.vote !== 0 && <b> {fmtVote(r.vote)}</b>}
      {open && buttons}
    </>
  )
  const demote = (r: ReviewerStatus) =>
    !r.tagOnly && (
      <button
        key="demote"
        className="chip-x"
        title="Stop waiting for this vote; the person stays on the change in Gerrit"
        onClick={() => void props.onAct({ type: 'hashtag', id, remove: reviewerTagsFor(c, r.account) })}
      >
        ↓
      </button>
    )
  const removePrimary = (r: ReviewerStatus) => (
    <button
      key="remove"
      className="chip-x"
      title="Remove primary reviewer: drops the tag and, when Gerrit lets you, takes the person off the change"
      onClick={() => void props.onAct({ type: 'removePrimaryReviewer', id, key: r.key!, accountId: r.tagOnly ? undefined : r.account._account_id })}
    >
      ×
    </button>
  )
  const promote = (r: ReviewerStatus) => {
    const key = preferredKey(r.account)
    return (
      key && (
        <button key="promote" className="chip-x" title="Make primary: this vote then decides the state" onClick={() => void props.onAct({ type: 'hashtag', id, add: [reviewerTag(key)] })}>
          ↑
        </button>
      )
    )
  }
  const removeOther = (r: ReviewerStatus) =>
    owner && (
      <button key="remove" className="chip-x" title="Remove reviewer" onClick={() => void props.onAct({ type: 'removeReviewer', id, accountId: r.account._account_id })}>
        ×
      </button>
    )

  const primary: Chip[] = byVote(v.reviewers).map((r) => ({
    key: r.key ?? String(r.account._account_id),
    className: (r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : open && v.reviewRequested ? 'pending' : '') + (r.tagOnly ? ' tagonly' : ''),
    title:
      (r.tagOnly ? 'tagged as a primary reviewer, but not on the change in Gerrit; ' : 'primary reviewer, ') +
      (r.vote !== 0
        ? `voted ${fmtVote(r.vote)} on patch set ${v.patchSet}`
        : v.reviewRequested
          ? 'asked to review this patch set, has not voted yet'
          : 'review has not been requested for this patch set'),
    label: label(r),
    children: body(r, demote(r), removePrimary(r)),
  }))
  const others: Chip[] = byVote(v.otherReviewers).map((r) => ({
    key: String(r.account._account_id),
    className: 'ext ' + (r.vote > 0 ? 'pos' : r.vote < 0 ? 'neg' : ''),
    title:
      r.vote !== 0
        ? `not primary, voted ${fmtVote(r.vote)} on patch set ${v.patchSet}; this vote does not change the state`
        : 'not primary, has not voted; not waited for',
    label: label(r),
    children: body(r, promote(r), removeOther(r)),
  }))

  return (
    <>
      <ChipRow chips={primary} trailing={open && <AddReviewer view={v} self={self} allowOther={owner} onAct={props.onAct} />} />
      {others.length > 0 && <ChipRow className="others" chips={others} />}
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
    while (k > 1 && ends[k - 1]! + gap + ghost + reserved > box.width) k--
    // Never hide every named chip: a lone chip that is too wide is clipped, not replaced by "+1".
    setLimit(Math.max(k, 1))
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

/**
 * The buttons for one change, as the last two cells of its row. The main
 * buttons share one column and the subtle WIP toggle has its own, so a
 * button sits in the same place on every row no matter what the toggle says.
 */
function Actions(props: ActProps) {
  const { view: v } = props
  const open = v.change.status === 'NEW'
  const actions = changeActions(v, props.onAct)
  const button = (a: ActionSpec) =>
    a.picker ? (
      <MergerPicker key={a.key} view={v} spec={a} onAct={props.onAct} />
    ) : a.menu ? (
      <FlagsMenu key={a.key} spec={a} />
    ) : a.split ? (
      <SplitButton key={a.key} spec={a} />
    ) : (
      <button key={a.key} className={actionClass(a)} disabled={a.disabled} title={a.title} onClick={a.run}>
        {a.label}
      </button>
    )
  // One main button, last on the row. A stale ready-to-merge tag does not
  // block it: re-requesting review or Ready to Merge writes over the tag.
  // A reviewer's row carries their last round over the button; the slot is
  // there even when they have none, so the button never moves between rows.
  const review = open && v.iAmReviewer && !v.isMine
  const buttons = actions.filter((a) => !a.subtle)
  return (
    <>
      <div className="cell c-wip actions">{actions.filter((a) => a.subtle).map(button)}</div>
      <div className="cell c-actions">
        {review && <MyLastReview view={v} slot />}
        <div className="btns">
          {buttons.map(button)}
          {review && <ReviewButton view={v} />}
        </div>
      </div>
    </>
  )
}

function fmtVote(v: number): string {
  return v > 0 ? `+${v}` : `−${-v}`
}
