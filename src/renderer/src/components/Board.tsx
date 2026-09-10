import { useMemo } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, ReviewState, TabId } from '../../../shared/types.ts'
import { STATE_LABEL, displayName, familyKey, groupByChangeId, isExternalReview, sortByBranch, sortViews, urgency, type ChangeFamily, type SortId } from '../../../shared/model.ts'
import { ChangeRow, FamilyCard } from './ChangeRow.tsx'

export type { TabId }
export { isExternalReview }

export const TABS: { id: TabId; label: string }[] = [
  { id: 'needs-my-review', label: 'Needs my review' },
  { id: 'reviewing', label: 'Reviewing' },
  { id: 'mine', label: 'My changes' },
  { id: 'ready-to-merge', label: 'Ready to merge' },
  { id: 'merged', label: 'Recently merged' },
  { id: 'external-reviews', label: 'External reviews' },
]

/** The External reviews tab exists only once a team is configured; without one nobody is external. */
export function visibleTabs(teamConfigured: boolean): { id: TabId; label: string }[] {
  return TABS.filter((t) => t.id !== 'external-reviews' || teamConfigured)
}

interface Group {
  title: string
  hint?: string
  items: ChangeView[]
}

/** One list entry: a single change, or the lead of a family card. */
interface Row {
  view: ChangeView
  family: ChangeFamily | null
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
    case 'external-reviews': {
      const ext = open.filter(isExternalReview)
      return [
        { title: 'Waiting on you', items: ext.filter((v) => v.needsMyReview && v.state === 'needs-review') },
        {
          title: 'Reviewed, waiting on others',
          items: ext.filter((v) => !v.needsMyReview && v.state === 'needs-review'),
        },
        ...byState(ext, ['needs-changes', 'approved', 'ready-to-merge', 'in-progress'], {
          'in-progress': 'Author iterating, no review requested',
        }),
      ].filter((g) => g.items.length > 0)
    }
  }
}

const EMPTY: Record<Exclude<TabId, 'needs-my-review'>, string> = {
  reviewing: 'You are not a reviewer on any open change.',
  mine: 'You have no open changes.',
  'ready-to-merge': 'Nothing is tagged ready-to-merge.',
  merged: 'Nothing merged recently.',
  'external-reviews': 'No open change is owned by someone outside the team.',
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
  onAct: (a: ChangeAction) => Promise<void>
  onGoTo: (tab: TabId) => void
}) {
  // Every Change-Id family in the whole data set, merged members included,
  // so a card lists all branches no matter which tab it is on.
  const families = useMemo(() => {
    const m = new Map<string, ChangeFamily>()
    for (const f of groupByChangeId(props.views)) m.set(f.key, { key: f.key, members: sortByBranch(f.members) })
    return m
  }, [props.views])
  if (props.loading || !props.self) return <div className="panel muted">Loading...</div>
  const groups = groupsFor(props.tab, props.views)
  // A family is one card, led by its most urgent branch on this tab (see
  // URGENCY). It sits in that branch's section, at that branch's sort
  // position. A tie goes to the earliest section, so on Reviewing a branch
  // waiting on you beats one you already reviewed. Section counts still count
  // the changes in that state.
  const sorted = groups.map((g) => sortViews(g.items, props.sort))
  const lead = new Map<string, { section: number; view: ChangeView }>()
  sorted.forEach((items, section) => {
    for (const view of items) {
      const key = familyKey(view.change)
      if ((families.get(key)?.members.length ?? 1) === 1) continue
      const cur = lead.get(key)
      if (!cur || urgency(view.state) < urgency(cur.view.state)) lead.set(key, { section, view })
    }
  })
  const sections = groups.map((g, section) => ({
    ...g,
    rows: sorted[section]!.flatMap((v): Row[] => {
      const key = familyKey(v.change)
      const f = families.get(key)
      if (!f || f.members.length === 1) return [{ view: v, family: null }]
      return lead.get(key)?.view === v ? [{ view: v, family: f }] : []
    }),
  }))
  if (groups.length === 0) {
    if (props.tab === 'needs-my-review') return <NeedsReviewEmpty views={props.views} onGoTo={props.onGoTo} />
    return <div className="panel empty">{EMPTY[props.tab]}</div>
  }
  return (
    <main className="board">
      {props.tab === 'mine' && (
        <p className="muted small">
          Signed in as {displayName(props.self)}. Push as many patch sets as you like; reviewers are only asked to look
          when you press Request review, and only for that patch set.
        </p>
      )}
      {props.tab === 'external-reviews' && (
        <p className="muted small">
          Open changes owned by people outside the team you set in Settings. They also appear under Needs my review and
          Reviewing as usual. Your own changes are never here, whoever reviews them.
        </p>
      )}
      {sections.map((g) => (
        <section key={g.title} className="group">
          <h3>
            {g.title} <span className="count">{g.items.length}</span>
          </h3>
          {g.hint && <p className="muted small">{g.hint}</p>}
          <ul className="changes">
            {g.rows.map((r) =>
              r.family ? (
                <FamilyCard key={r.family.key} family={r.family} lead={r.view} self={props.self!} onAct={props.onAct} />
              ) : (
                <ChangeRow key={r.view.change.id} view={r.view} self={props.self!} onAct={props.onAct} />
              ),
            )}
          </ul>
        </section>
      ))}
    </main>
  )
}
