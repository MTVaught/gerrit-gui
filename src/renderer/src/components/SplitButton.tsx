import { useEffect, useRef, useState } from 'react'
import { actionClass, type ActionSpec } from './actions.ts'

/**
 * An owner's button with two parts: the main part runs the spec's default
 * action, the caret opens a menu of the other choices (`spec.split`). Used
 * for "Request review", whose default is a pass-around review and whose menu
 * offers the in-person kind, and for "Withdraw request", whose menu switches
 * the kind of the open request. Same open/close behaviour as the reviewer's
 * split button.
 */
export function SplitButton(props: { spec: ActionSpec; small?: boolean }) {
  const { spec } = props
  const items = spec.split ?? []
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
    window.addEventListener('scroll', close, true)
    window.addEventListener('resize', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('resize', close)
    }
  }, [open])

  function toggle() {
    if (!open && wrap.current) {
      // Fixed position, so the menu escapes the list's overflow clipping.
      const r = wrap.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: document.documentElement.clientWidth - r.right })
    }
    setOpen((o) => !o)
  }

  const size = props.small ? 'sm' : ''
  return (
    <div className="split" ref={wrap}>
      <button className={actionClass(spec, `split-main ${size}`)} disabled={spec.disabled} title={spec.title} onClick={spec.run}>
        {props.small ? spec.short : spec.label}
      </button>
      <button
        className={actionClass(spec, `split-caret ${size}`)}
        disabled={spec.disabled}
        title="Other choices"
        aria-label="Other choices"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        ▾
      </button>
      {open && pos && (
        <div className="menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {items.map((m) => (
            <button
              key={m.key}
              role="menuitem"
              className="menu-item"
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
