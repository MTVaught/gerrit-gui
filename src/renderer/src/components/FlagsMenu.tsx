import { useEffect, useRef, useState } from 'react'
import type { ActionSpec } from './actions.ts'

/**
 * The owner's subtle button in the last column: "Mark active" or "Mark WIP"
 * with a caret, opening a small menu with the WIP toggle and the private
 * toggle. Same open/close behaviour as the reviewer's split button.
 */
export function FlagsMenu(props: { spec: ActionSpec }) {
  const { spec } = props
  const items = spec.menu ?? []
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: Event) => {
      if (e.type === 'keydown' && (e as KeyboardEvent).key !== 'Escape') return
      if (e.type === 'mousedown' && wrap.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggle() {
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: document.documentElement.clientWidth - r.right })
    }
    setOpen((o) => !o)
  }

  return (
    <div className="flags-menu" ref={wrap}>
      <button className="btn subtle" title={spec.title} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {spec.label}
        <span className="arrow" aria-hidden="true">
          ▾
        </span>
      </button>
      {open && pos && (
        <div className="menu flags" role="menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((m) => (
            <button
              key={m.key}
              className="menu-item"
              role="menuitem"
              title={m.title}
              onClick={() => {
                setOpen(false)
                m.run()
              }}
            >
              <span>{m.label}</span>
              {m.detail && <span className="muted">{m.detail}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
