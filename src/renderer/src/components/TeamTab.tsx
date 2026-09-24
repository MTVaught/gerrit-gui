import type { ChangeView } from '../../../shared/types.ts'
import { countFamilies, externalPicks, groupsFor, type ExternalPick, type TeamSetup } from '../../../shared/model.ts'

/** The All Reviews entries with the number of cards under each. */
export function externalEntries(setup: TeamSetup, views: ChangeView[]): { pick: ExternalPick; label: string; n: number }[] {
  return externalPicks(setup).map((e) => ({ ...e, n: countFamilies(groupsFor('external-reviews', views, e.pick).flatMap((g) => g.items)) }))
}

/** The values of the All and Other entries in the select. A team name is trimmed, so it cannot start with a space. */
const ALL_VALUE = ' all'
const OTHER_VALUE = ' other'

/**
 * The All Reviews tab: a native select box in the tab strip, in the place
 * of a tab. It lists everyone outside the user's team together, then every
 * team but the user's own, each with its count, then Other, and shows the
 * one picked. Opening it brings the tab up, as pressing a tab does;
 * choosing an entry shows those changes.
 */
export function TeamTab(props: {
  entries: { pick: ExternalPick; label: string; n: number }[]
  pick: ExternalPick
  active: boolean
  onPick: (p: ExternalPick) => void
  /** Bring the tab up, as pressing any tab does. */
  onSelect: () => void
}) {
  const valueOf = (p: ExternalPick) => (p === undefined ? ALL_VALUE : p === null ? OTHER_VALUE : p)
  return (
    <select
      className={'tab tab-select' + (props.active ? ' active' : '')}
      value={valueOf(props.pick)}
      aria-label="All Reviews: which team"
      title="All Reviews: changes owned by another team, or by people on no team"
      onMouseDown={() => {
        if (!props.active) props.onSelect()
      }}
      onChange={(e) => {
        props.onPick(e.target.value === ALL_VALUE ? undefined : e.target.value === OTHER_VALUE ? null : e.target.value)
        props.onSelect()
      }}
    >
      {props.entries.map((e) => (
        <option key={valueOf(e.pick)} value={valueOf(e.pick)}>
          {e.label} ({e.n})
        </option>
      ))}
    </select>
  )
}
