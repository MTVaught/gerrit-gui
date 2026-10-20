import { cloneElement, useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactElement, type Ref } from 'react'
import { createPortal } from 'react-dom'

type TriggerProps = HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement>; disabled?: boolean }

/** Adds help to the existing element without a layout wrapper or another button. */
export function Tooltip({ text, children, focusable = false }: { text: string; children: ReactElement<TriggerProps>; focusable?: boolean }) {
  const id = useId()
  const trigger = useRef<HTMLElement | null>(null)
  const bubble = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const active = useRef({ hover: false, focus: false, content: false, dismissed: false })
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false })
  const original = children.props
  const ref = useCallback((node: HTMLElement | null) => {
    trigger.current = node
    if (typeof original.ref === 'function') return original.ref(node)
    if (original.ref) original.ref.current = node
  }, [original.ref])

  function clearTimer() { clearTimeout(timer.current) }
  function dismiss() {
    clearTimer()
    active.current.dismissed = true
    active.current.content = false
    setOpen(false)
  }
  function show(delay = 0) {
    clearTimer()
    if (active.current.dismissed) return
    window.dispatchEvent(new CustomEvent('dashboard-tooltip-open', { detail: id }))
    timer.current = setTimeout(() => {
      setPosition(p => ({ ...p, ready: false }))
      setOpen(true)
    }, delay)
  }
  function leave() {
    clearTimer()
    // Let the pointer cross the small gap between the trigger and tooltip.
    timer.current = setTimeout(() => {
      if (!active.current.hover && !active.current.focus && !active.current.content) setOpen(false)
    }, 120)
  }

  useEffect(() => {
    const otherOpened = (event: Event) => {
      if ((event as CustomEvent).detail !== id) dismiss()
    }
    window.addEventListener('dashboard-tooltip-open', otherOpened)
    return () => {
      clearTimer()
      window.removeEventListener('dashboard-tooltip-open', otherOpened)
    }
  }, [id])

  useLayoutEffect(() => {
    if (!open) return
    function place() {
      const target = trigger.current
      if (!target?.isConnected || !target.getClientRects().length) { setOpen(false); return }
      const r = target.getBoundingClientRect()
      const tip = bubble.current?.getBoundingClientRect()
      const width = document.documentElement.clientWidth
      const height = document.documentElement.clientHeight
      if (!tip) return
      if (r.bottom < 0 || r.top > height || r.right < 0 || r.left > width) { setOpen(false); return }
      const above = r.top - tip.height - 8
      setPosition({
        left: Math.max(8, Math.min(r.left + (r.width - tip.width) / 2, width - tip.width - 8)),
        top: Math.max(8, Math.min(above >= 8 ? above : r.bottom + 8, height - tip.height - 8)),
        ready: true,
      })
    }
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') dismiss() }
    const observer = new ResizeObserver(place)
    if (trigger.current) observer.observe(trigger.current)
    if (bubble.current) observer.observe(bubble.current)
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    document.addEventListener('keydown', key, true)
    return () => {
      observer.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      document.removeEventListener('keydown', key, true)
    }
  }, [open, text])

  return <>
    {cloneElement(children, {
      ref,
      title: undefined,
      'aria-describedby': [original['aria-describedby'], open ? id : null].filter(Boolean).join(' ') || undefined,
      ...(focusable ? { tabIndex: original.tabIndex ?? 0 } : {}),
      ...{ 'data-tooltip-trigger': '' },
      onPointerEnter: event => { original.onPointerEnter?.(event); if ((event.target as Element).closest('[data-tooltip-trigger]') !== event.currentTarget) return; active.current.hover = true; active.current.dismissed = false; show(300) },
      onPointerLeave: event => { original.onPointerLeave?.(event); active.current.hover = false; leave() },
      onFocus: event => { original.onFocus?.(event); if (event.target !== event.currentTarget) return; active.current.focus = true; active.current.dismissed = false; show() },
      onBlur: event => { original.onBlur?.(event); if (event.target !== event.currentTarget) return; active.current.focus = false; leave() },
      onClick: event => { dismiss(); original.onClick?.(event) },
    })}
    {open && createPortal(<div ref={bubble} id={id} role="tooltip" className="dashboard-tooltip"
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
      onPointerEnter={() => { active.current.content = true; clearTimer() }}
      onPointerLeave={() => { active.current.content = false; leave() }}>
      {text}
    </div>, document.body)}
  </>
}

/** Retains the button's existing handlers, ref, and accessible name. */
export function TooltipButton({ title, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { ref?: Ref<HTMLButtonElement> }) {
  const text = title ?? props['aria-label']
  const button = <button {...props} aria-label={props['aria-label'] ?? (typeof props.children === 'string' && !/^[×↓↑▾+]$/.test(props.children.trim()) ? undefined : title)} />
  return text ? <Tooltip text={text}>{button}</Tooltip> : button
}
