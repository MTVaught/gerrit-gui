import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChangeView } from '../../../shared/types.ts'
import { countFamilies, externalPicks, groupsFor, type ExternalPick, type TeamSetup } from '../../../shared/model.ts'

/** The All Reviews entries with the number of cards under each. */
export function externalEntries(setup: TeamSetup, views: ChangeView[]): { pick: ExternalPick; label: string; n: number }[] {
  return externalPicks(setup).map((e) => ({ ...e, n: countFamilies(groupsFor('external-reviews', views, e.pick).flatMap((g) => g.items)) }))
}

/**
 * The All Reviews tab: a split tab, like the split buttons on the rows. The
 * main part is the tab itself, with the usual count pill, and pressing it
 * shows everyone outside the team. The caret beside it opens a menu of the
 * teams and Other; picking one narrows the tab to it, and the tab's label
 * says which, with that list's count.
 */
export function TeamTab(props: {
  entries: { pick: ExternalPick; label: string; n: number }[]
  pick: ExternalPick
  active: boolean
  /** Compact window or a crowded strip: the short label. */
  short: boolean
  /** The count pill for everyone, styled like the other tabs'. */
  count: ReactNode
  onPick: (p: ExternalPick) => void
  /** Bring the tab up, as pressing any tab does. */
  onSelect: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLButtonElement>(null)
  // The strip scrolls sideways in the compact window and would clip the menu, so it is placed against the window.
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })
  const current = props.entries.find((e) => e.pick === props.pick) ?? props.entries[0]!
  const narrowed = current.pick !== undefined

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="tab-split" ref={root}>
      <button
        role="tab"
        aria-selected={props.active}
        aria-label={narrowed ? `All Reviews, ${current.label}` : 'All Reviews'}
        title={narrowed ? `Showing ${current.label}. Press for everyone outside your team.` : 'Changes owned by another team, or by people on no team'}
        className={'tab' + (props.active ? ' active' : '')}
        onClick={() => {
          props.onPick(undefined)
          props.onSelect()
          setOpen(false)
        }}
      >
        {props.short ? 'All' : 'All Reviews'}
        {narrowed ? (
          <>
            <span className="muted">· {current.label}</span>
            <span className="count">{current.n}</span>
          </>
        ) : (
          props.count
        )}
      </button>
      <button
        ref={caret}
        className={'tab tab-caret' + (props.active ? ' active' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="All Reviews: pick a team"
        title="One team at a time, or the people on no team"
        onClick={() => {
          const r = caret.current?.getBoundingClientRect()
          if (r) setAt({ left: Math.max(4, Math.min(r.right - 240, window.innerWidth - 244)), top: r.bottom + 4 })
          setOpen((o) => !o)
        }}
      >
        ▾
      </button>
      {open && (
        <div className="menu team-menu" role="menu" aria-label="All Reviews: which team" style={at}>
          {props.entries.map((e) => (
            <button
              key={e.pick === undefined ? ' all' : e.pick ?? ' other'}
              role="menuitemradio"
              aria-checked={e.pick === current.pick}
              className={'menu-item' + (e.pick === current.pick ? ' selected' : '')}
              onClick={() => {
                props.onPick(e.pick)
                props.onSelect()
                setOpen(false)
              }}
            >
              <span>{e.label}</span>
              <span className="count">{e.n}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
