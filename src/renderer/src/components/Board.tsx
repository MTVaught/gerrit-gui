import type { AccountInfo, ChangeAction, ChangeView, ReviewState, TabId } from '../../../shared/types.ts'
import { STATE_LABEL, displayName, sortViews, type SortId } from '../../../shared/model.ts'
import { ChangeRow } from './ChangeRow.tsx'
import { Ledger } from './Ledger.tsx'

export type { TabId }

/** `short` is the compact-window label; it must fit five tabs in about 440px. */
export const TABS: { id: TabId; label: string; short: string }[] = [
  { id: 'needs-my-review', label: 'Needs my review', short: 'To review' },
  { id: 'reviewing', label: 'Reviewing', short: 'Reviewing' },
  { id: 'mine', label: 'My changes', short: 'Mine' },
  { id: 'ready-to-merge', label: 'Ready to merge', short: 'Ready' },
  { id: 'merged', label: 'Recently merged', short: 'Merged' },
]

export interface Group {
  title: string
  hint?: string
  items: ChangeView[]
}

function byState(items: ChangeView[], order: ReviewState[], titles?: Partial<Record<ReviewState, string>>): Group[] {
  return order
    .map((s) => ({ title: titles?.[s] ?? STATE_LABEL[s], items: items.filter((v) => v.state === s) }))
    .filter((g) => g.items.length > 0)
}

export function groupsFor(tab: TabId, views: ChangeView[]): Group[] {
  const open = views.filter((v) => v.change.status === 'NEW')
  switch (tab) {
    case 'needs-my-review': {
      return [{ title: 'Waiting on you', items: open.filter((v) => v.needsMyReview) }].filter((g) => g.items.length > 0)
    }
    case 'reviewing': {
      const r = open.filter((v) => v.iAmReviewer && !v.isMine)
      return [
        { title: 'Waiting on you', items: r.filter((v) => v.needsMyReview && v.state === 'needs-review') },
        {
          title: 'Reviewed, waiting on others',
          items: r.filter((v) => !v.needsMyReview && v.state === 'needs-review'),
        },
        ...byState(r, ['needs-changes', 'approved', 'ready-to-merge', 'in-progress'], {
          'in-progress': 'Author iterating, no review requested',
        }),
      ].filter((g) => g.items.length > 0)
    }
    case 'mine': {
      const m = open.filter((v) => v.isMine)
      return byState(m, ['needs-changes', 'approved', 'ready-to-merge', 'needs-review', 'in-progress'], {
        'needs-review': 'Out for review',
        'in-progress': 'In progress, review not requested',
      })
    }
    case 'ready-to-merge': {
      const rtm = open.filter((v) => v.state === 'ready-to-merge')
      const stale = open.filter((v) => v.staleReadyToMerge)
      return [
        { title: 'Ready to merge', items: rtm },
        {
          title: 'Tagged ready-to-merge but no longer approved',
          hint: 'A new patch set reset the votes. The owner should request review again or clear the tag.',
          items: stale,
        },
      ].filter((g) => g.items.length > 0)
    }
    case 'merged':
      return [{ title: 'Merged in the last 14 days', items: views.filter((v) => v.change.status === 'MERGED') }]
  }
}

const EMPTY: Record<Exclude<TabId, 'needs-my-review'>, string> = {
  reviewing: 'You are not a reviewer on any open change.',
  mine: 'You have no open changes.',
  'ready-to-merge': 'Nothing is tagged ready-to-merge.',
  merged: 'Nothing merged recently.',
}

function NeedsReviewEmpty(props: { views: ChangeView[]; onGoTo: (tab: TabId) => void }) {
  const reviewing = props.views.filter((v) => v.change.status === 'NEW' && v.iAmReviewer && !v.isMine)
  const unrequested = reviewing.filter((v) => v.state === 'in-progress').length
  return (
    <div className="panel empty-explain">
      <h2>Nothing needs your review</h2>
      <p>A change lands here only when all three are true:</p>
      <ol>
        <li>
          The author pressed <b>Request review</b> on it, and that request is for the <b>current patch set</b>. A new
          patch set cancels the request until the author asks again.
        </li>
        <li>You are a reviewer on it (bots and the owner do not count).</li>
        <li>You have not voted on that patch set yet. Any vote clears it.</li>
      </ol>
      <p className="muted">
        Being added as a reviewer in Gerrit, a new patch set, or the attention set do not put anything here. WIP status
        makes no difference.
      </p>
      {reviewing.length > 0 ? (
        <p>
          You are a reviewer on {reviewing.length} open change{reviewing.length === 1 ? '' : 's'}
          {unrequested > 0 && (
            <>
              , {unrequested} of which {unrequested === 1 ? 'has' : 'have'} no review requested yet
            </>
          )}
          .{' '}
          <button className="link" onClick={() => props.onGoTo('reviewing')}>
            See them under Reviewing
          </button>
          , where you can review any of them without waiting to be asked.
        </p>
      ) : (
        <p className="muted">You are not a reviewer on any open change right now.</p>
      )}
    </div>
  )
}

export function Board(props: {
  tab: TabId
  views: ChangeView[]
  sort: SortId
  self: AccountInfo | null
  loading: boolean
  /** Narrow window: render the ledger instead of the cards. */
  compact: boolean
  onAct: (a: ChangeAction) => Promise<void>
  onGoTo: (tab: TabId) => void
}) {
  if (props.loading || !props.self) return <div className="panel muted">Loading...</div>
  const groups = groupsFor(props.tab, props.views)
  if (groups.length === 0) {
    if (props.tab === 'needs-my-review') return <NeedsReviewEmpty views={props.views} onGoTo={props.onGoTo} />
    return <div className="panel empty">{EMPTY[props.tab]}</div>
  }
  if (props.compact) {
    return (
      <main className="board">
        <Ledger groups={groups} sort={props.sort} self={props.self} onAct={props.onAct} />
      </main>
    )
  }
  return (
    <main className="board">
      {props.tab === 'mine' && (
        <p className="muted small intro">
          Signed in as {displayName(props.self)}. Push as many patch sets as you like; reviewers are only asked to look
          when you press Request review, and only for that patch set.
        </p>
      )}
      {groups.map((g) => (
        <section key={g.title} className="group">
          <h3>
            {g.title} <span className="count">{g.items.length}</span>
          </h3>
          {g.hint && <p className="muted small">{g.hint}</p>}
          <ul className="changes">
            {sortViews(g.items, props.sort).map((v) => (
              <ChangeRow key={v.change.id} view={v} self={props.self!} onAct={props.onAct} />
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
