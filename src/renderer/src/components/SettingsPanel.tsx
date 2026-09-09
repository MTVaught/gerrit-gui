import { useState } from 'react'
import type { BadgeStyle, SettingsStatus } from '../../../shared/types.ts'
import { updateAction, updateButtonLabel, updateSummary } from '../../../shared/update.ts'
import { api, isBrowserMode } from '../api.ts'
import { ago } from '../time.ts'
import { runUpdateAction, useUpdateState } from './Update.tsx'
import { TeamEditor } from './TeamEditor.tsx'

export function SettingsPanel(props: { initial: SettingsStatus; onSaved: () => void; onClose: () => void }) {
  const [serverUrl, setServerUrl] = useState(props.initial.serverUrl)
  const [username, setUsername] = useState(props.initial.username)
  const [password, setPassword] = useState('')
  const [projects, setProjects] = useState(props.initial.projects.join(', '))
  const [team, setTeam] = useState<string[]>(props.initial.team)
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>(props.initial.badgeStyle)
  const [showZeroCounts, setShowZeroCounts] = useState(props.initial.showZeroCounts)
  const [showAppBadge, setShowAppBadge] = useState(props.initial.showAppBadge)
  const [showTrayCounts, setShowTrayCounts] = useState(props.initial.showTrayCounts)
  const [status, setStatus] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const canClose = props.initial.serverUrl && props.initial.username && props.initial.hasPassword

  async function save() {
    setSaving(true)
    setStatus(null)
    try {
      await api.saveSettings({
        serverUrl,
        username,
        password: password || undefined,
        projects: projects.split(',').map((p) => p.trim()).filter(Boolean),
        team,
        badgeStyle,
        showZeroCounts,
        showAppBadge,
        showTrayCounts,
      })
      const me = await api.testConnection()
      setStatus(`Connected as ${me.name ?? me.username} (${me.email ?? 'no email'})`)
      props.onSaved()
    } catch (e) {
      setStatus(`Connection failed: ${(e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')}`)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="panel settings">
      <h2>Gerrit connection</h2>
      <p className="muted">
        Generate an HTTP password in Gerrit under Settings, HTTP Credentials. It is stored
        {props.initial.encrypted ? ' encrypted with the OS keychain.' : ' in plain text (no OS keychain available).'}
      </p>
      <label>
        Server URL
        <input value={serverUrl} onChange={(e) => setServerUrl(e.target.value)} placeholder="https://host/gerrit1  (paste any change URL; the app keeps the base)" />
      </label>
      <label>
        Username
        <input value={username} onChange={(e) => setUsername(e.target.value)} />
      </label>
      <label>
        HTTP password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={props.initial.hasPassword ? '(unchanged)' : ''}
        />
      </label>
      <label>
        Projects to watch for WIP reviews (optional)
        <input value={projects} onChange={(e) => setProjects(e.target.value)} placeholder="empty for all projects, or platform/*, tools/build" />
      </label>
      <p className="muted small">
        Gerrit cannot search for WIP changes by reviewer, so the app scans open WIP changes and keeps the ones you are on.
        Leave empty on a small server. Comma-separated; a trailing * matches a prefix.
      </p>
      <h2>Team</h2>
      <p className="muted">
        With a team, only the votes of its members decide whether a change is approved or needs changes. Anyone else
        who reviews is shown on the change and on the <b>External reviews</b> tab, and their votes never change the
        state. Leave the list empty to count every reviewer.
      </p>
      <TeamEditor members={team} onChange={setTeam} canSearch={Boolean(canClose)} />
      <p className="muted small">
        Usernames or email addresses, matched without regard to case. You are always on the team, so you do not need
        to add yourself. Start typing to pick from the accounts on the server.
      </p>
      {!isBrowserMode && (
        <>
          <h2>App icon</h2>
          <label className="check">
            <input type="checkbox" checked={showAppBadge} onChange={(e) => setShowAppBadge(e.target.checked)} />
            Show the total as a badge on the app icon
          </label>
          <p className="muted small">The Dock on macOS, the launcher on Linux and the taskbar on Windows.</p>
          <h2>Menu bar</h2>
          <label className="check">
            <input type="checkbox" checked={showTrayCounts} onChange={(e) => setShowTrayCounts(e.target.checked)} />
            Show counts on the menu bar icon
          </label>
          <p className="muted small">
            Off, the menu bar keeps the plain icon. The tooltip and the menu still list what waits on you.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={badgeStyle === 'glyph'}
              disabled={!showTrayCounts}
              onChange={(e) => setBadgeStyle(e.target.checked ? 'glyph' : 'color')}
            />
            Show glyphs instead of colored counts
          </label>
          <p className="muted small">
            The menu bar shows what waits on you as one colored count per category: Review, Fix, Mark ready, Merge. Glyphs
            (◉ ✎ ◆ ⇧) replace the colors if you cannot tell them apart. The counts stand in for the app icon, which
            shows only when nothing waits on you. The tray menu names each category with its count.
          </p>
          <label className="check">
            <input
              type="checkbox"
              checked={showZeroCounts}
              disabled={!showTrayCounts}
              onChange={(e) => setShowZeroCounts(e.target.checked)}
            />
            Always show Review, Fix and Mark ready, even at zero
          </label>
          <p className="muted small">
            Keeps those counts in the menu bar so their position never changes. Merge appears only when you have something
            to merge, since it needs +2 rights.
          </p>
        </>
      )}
      <div className="row">
        <button className="btn primary" onClick={() => void save()} disabled={saving || !serverUrl || !username}>
          {saving ? 'Testing...' : 'Save and test'}
        </button>
        {canClose && (
          <button className="btn" onClick={props.onClose}>
            Cancel
          </button>
        )}
      </div>
      {status && <p className={'status ' + (status.startsWith('Connected') ? 'ok' : 'error')}>{status}</p>}
      {!isBrowserMode && <AboutSection />}
    </div>
  )
}

/** Version, update status and the manual check; the same steps as the top bar button and the tray. */
function AboutSection() {
  const state = useUpdateState()
  const [pending, setPending] = useState(false)
  if (!state) return null
  const action = updateAction(state)
  return (
    <>
      <h2>About</h2>
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
