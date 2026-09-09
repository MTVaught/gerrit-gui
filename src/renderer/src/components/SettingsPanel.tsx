import { useState } from 'react'
import type { BadgeStyle, SettingsStatus } from '../../../shared/types.ts'
import { api, isBrowserMode } from '../api.ts'

export function SettingsPanel(props: { initial: SettingsStatus; onSaved: () => void; onClose: () => void }) {
  const [serverUrl, setServerUrl] = useState(props.initial.serverUrl)
  const [username, setUsername] = useState(props.initial.username)
  const [password, setPassword] = useState('')
  const [projects, setProjects] = useState(props.initial.projects.join(', '))
  const [badgeStyle, setBadgeStyle] = useState<BadgeStyle>(props.initial.badgeStyle)
  const [showZeroCounts, setShowZeroCounts] = useState(props.initial.showZeroCounts)
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
        badgeStyle,
        showZeroCounts,
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
      {!isBrowserMode && (
        <>
          <h2>Menu bar</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={badgeStyle === 'glyph'}
              onChange={(e) => setBadgeStyle(e.target.checked ? 'glyph' : 'color')}
            />
            Show glyphs instead of colored counts
          </label>
          <p className="muted small">
            The menu bar shows what waits on you as one colored count per category: Review, Fix, Mark ready, Merge. Glyphs
            (◉ ✎ ◆ ⇧) replace the colors if you cannot tell them apart. The tray menu names each category with its count.
          </p>
          <label className="check">
            <input type="checkbox" checked={showZeroCounts} onChange={(e) => setShowZeroCounts(e.target.checked)} />
            Always show all four categories, even at zero
          </label>
          <p className="muted small">
            Keeps every count in the menu bar so its position never changes. With colored counts, the app icon is left out
            and only the pills show.
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
    </div>
  )
}
