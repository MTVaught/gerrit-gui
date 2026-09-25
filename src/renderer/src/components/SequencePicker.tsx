import { useEffect, useRef, useState } from 'react'
import type { ChangeAction, ChangeView } from '../../../shared/types.ts'
import { STATE_LABEL, isSequenced, type RelatedSet } from '../../../shared/model.ts'

/**
 * The owner's sequence manager: a button that opens a checklist of the
 * changes built on each other around one change, in reading order, base
 * first. The ticked ones get the `sequence` tag, the unticked ones lose
 * it. Opened from the stub card of a set with no sequence yet (everything
 * ticked to start with) and from the head of a sequence card (the members
 * ticked). Unticking everything dissolves the sequence.
 */
export function SequencePicker(props: {
  set: RelatedSet
  /** The change the button is on; the action names it. */
  from: ChangeView
  label: string
  title: string
  onAct: (a: ChangeAction) => Promise<void>
  small?: boolean
}) {
  const { set } = props
  const tagged = set.members.filter((v) => isSequenced(v.change)).map((v) => v.change._number)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)
  const [checked, setChecked] = useState<Set<number>>(new Set())
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

  function toggle() {
    if (!open && wrap.current) {
      const r = wrap.current.getBoundingClientRect()
      setPos({ top: r.bottom + 4, right: Math.max(8, document.documentElement.clientWidth - r.right) })
      // A set with no sequence yet starts with every change ticked: the usual wish is the whole line.
      setChecked(new Set(tagged.length > 0 ? tagged : set.members.map((v) => v.change._number)))
    }
    setOpen((o) => !o)
  }

  function setOn(n: number, on: boolean) {
    setChecked((s) => {
      const next = new Set(s)
      if (on) next.add(n)
      else next.delete(n)
      return next
    })
  }

  const add = [...checked].filter((n) => !tagged.includes(n))
  const remove = tagged.filter((n) => !checked.has(n))
  const changed = add.length > 0 || remove.length > 0
  // One ticked change is no sequence; the tag would only sit there.
  const lone = checked.size === 1
  const dissolve = checked.size === 0 && tagged.length > 0

  async function confirm() {
    if (!changed || lone) return
    setOpen(false)
    await props.onAct({ type: 'setSequence', id: props.from.change._number, add, remove })
  }

  const size = props.small ? ' sm' : ''
  return (
    <span className="picker-wrap seq-btn" ref={wrap}>
      <button className={'btn' + size} title={props.title} aria-haspopup="dialog" aria-expanded={open} onClick={toggle}>
        {props.label}
      </button>
      {open && pos && (
        <div className="menu picker sequence" role="dialog" aria-label="Sequence" style={{ top: pos.top, right: pos.right }}>
          <h4>
            Sequence on <code>{set.members[0]!.change.branch}</code> · {set.members[0]!.change.project}
          </h4>
          <p className="muted small">Tick the changes reviewers should see as one card, in this order. The order comes from what each change is built on.</p>
          <div className="picker-list">
            {set.members.map((v, i) => {
              const n = v.change._number
              const on = checked.has(n)
              const parent = set.parents.get(n)
              return (
                <label key={n} className={'seq-row' + (on ? '' : ' off')}>
                  <input type="checkbox" checked={on} onChange={(e) => setOn(n, e.target.checked)} />
                  <span className="step">{i + 1}</span>
                  <span className="n">#{n}</span>
                  <span className="subj" title={v.change.subject}>
                    {v.change.subject}
                  </span>
                  {parent && (
                    <span className="built" title={parent.stale ? `Built on patch set ${parent.patchSet} of #${parent.view.change._number}, which is now on patch set ${parent.view.patchSet}` : `Built on #${parent.view.change._number}`}>
                      on #{parent.view.change._number}
                      {parent.stale && ` PS ${parent.patchSet}`}
                    </span>
                  )}
                  <span className={`badge ${v.state}`}>{STATE_LABEL[v.state]}</span>
                </label>
              )
            })}
          </div>
          <div className="picker-foot">
            <span className="muted small">{lone ? 'A sequence needs two changes' : `${checked.size} of ${set.members.length} related changes`}</span>
            <button type="button" className="link muted" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn primary" disabled={!changed || lone} onClick={() => void confirm()}>
              {dissolve ? 'Remove sequence' : 'Save sequence'}
            </button>
          </div>
        </div>
      )}
    </span>
  )
}
