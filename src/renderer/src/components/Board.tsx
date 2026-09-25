import { Fragment, useMemo } from 'react'
import type { AccountInfo, ChangeAction, ChangeView, TabId } from '../../../shared/types.ts'
import {
  AUTHOR_SCOPES,
  DEFAULT_SORT,
  EMPTY_FILTER,
  SORT_OPTIONS,
  countFamilies,
  displayName,
  familyKey,
  familyLeads,
  filterViews,
  groupByChangeId,
  groupsFor,
  isExternalReview,
  isFilterActive,
  relatedSetOf,
  sequenceCandidates,
  sequenceChains,
  chainLeads,
  sortByBranch,
  sortViews,
  watchedTeams,
  type Chain,
  type ChangeFamily,
  type RelatedSet,
  type Group,
  type SortId,
  type TeamPick,
  type TeamSetup,
  type ViewFilter,
} from '../../../shared/model.ts'
import { ChainCard, ChangeRow, FamilyCard, SizerRow, StubCard } from './ChangeRow.tsx'
import { Ledger } from './Ledger.tsx'

export type { Group, TabId }
export { groupsFor, isExternalReview }

export interface Tab {
  id: TabId
  label: string
  /** Compact-window label; all of them must fit a strip about 440px wide. */
  short: string
}

export const TABS: Tab[] = [
  { id: 'needs-my-review', label: 'Needs Review', short: 'To review' },
  { id: 'reviewing', label: 'Reviewing', short: 'Reviewing' },
  { id: 'mine', label: 'My Changes', short: 'Mine' },
  { id: 'merged', label: 'Merged', short: 'Merged' },
  // The team tab is named after the user's team, or Watched; the label here is a stand-in (see teamTabLabel).
  { id: 'team-reviews', label: 'Team', short: 'Team' },
  { id: 'external-reviews', label: 'External Reviews', short: 'External' },
]

/** The team tab exists once a team is watched, which the user's own always is; External Reviews only with the user's own team. */
export function visibleTabs(setup: TeamSetup): Tab[] {
  return TABS.filter((t) => (t.id === 'team-reviews' ? watchedTeams(setup).length > 0 : t.id === 'external-reviews' ? setup.primaryTeam !== '' : true))
}

/** One list entry: a single change, the lead of a family card, or the lead of a sequence card. */
export interface Row {
  view: ChangeView
  family: ChangeFamily | null
  chain: Chain | null
  /** The whole related set around a sequence, tagged members or not, for the owner's picker. */
  related: RelatedSet | null
  /** A set of the owner's related changes with no sequence yet, led by this change on this tab: the stub is drawn above the card. */
  stub: RelatedSet | null
}

/** A section with its entries folded into rows: a family is one row, led by its most urgent member on this tab. */
export type Section = Group & { rows: Row[] }

const EMPTY: Record<Exclude<TabId, 'needs-my-review' | 'team-reviews'>, string> = {
  reviewing: 'You are not a reviewer on any open change.',
  mine: 'You have no open changes.',
  merged: 'Nobody has asked you to merge anything, and nothing merged recently.',
  'external-reviews': 'No open change you are on is owned by someone outside your team.',
}

/** The team tab with nothing under the picked team, or under every watched team. */
function teamEmpty(pick: TeamPick, own: string): string {
  if (pick === undefined) return 'Nobody on a watched team has an open change.'
  return pick === own ? 'Nobody else on your team has an open change.' : `Nobody on ${pick} has an open change.`
}

function NeedsReviewEmpty(props: { views: ChangeView[]; onGoTo: (tab: TabId) => void }) {
  const reviewing = props.views.filter((v) => v.change.status === 'NEW' && v.iAmReviewer && !v.isMine)
  const unrequested = reviewing.filter((v) => v.state === 'in-progress' || v.state === 'iterating').length
  return (
    <div className="panel empty-explain">
      <h2>Nothing needs your review</h2>
      <p>A change lands here only when all three are true:</p>
      <ol>
        <li>
          The author pressed <b>Request review</b> on it, and that request is for the <b>current patch set</b>. A new
          patch set cancels the request until the author asks again.
        </li>
        <li>You are a primary reviewer on it, tagged with the "+" button on the row. Being a reviewer in Gerrit alone is not enough.</li>
        <li>You have not voted on that patch set yet. Any vote clears it.</li>
      </ol>
      <p className="muted">
        Being added as a reviewer in Gerrit without the tag, a new patch set, or the attention set do not put anything
        here. WIP status makes no difference. Who owns the change does not matter: a request from outside your team lands
        here too.
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
  /** From the View menu; rows are filtered inside each section. */
  filter: ViewFilter
  onFilter: (f: ViewFilter) => void
  self: AccountInfo | null
  loading: boolean
  /** Narrow window: render the ledger, one line per change, instead of the cards. */
  compact: boolean
  /** The teams from Settings, for the wording on the team tab. */
  setup: TeamSetup
  /** Which team the team tab lists: the one picked on its caret, or every watched team. */
  teamPick: TeamPick
  onAct: (a: ChangeAction) => Promise<void>
  onGoTo: (tab: TabId) => void
}) {
  // The sequences in the whole data set, and which sequence each change is
  // in. A change in a sequence is drawn there and in no Change-Id family:
  // its cherry-picks on other branches form a family without it.
  const chains = useMemo(() => sequenceChains(props.views), [props.views])
  const chainOf = useMemo(() => {
    const m = new Map<ChangeView, Chain>()
    for (const c of chains) for (const v of c.members) m.set(v, c)
    return m
  }, [chains])
  // Every Change-Id family in the whole data set, merged members included,
  // so a card lists all branches no matter which tab it is on.
  const families = useMemo(() => {
    const m = new Map<string, ChangeFamily>()
    for (const f of groupByChangeId(props.views.filter((v) => !chainOf.has(v)))) m.set(f.key, { key: f.key, members: sortByBranch(f.members) })
    return m
  }, [props.views, chainOf])
  // The owner's sets of related changes with no sequence yet, by their member: the stub is offered on My Changes.
  const stubs = useMemo(() => {
    const m = new Map<ChangeView, RelatedSet>()
    if (props.tab !== 'mine' || !props.self) return m
    for (const set of sequenceCandidates(props.views, props.self._account_id)) for (const v of set.members) m.set(v, set)
    return m
  }, [props.views, props.tab, props.self])
  if (props.loading || !props.self) return <div className="panel muted">Loading...</div>
  const team = props.tab === 'team-reviews'
  const all = groupsFor(props.tab, props.views, team ? props.teamPick : undefined)
  const groups = all.map((g) => ({ ...g, items: filterViews(g.items, props.filter) })).filter((g) => g.items.length > 0)
  // The counts are cards: a family counts once, however many branches.
  const total = countFamilies(all.flatMap((g) => g.items))
  const shown = countFamilies(groups.flatMap((g) => g.items))
  // A family is one card, led by its most urgent branch on this tab (see
  // URGENCY). It sits in that branch's section, at that branch's sort
  // position. A tie goes to the earliest section, so on Reviewing a branch
  // waiting on you beats one you already reviewed. A section whose only
  // changes are branches of a card led elsewhere is dropped: the header
  // counts the cards under it, and nothing would be under it.
  // A sequence is one card too, led the same way; a stub for an untagged
  // set goes above the card of its most urgent member on the tab.
  const sorted = groups.map((g) => sortViews(g.items, props.sort))
  const lead = familyLeads(groups, props.views)
  const chainLead = chainLeads(groups, chains)
  const stubLead = chainLeads(groups, [...new Set(stubs.values())])
  const sections: Section[] = groups
    .map((g, section) => ({
      ...g,
      rows: sorted[section]!.flatMap((v): Row[] => {
        const none = { family: null, chain: null, related: null, stub: null }
        const stubSet = stubs.get(v)
        const stub = stubSet && stubLead.get(stubSet.key) === v ? stubSet : null
        const chain = chainOf.get(v)
        if (chain) return chainLead.get(chain.key) === v ? [{ ...none, view: v, chain, related: relatedSetOf(props.views, v.change) }] : []
        const key = familyKey(v.change)
        const f = families.get(key)
        if (!f || f.members.length === 1) return [{ ...none, view: v, stub }]
        return lead.get(key) === v ? [{ ...none, view: v, family: f, stub }] : []
      }),
    }))
    .filter((g) => g.rows.length > 0)
  if (all.length === 0) {
    if (props.tab === 'needs-my-review') return <NeedsReviewEmpty views={props.views} onGoTo={props.onGoTo} />
    return <div className="panel empty">{props.tab === 'team-reviews' ? teamEmpty(props.teamPick, props.setup.primaryTeam) : EMPTY[props.tab]}</div>
  }
  const summary = isFilterActive(props.filter) && (
    <FilterSummary filter={props.filter} sort={props.sort} shown={shown} total={total} onFilter={props.onFilter} />
  )
  if (groups.length === 0) {
    return (
      <main className="board">
        {summary}
        <div className="panel empty">
          No change on this tab matches the filter.{' '}
          <button className="link" onClick={() => props.onFilter(EMPTY_FILTER)}>
            Show all
          </button>
        </div>
      </main>
    )
  }
  if (props.compact) {
    // The same rows: a family is a box with a line per branch.
    return (
      <main className="board">
        {summary}
        <Ledger sections={sections} sort={props.sort} search={props.filter.search} self={props.self} onAct={props.onAct} />
      </main>
    )
  }
  return (
    <main className="board">
      {summary}
      {team && (
        <p className="muted small">
          {props.teamPick === undefined
            ? 'Every open change owned by someone on a watched team'
            : props.teamPick === props.setup.primaryTeam
              ? `Every open change owned by someone else on your team, ${props.teamPick}`
              : `Every open change owned by someone on ${props.teamPick}`}
          , whether or not you are on it. The ones you are on are under Reviewing as well
          {props.teamPick !== props.setup.primaryTeam && `, and under External Reviews`}.
        </p>
      )}
      {props.tab === 'external-reviews' && (
        <p className="muted small">
          The open changes you are on whose owner is not on your team, {props.setup.primaryTeam}. The ones that wait on you
          are under Needs Review as well. Your own changes are never here, whoever reviews them.
        </p>
      )}
      <div className="sections">
        <SizerRow />
        {sections.map((g) => (
          <section key={g.title} className="group">
            <h3>
              {g.title} <span className="count">{g.rows.length}</span>
            </h3>
            {g.hint && <p className="muted small">{g.hint}</p>}
            <ul className="changes">
              {g.rows.map((r) => (
                <Fragment key={r.chain?.key ?? r.family?.key ?? r.view.change.id}>
                  {r.stub && <StubCard set={r.stub} lead={r.view} onAct={props.onAct} />}
                  {r.chain ? (
                    <ChainCard chain={r.chain} lead={r.view} all={r.related} self={props.self!} onAct={props.onAct} sort={props.sort} search={props.filter.search} />
                  ) : r.family ? (
                    <FamilyCard family={r.family} lead={r.view} self={props.self!} onAct={props.onAct} sort={props.sort} search={props.filter.search} />
                  ) : (
                    <ChangeRow view={r.view} self={props.self!} onAct={props.onAct} sort={props.sort} search={props.filter.search} />
                  )}
                </Fragment>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}

/**
 * One line above the rows while a filter is on: how many of the tab's changes
 * are left, each condition as a chip that can be taken off, and the sort when
 * it is not the default, since that changes the order the chips leave behind.
 */
function FilterSummary(props: { filter: ViewFilter; sort: SortId; shown: number; total: number; onFilter: (f: ViewFilter) => void }) {
  const { filter: f, onFilter } = props
  const search = f.search.trim()
  return (
    <div className="filter-summary" role="status">
      <span>
        Showing <b>{props.shown}</b> of {props.total}
      </span>
      {search && (
        <span className="chip filt" title="Subject contains this text">
          “{search}”
          <button className="chip-x" aria-label="Clear the search" onClick={() => onFilter({ ...f, search: '' })}>
            ×
          </button>
        </span>
      )}
      {f.authors.map((a) => (
        <span key={a._account_id} className="chip filt" title={`Changes owned by ${displayName(a)}`}>
          {displayName(a)}
          <button className="chip-x" aria-label={`Remove ${displayName(a)}`} onClick={() => onFilter({ ...f, authors: f.authors.filter((x) => x !== a) })}>
            ×
          </button>
        </span>
      ))}
      {f.scopes.map((s) => {
        const info = AUTHOR_SCOPES.find((x) => x.id === s)!
        return (
          <span key={s} className="chip filt" title={info.title}>
            {info.label}
            <button className="chip-x" aria-label={`Remove ${info.label}`} onClick={() => onFilter({ ...f, scopes: f.scopes.filter((x) => x !== s) })}>
              ×
            </button>
          </span>
        )
      })}
      {props.sort !== DEFAULT_SORT && <span className="chip">Sort: {SORT_OPTIONS.find((o) => o.id === props.sort)?.label.toLowerCase()}</span>}
      <button className="link" onClick={() => onFilter(EMPTY_FILTER)}>
        Show all
      </button>
    </div>
  )
}
