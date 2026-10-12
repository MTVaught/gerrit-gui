import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ChangeView } from '../../../shared/types.ts'
import { countFamilies, groupsFor, teamPicks, type TeamPick, type TeamSetup } from '../../../shared/model.ts'

/** The team tab's menu entries with the number of cards under each; empty with one watched team. */
export function teamEntries(setup: TeamSetup, views: ChangeView[]): { pick: TeamPick; label: string; n: number }[] {
  return teamPicks(setup).map((e) => ({ ...e, n: countFamilies(groupsFor('team-reviews', views, e.pick).flatMap((g) => g.items)) }))
}

/**
 * The team tab: named after the user's team, or Watched, with the count of
 * the list it shows. With several watched teams it is a split tab, like the
 * split buttons on the rows: the caret opens a menu of the watched teams
 * and all of them together, and picking one changes the list below. The
 * label stays; the check in the menu and the line above the list say
 * which team is showing. Pressing the label returns to the default team.
 */
export function TeamTab(props: {
  label: string
  /** Menu entries; none means a plain tab. */
  entries: { pick: TeamPick; label: string; n: number }[]
  pick: TeamPick
  active: boolean
  /** The count pill, styled like the other tabs'. */
  count: ReactNode
  /** Show the picked team's list and bring the tab up. */
  onPick: (p: TeamPick) => void
  /** Show the default team's list and bring the tab up. */
  onSelect: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const caret = useRef<HTMLButtonElement>(null)
  // The strip scrolls sideways in the compact window and would clip the menu, so it is placed against the window.
  const [at, setAt] = useState<{ left: number; top: number }>({ left: 0, top: 0 })

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

  const tab = (
    <button
      role="tab"
      aria-selected={props.active}
      aria-label={props.label}
      title={`Show ${props.label}'s open changes`}
      className={'tab' + (props.active ? ' active' : '')}
      onClick={() => {
        props.onSelect()
        setOpen(false)
      }}
    >
      {props.label}
      {props.count}
    </button>
  )
  if (props.entries.length === 0) return tab
  return (
    <div className="tab-split" ref={root}>
      {tab}
      <button
        ref={caret}
        className={'tab tab-caret' + (props.active ? ' active' : '')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Pick a watched team"
        title="One watched team at a time, or all of them"
        onClick={() => {
          const r = caret.current?.getBoundingClientRect()
          if (r) setAt({ left: Math.max(4, Math.min(r.right - 240, window.innerWidth - 244)), top: r.bottom + 4 })
          setOpen((o) => !o)
        }}
      >
        ▾
      </button>
      {open && (
        <div className="menu team-menu" role="menu" aria-label="Which team" style={at}>
          {props.entries.map((e) => (
            <button
              key={e.pick ?? ' all'}
              role="menuitemradio"
              aria-checked={e.pick === props.pick}
              className={'menu-item' + (e.pick === props.pick ? ' selected' : '')}
              onClick={() => {
                props.onPick(e.pick)
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
