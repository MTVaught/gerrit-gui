import { useEffect, useId, useRef, useState } from 'react'
import type { DiffThemePreference } from '../../../shared/types.ts'
import { diffThemeOptions } from '../../../shared/theme.ts'
import { whitespaceOptions, type ChangeReviewPreference, type ReviewPreferenceErrors, type ReviewPreferences } from '../review-preferences.ts'

export function DiffPreferences({ preferences, diffTheme, errors, onChange, onThemeChange, onClose }: {
  preferences: ReviewPreferences
  diffTheme: DiffThemePreference
  errors: ReviewPreferenceErrors
  onChange: ChangeReviewPreference
  onThemeChange: (theme: DiffThemePreference) => void
  onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)
  const errorId = useId()
  function errorProps(name: keyof ReviewPreferenceErrors) {
    return { 'aria-invalid': Boolean(errors[name]), 'aria-describedby': errors[name] ? `${errorId}-${name}` : undefined }
  }
  function close() { dialog.current?.close(); previousFocus.current?.focus(); onClose() }
  useEffect(() => {
    const el = dialog.current!
    previousFocus.current = document.activeElement as HTMLElement
    el.showModal()
    return () => { el.close() }
  }, [])
  function checkbox(name: 'fitToScreen' | 'showTabs' | 'showTrailingWhitespace' | 'syntaxHighlighting' | 'autoMarkReviewed', label: string) {
    return <label>{label}<input type="checkbox" checked={preferences[name]} {...errorProps(name)} onChange={e => onChange(name, e.target.checked)} /></label>
  }
  return <dialog ref={dialog} className="review-preferences" aria-labelledby="diff-preferences-title" onCancel={e => { e.preventDefault(); e.stopPropagation(); close() }} onKeyDown={e => e.stopPropagation()}>
    <h2 id="diff-preferences-title">Diff Preferences</h2>
    <div className="review-preference-fields">
      <label>Diff theme<select value={diffTheme} {...errorProps('diffTheme')} onChange={e => onThemeChange(e.target.value as DiffThemePreference)}>
        {diffThemeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
      <label>Context<select value={preferences.context} {...errorProps('context')} onChange={e => onChange('context', Number(e.target.value))}>
        <option value={-1}>Whole file</option>{![-1, 3, 10, 25, 50, 100].includes(preferences.context) && <option value={preferences.context}>{preferences.context} lines</option>}{[3, 10, 25, 50, 100].map(n => <option key={n} value={n}>{n} lines</option>)}
      </select></label>
      {checkbox('fitToScreen', 'Fit to screen')}
      <NumberPreference label="Diff width" value={preferences.diffWidth} min={20} max={1000} disabled={preferences.fitToScreen} error={errors.diffWidth} errorId={`${errorId}-diffWidth`} onChange={value => onChange('diffWidth', value)} />
      <NumberPreference label="Tab width" value={preferences.tabWidth} min={1} max={16} error={errors.tabWidth} errorId={`${errorId}-tabWidth`} onChange={value => onChange('tabWidth', value)} />
      <NumberPreference label="Font size" value={preferences.fontSize} min={8} max={32} error={errors.fontSize} errorId={`${errorId}-fontSize`} onChange={value => onChange('fontSize', value)} />
      {checkbox('showTabs', 'Show tabs')}
      {checkbox('showTrailingWhitespace', 'Show trailing whitespace')}
      {checkbox('syntaxHighlighting', 'Syntax highlighting')}
      {checkbox('autoMarkReviewed', 'Automatically mark viewed files reviewed')}
      <label>Ignore Whitespace<select value={preferences.ignoreWhitespace} {...errorProps('ignoreWhitespace')} onChange={e => onChange('ignoreWhitespace', e.target.value as ReviewPreferences['ignoreWhitespace'])}>
        {whitespaceOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
    </div>
    <p className="muted small">Changes apply automatically in this application.</p>
    {Object.entries(errors).filter(([, message]) => message).map(([name, message]) => <p key={name} id={`${errorId}-${name}`} role="alert" className="error">{message}</p>)}
    <footer><button className="btn" type="button" onClick={close}>Close</button></footer>
  </dialog>
}

function NumberPreference({ label, value, min, max, disabled, error, errorId, onChange }: {
  label: string; value: number; min: number; max: number; disabled?: boolean
  error?: string; errorId: string; onChange: (value: number) => boolean
}) {
  const [input, setInput] = useState(String(value))
  const [invalid, setInvalid] = useState(false)
  const validationId = useId()
  useEffect(() => { setInput(String(value)); setInvalid(false) }, [value])
  return <label>{label}<span className="review-preference-number">
    <input type="number" required min={min} max={max} step="1" disabled={disabled} value={input}
      aria-invalid={invalid || Boolean(error)} aria-describedby={invalid ? validationId : error ? errorId : undefined}
      onChange={e => {
        const text = e.currentTarget.value
        setInput(text)
        const valid = text !== '' && e.currentTarget.validity.valid && Number.isInteger(Number(text))
        setInvalid(!valid)
        if (valid && !onChange(Number(text))) setInput(String(value))
      }} />
    {invalid && <span id={validationId} className="error small" role="alert">Enter a whole number from {min} to {max}.</span>}
  </span></label>
}
