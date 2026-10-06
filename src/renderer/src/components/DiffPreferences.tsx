import { useEffect, useRef, useState } from 'react'
import { whitespaceOptions, type ReviewPreferences } from '../review-preferences.ts'

export function DiffPreferences({ preferences, error, onSave, onClose }: {
  preferences: ReviewPreferences; error: string; onSave: (preferences: ReviewPreferences) => Promise<boolean>; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const [saving, setSaving] = useState(false)
  const [draft, setDraft] = useState({ ...preferences })
  function close() { dialog.current?.close(); previousFocus.current?.focus(); onClose() }
  useEffect(() => {
    previousFocus.current = document.activeElement as HTMLElement
    dialog.current!.showModal()
    return () => { dialog.current?.close() }
  }, [])
  function checkbox(key: 'fitToScreen' | 'showTabs' | 'showTrailingWhitespace' | 'syntaxHighlighting' | 'autoMarkReviewed', label: string) {
    return <label>{label}<input type="checkbox" checked={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })} /></label>
  }
  function number(key: 'diffWidth' | 'tabWidth' | 'fontSize', label: string, min: number, max: number) {
    return <label>{label}<input type="number" required min={min} max={max} step="1" disabled={key === 'diffWidth' && draft.fitToScreen}
      value={draft[key]} onChange={(e) => setDraft({ ...draft, [key]: Number(e.target.value) })} /></label>
  }
  return <dialog ref={dialog} className="review-preferences" aria-labelledby="diff-preferences-title" onCancel={(e) => { e.preventDefault(); e.stopPropagation(); if (!saving) close() }} onKeyDown={(e) => e.stopPropagation()}>
    <form onSubmit={(e) => { e.preventDefault(); if (saving) return; setSaving(true); void onSave(draft).then(ok => { if (ok) close() }).finally(() => setSaving(false)) }}>
      <h2 id="diff-preferences-title">Diff Preferences</h2>
      <fieldset disabled={saving} className="review-preference-fields" style={{ border: 0, margin: 0, minInlineSize: 0 }}>
        <label>Context<select value={draft.context} onChange={(e) => setDraft({ ...draft, context: Number(e.target.value) })}>
          <option value={-1}>Whole file</option>{![-1, 3, 10, 25, 50, 100].includes(draft.context) && <option value={draft.context}>{draft.context} lines</option>}{[3, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n} lines</option>)}
        </select></label>
        {checkbox('fitToScreen', 'Fit to screen')}
        {number('diffWidth', 'Diff width', 20, 1000)}
        {number('tabWidth', 'Tab width', 1, 16)}
        {number('fontSize', 'Font size', 8, 32)}
        {checkbox('showTabs', 'Show tabs')}
        {checkbox('showTrailingWhitespace', 'Show trailing whitespace')}
        {checkbox('syntaxHighlighting', 'Syntax highlighting')}
        {checkbox('autoMarkReviewed', 'Automatically mark viewed files reviewed')}
        <label>Ignore Whitespace<select value={draft.ignoreWhitespace} onChange={(e) => setDraft({ ...draft, ignoreWhitespace: e.target.value as ReviewPreferences['ignoreWhitespace'] })}>
          {whitespaceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select></label>
      </fieldset>
      <p className="muted small">Preferences sync with your Gerrit account. Fit to screen stays local. The complete file stays loaded when context is limited.</p>
      {error && <p role="alert" className="error">{error}</p>}
      <footer><button className="btn" type="button" disabled={saving} onClick={close}>Cancel</button><button className="btn primary" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button></footer>
    </form>
  </dialog>
}
