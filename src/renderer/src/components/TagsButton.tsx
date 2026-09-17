import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { NOISE_TRAILERS, messageBody, parseTrailers, shownTrailers } from '../../../shared/trailers.ts'
import { TagIcon } from './Icons.tsx'

/**
 * A tag icon with a count, beside the change number: how many trailers the
 * commit message carries (Change-Id and Signed-off-by not counted). Click
 * opens a popover with the message body and every trailer as written. A
 * message with no trailers at all gets a solid red "no tags" badge, since
 * every change is expected to carry at least one. Nothing when the message
 * was not fetched.
 */
export function TagsButton(props: { message: string | undefined; small?: boolean }) {
  const { message } = props
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const wrap = useRef<HTMLSpanElement>(null)

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

  if (message === undefined) return null
  const all = parseTrailers(message)
  const shown = shownTrailers(all)
  const body = messageBody(message)
  const none = shown.length === 0

  function toggle(e: MouseEvent) {
    e.stopPropagation()
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      // Keep the popover on screen when the button sits near the right edge.
      const width = props.small ? 380 : 520
      setPos({ top: r.bottom + 4, left: Math.max(4, Math.min(r.left, document.documentElement.clientWidth - width - 4)) })
    }
    setOpen((o) => !o)
  }

  return (
    <span className="tags" ref={wrap}>
      <button
        className={'tagbtn' + (none ? ' none' : '') + (props.small ? ' sm' : '') + (open ? ' open' : '')}
        title={none ? 'No tags in the commit message' : shown.map((t) => `${t.key}: ${t.value}`).join('\n')}
        aria-expanded={open}
        onClick={toggle}
      >
        <TagIcon />
        <span>{none ? 'no tags' : shown.length}</span>
      </button>
      {open && pos && (
        <div className={'menu tags-pop' + (props.small ? ' sm' : '')} style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
          <div className="footer-block">
            {body && <div className="body">{body}</div>}
            {all.length === 0 && <div className="muted">The commit message has no tags.</div>}
            {all.map((t, i) => (
              <div key={i} className={NOISE_TRAILERS.has(t.key) ? 'noise' : undefined}>
                <span className="k">{t.key}:</span> {t.value}
              </div>
            ))}
          </div>
        </div>
      )}
    </span>
  )
}
