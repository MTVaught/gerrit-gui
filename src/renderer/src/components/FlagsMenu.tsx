import { useEffect, useRef, useState } from 'react'
import { actionClass, type ActionSpec } from './actions.ts'

/**
 * A button with a caret that opens a small menu: the owner's subtle "Mark
 * active" or "Mark WIP" button with the WIP and private toggles, or the
 * "Pass around" / "In person" button that switches the kind of an open
 * request. Same open/close behaviour as the reviewer's split button.
 */
export function FlagsMenu(props: { spec: ActionSpec; small?: boolean }) {
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

  const size = props.small ? 'sm' : ''
  // The same two-part shape as every other button with a menu; both parts
  // open the menu, as there is no default action.
  return (
    <div className="split flags-menu" ref={wrap}>
      <button className={actionClass(spec, `split-main ${size}`)} title={spec.title} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        {spec.label}
      </button>
      <button className={actionClass(spec, `split-caret ${size}`)} title={spec.title} aria-label={spec.title} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>
        ▾
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
