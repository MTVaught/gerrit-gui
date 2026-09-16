import { useEffect, useRef, useState } from 'react'
import type { MergerRule, SettingsInput, SettingsStatus } from '../../../shared/types.ts'
import { mergersReflect } from '../../../shared/model.ts'
import { updateAction, updateButtonLabel, updateSummary } from '../../../shared/update.ts'
import { api, isBrowserMode } from '../api.ts'
import { ago } from '../time.ts'
import { runUpdateAction, useUpdateState } from './Update.tsx'
import { TeamEditor } from './TeamEditor.tsx'
import { MergersEditor } from './MergersEditor.tsx'
import { PlugIcon } from './Icons.tsx'

type SectionId = 'team' | 'mergers' | 'scope' | 'app-icon' | 'window' | 'menu-bar' | 'about'

const SECTIONS: { id: SectionId; label: string; desktopOnly?: boolean }[] = [
  { id: 'team', label: 'Team' },
  { id: 'mergers', label: 'Mergers' },
  { id: 'scope', label: 'Scope' },
  { id: 'app-icon', label: 'App icon', desktopOnly: true },
  { id: 'window', label: 'Window', desktopOnly: true },
  { id: 'menu-bar', label: 'Menu bar', desktopOnly: true },
  { id: 'about', label: 'About', desktopOnly: true },
]

type SyncState = { kind: 'saved' } | { kind: 'saving' } | { kind: 'error'; message: string }

/**
 * The settings page: a nav of sections on the left (a picker row in the
 * compact window) and one section at a time on the right. There is no Save
 * button: every control writes as soon as it changes, and the pill in the
 * header says whether the write is done. Text fields write when they lose
 * focus or on Enter. The connection (server, account, password) is not here;
 * the last nav entry opens its own window for it.
 */
export function SettingsPanel(props: {
  settings: SettingsStatus
  compact: boolean
  /** Write these fields over the current settings. */
  save: (patch: Partial<SettingsInput>) => Promise<void>
}) {
  const sections = SECTIONS.filter((s) => !s.desktopOnly || !isBrowserMode)
  const [section, setSection] = useState<SectionId>('team')
  const [sync, setSync] = useState<SyncState>({ kind: 'saved' })
  const s = props.settings
  const connected = Boolean(s.serverUrl && s.username && s.hasPassword)

  async function apply(patch: Partial<SettingsInput>) {
    setSync({ kind: 'saving' })
    try {
      await props.save(patch)
      setSync({ kind: 'saved' })
    } catch (e) {
      setSync({ kind: 'error', message: (e as Error).message })
    }
  }

  const current = sections.find((x) => x.id === section) ?? sections[0]!
  const host = hostOf(s.serverUrl)
  const connection = (
    <button type="button" className="conn-link" onClick={() => void api.openConnection()} title="Server, username and HTTP password, in their own window">
      <PlugIcon /> Connection <span className="arrow">↗</span>
      <span className="muted small conn-who">{s.username ? `${s.username} · ${host}` : 'not set up'}</span>
    </button>
  )

  return (
    <div className={'settings-page' + (props.compact ? ' compact' : '')}>
      {props.compact ? (
        <div className="section-pick">
          <select value={section} onChange={(e) => setSection(e.target.value as SectionId)} aria-label="Settings section">
            {sections.map((x) => (
              <option key={x.id} value={x.id}>
                {x.label}
              </option>
            ))}
          </select>
          <SyncPill state={sync} />
          {connection}
        </div>
      ) : (
        <nav className="section-nav" aria-label="Settings sections">
          {sections.map((x) => (
            <button key={x.id} type="button" className={x.id === section ? 'active' : ''} aria-current={x.id === section} onClick={() => setSection(x.id)}>
              {x.label}
            </button>
          ))}
          <div className="sep" />
          {connection}
        </nav>
      )}
      <main className="settings section-body">
        {!props.compact && (
          <div className="section-head">
            <h1>{current.label}</h1>
            <SyncPill state={sync} />
          </div>
        )}
        {section === 'team' && (
          <>
            <p className="muted">
              The team decides where a change is listed. Changes owned by the team are on the regular tabs and on{' '}
              <b>Team Reviews</b>; changes owned by people outside the team are on <b>External Reviews</b> only. Who decides a
              change is not the team but its primary reviewers, tagged on the change with the "+" button on its row. Leave the
              list empty to hide the two tabs.
            </p>
            <TeamEditor members={s.team} onChange={(team) => void apply({ team })} canSearch={connected} />
            <p className="muted small">
              Stored as usernames; an email address still matches. You are always on the team, so you do not need to add
              yourself. Start typing to pick from the accounts on the server.
            </p>
          </>
        )}
        {section === 'mergers' && (
          <>
            <p className="muted">
              Who to offer when you ask for a merge. The <b>Ready to Merge</b> button lists the people set for the project of
              the change, most specific row first; anyone else on the server is a search away. The list only fills that menu.
            </p>
            <MergersSection rules={s.mergers} onSave={(mergers) => void apply({ mergers })} canSearch={connected} />
            <p className="muted small">
              A project is an exact name, a prefix ending in <code>*</code>, or <code>*</code> alone for every project.
            </p>
          </>
        )}
        {section === 'scope' && (
          <>
            <label>
              Projects to watch for WIP reviews (optional)
              <TextField value={s.projects.join(', ')} placeholder="empty for all projects, or platform/*, tools/build" onSave={(v) => void apply({ projects: v.split(',').map((p) => p.trim()).filter(Boolean) })} />
            </label>
            <p className="muted small">
              Gerrit cannot search for WIP changes by reviewer, so the app scans open WIP changes and keeps the ones you are
              on. Leave empty on a small server. Comma-separated; a trailing * matches a prefix. A change here reloads the
              board.
            </p>
          </>
        )}
        {section === 'app-icon' && (
          <>
            <label className="check">
              <input type="checkbox" checked={s.showAppBadge} onChange={(e) => void apply({ showAppBadge: e.target.checked })} />
              Show the total as a badge on the app icon
            </label>
            <p className="muted small">The Dock on macOS, the launcher on Linux and the taskbar on Windows.</p>
          </>
        )}
        {section === 'window' && (
          <>
            <label className="check">
              <input type="checkbox" checked={s.compactOnTop} onChange={(e) => void apply({ compactOnTop: e.target.checked })} />
              Compact window stays on top
            </label>
            <p className="muted small">
              The compact window floats above other windows and follows you to every workspace. Turn this off to let it
              behave like a normal window. The full-size window is never pinned.
            </p>
          </>
        )}
        {section === 'menu-bar' && (
          <>
            <label className="check">
              <input type="checkbox" checked={s.showTrayCounts} onChange={(e) => void apply({ showTrayCounts: e.target.checked })} />
              Show counts on the menu bar icon
            </label>
            <p className="muted small">
              Off, the menu bar keeps the plain icon. The tooltip and the menu still list what waits on you.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={s.badgeStyle === 'glyph'}
                disabled={!s.showTrayCounts}
                onChange={(e) => void apply({ badgeStyle: e.target.checked ? 'glyph' : 'color' })}
              />
              Show glyphs instead of colored counts
            </label>
            <p className="muted small">
              The menu bar shows what waits on you as one colored count per category: Needs Review, Needs Changes, Approved,
              Ready to Merge. Glyphs (◉ ✎ ◆ ⇧) replace the colors if you cannot tell them apart. The counts stand in for the
              app icon, which shows only when nothing waits on you. The tray menu names each category with its count.
            </p>
            <label className="check">
              <input
                type="checkbox"
                checked={s.showZeroCounts}
                disabled={!s.showTrayCounts}
                onChange={(e) => void apply({ showZeroCounts: e.target.checked })}
              />
              Always show Needs Review, Needs Changes and Approved, even at zero
            </label>
            <p className="muted small">
              Keeps those counts in the menu bar so their position never changes. Ready to Merge appears only when you have
              something to merge, since it needs +2 rights.
            </p>
          </>
        )}
        {section === 'about' && <AboutSection />}
      </main>
    </div>
  )
}

/** Saved, saving, or the error of the last write. */
function SyncPill(props: { state: SyncState }) {
  const st = props.state
  if (st.kind === 'error') {
    return (
      <span className="sync error" role="alert" title={st.message}>
        Not saved: {st.message}
      </span>
    )
  }
  return (
    <span className={'sync ' + st.kind} role="status">
      <span className="dot" /> {st.kind === 'saving' ? 'Saving…' : 'Saved'}
    </span>
  )
}

/** A text field that writes when it loses focus or on Enter, not on every keystroke. */
function TextField(props: { value: string; placeholder?: string; onSave: (value: string) => void }) {
  const [v, setV] = useState(props.value)
  useEffect(() => setV(props.value), [props.value])
  const commit = () => {
    if (v !== props.value) props.onSave(v)
  }
  return (
    <input
      value={v}
      placeholder={props.placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          commit()
        }
      }}
    />
  )
}

/**
 * The mergers editor edits a list with text fields in it, so its changes are
 * written a moment after the last keystroke rather than on each one. The
 * save drops rows that are not complete yet (a project with nobody on it, or
 * no project), so when the saved list comes back it is only adopted when it
 * says something else than the rows on screen; otherwise a row just added
 * with Add project would vanish before anyone could be put on it.
 */
function MergersSection(props: { rules: MergerRule[]; onSave: (rules: MergerRule[]) => void; canSearch: boolean }) {
  const [rules, setRules] = useState(props.rules)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirty = useRef(false)
  useEffect(() => {
    if (dirty.current) return
    setRules((cur) => (mergersReflect(cur, props.rules) ? cur : props.rules))
  }, [props.rules])
  const change = (next: MergerRule[]) => {
    setRules(next)
    dirty.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      dirty.current = false
      props.onSave(next)
    }, 400)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )
  return <MergersEditor rules={rules} onChange={change} canSearch={props.canSearch} />
}

/** Version, update status and the manual check; the same steps as the top bar button and the tray. */
function AboutSection() {
  const state = useUpdateState()
  const [pending, setPending] = useState(false)
  if (!state) return null
  const action = updateAction(state)
  return (
    <>
      <p>
        Gerrit Review Board {state.currentVersion}.{' '}
        <span className="muted">
          {updateSummary(state)}
          {state.checkedAt && ` · Last checked ${ago(new Date(state.checkedAt))}`}
        </span>
      </p>
      <div className="row">
        <button
          className="btn"
          disabled={action === 'none' || pending}
          onClick={async () => {
            setPending(true)
            try {
              await runUpdateAction(state, true)
            } finally {
              setPending(false)
            }
          }}
        >
          {updateButtonLabel(state)}
        </button>
        <button className="btn" onClick={() => void api.openReleaseNotes()}>
          Release notes
        </button>
      </div>
      {state.releaseNotes && <pre className="release-notes">{state.releaseNotes}</pre>}
    </>
  )
}

/** The host of the server URL, for the nav entry; the path prefix would only take room. */
function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url || 'no server yet'
  }
}
