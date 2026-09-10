import { useEffect, useRef, useState } from 'react'
import type { ChangeLink, ChangeView } from '../../../shared/types.ts'
import { reviewLink } from '../../../shared/model.ts'
import { api } from '../api.ts'

/**
 * The reviewer's way into Gerrit. The main part opens the diff from the last
 * patch set they reviewed to the current one (or the current patch set against
 * base when they never reviewed it). The caret lists the other views: since
 * base, since the previous patch set, the change page, and a copyable link.
 * Voting itself happens in Gerrit.
 */
export function ReviewButton(props: { view: ChangeView }) {
  const { view: v } = props
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)

  const main = reviewLink(v)
  const last = v.lastReviewedPatchSet
  const upToDate = last !== null && last >= v.patchSet
  const label = upToDate
    ? `Open PS ${v.patchSet}`
    : main.basePatchSet !== undefined
      ? `${v.needsMyReview ? 'Review' : 'See'} PS ${main.basePatchSet} → ${v.patchSet}`
      : `Review PS ${v.patchSet}`
  const title = upToDate
    ? `You already reviewed patch set ${v.patchSet}. Opens it in Gerrit.`
    : main.basePatchSet !== undefined
      ? `Opens the diff from patch set ${main.basePatchSet}, the last one you reviewed, to patch set ${v.patchSet}`
      : `Opens patch set ${v.patchSet} against base in Gerrit. You have not reviewed this change yet.`

  const id = v.change._number
  const project = v.change.project
  const options: { label: string; detail: string; link: ChangeLink; selected?: boolean }[] = []
  if (main.basePatchSet !== undefined) {
    options.push({ label: 'Since my last review', detail: `PS ${main.basePatchSet} → ${v.patchSet}`, link: main, selected: true })
  }
  options.push({
    label: 'Since base',
    detail: `PS ${v.patchSet}`,
    link: { id, project, patchSet: v.patchSet },
    selected: main.basePatchSet === undefined,
  })
  if (v.patchSet > 1 && main.basePatchSet !== v.patchSet - 1) {
    options.push({
      label: 'Since previous patch set',
      detail: `PS ${v.patchSet - 1} → ${v.patchSet}`,
      link: { id, project, patchSet: v.patchSet, basePatchSet: v.patchSet - 1 },
    })
  }

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
    setCopied(false)
    setOpen((o) => !o)
  }

  function go(link: ChangeLink) {
    setOpen(false)
    void api.openChange(link)
  }

  async function copy() {
    const url = await api.changeUrl(main)
    await navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setOpen(false), 600)
  }

  const primary = v.needsMyReview ? ' primary' : ''
  return (
    <div className="split" ref={wrap}>
      <button className={'btn split-main' + primary} title={title} onClick={() => go(main)}>
        {label}
        <span className="ext" aria-hidden="true">
          ↗
        </span>
      </button>
      <button
        className={'btn split-caret' + primary}
        title="Other views of this change"
        aria-label="Other views of this change"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggle}
      >
        ▾
      </button>
      {open && pos && (
        <div className="menu" role="menu" style={{ top: pos.top, right: pos.right }}>
          {options.map((o) => (
            <button key={o.label} role="menuitem" className={'menu-item' + (o.selected ? ' selected' : '')} onClick={() => go(o.link)}>
              <span>{o.label}</span>
              <span className="muted">{o.detail}</span>
            </button>
          ))}
          <hr />
          <button role="menuitem" className="menu-item" onClick={() => go({ id, project })}>
            <span>Open change page</span>
            <span className="muted">#{id}</span>
          </button>
          <button role="menuitem" className="menu-item" onClick={() => void copy()}>
            <span>{copied ? 'Copied' : 'Copy diff link'}</span>
          </button>
        </div>
      )}
    </div>
  )
}
