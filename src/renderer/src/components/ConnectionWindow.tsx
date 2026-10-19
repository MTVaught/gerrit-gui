import { useTheme } from '../theme.ts'
import { useEffect, useState } from 'react'
import type { SettingsStatus } from '../../../shared/types.ts'
import { api, isBrowserMode } from '../api.ts'
import { replacementPasswordMessage, sameCredentialIdentity } from '../../../shared/credentials.ts'

/**
 * The connection window: server URL, username and HTTP password, and the one
 * Test button in the application. It is its own window (a second browser tab
 * in browser mode), so it can stay open next to Gerrit while you fetch a new
 * HTTP password. Saving writes the three fields over the current settings;
 * a successful test then tells the board to reload.
 */
export function ConnectionWindow() {
  const [initial, setInitial] = useState<SettingsStatus | null>(null)
  useTheme(initial?.theme)
  const [serverUrl, setServerUrl] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  useEffect(() => {
    void api.getSettings().then((s) => {
      setInitial(s)
      setServerUrl(s.serverUrl)
      setUsername(s.username)
    })
    const reload = () => { void api.getSettings().then(setInitial) }
    const offSettings = api.onSettingsChanged(reload)
    window.addEventListener('focus', reload)
    return () => {
      offSettings()
      window.removeEventListener('focus', reload)
    }
  }, [])

  async function save() {
    setBusy(true)
    setStatus(null)
    setDone(false)
    try {
      const current = await api.getSettings()
      await api.saveSettings({ ...current, serverUrl, username, password: password || undefined })
      const me = await api.testConnection()
      setStatus(`Connected as ${me.name ?? me.username} (${me.email ?? 'no email'})`)
      setDone(true)
      setPassword('')
      setInitial(await api.getSettings())
      await api.connectionChanged()
    } catch (e) {
      setStatus(`Connection failed: ${(e as Error).message.replace(/^Error invoking remote method '[^']+': Error: /, '')}`)
    } finally {
      setBusy(false)
    }
  }

  if (!initial) return null
  const canReusePassword = initial.hasPassword && sameCredentialIdentity(initial, { serverUrl, username })
  const identityChanged = !sameCredentialIdentity(initial, { serverUrl, username }) && Boolean(initial.serverUrl && initial.username)
  const ok = status?.startsWith('Connected')
  return (
    <div className="app connection">
      <form
        className="panel settings"
        onSubmit={(e) => {
          e.preventDefault()
          void save()
        }}
      >
        <h2>Gerrit connection</h2>
        <p className="muted">
          Generate an HTTP password in Gerrit under Settings, HTTP Credentials. It is stored
          {initial.encrypted ? ' encrypted with the OS keychain.' : ' in plain text (no OS keychain available).'}
        </p>
        <label>
          Server URL
          <input value={serverUrl} disabled={busy} onChange={(e) => {
            if (!sameCredentialIdentity({ serverUrl, username }, { serverUrl: e.target.value, username })) setPassword('')
            setServerUrl(e.target.value)
            setStatus(null)
            setDone(false)
          }} placeholder="https://host/gerrit1  (paste any change URL; the app keeps the base)" autoFocus={!initial.serverUrl} />
        </label>
        <p className="muted small">Use HTTPS to protect your Gerrit credentials.</p>
        <label>
          Username
          <input value={username} disabled={busy} onChange={(e) => {
            if (!sameCredentialIdentity({ serverUrl, username }, { serverUrl, username: e.target.value })) setPassword('')
            setUsername(e.target.value)
            setStatus(null)
            setDone(false)
          }} />
        </label>
        <label>
          HTTP password
          <input type="password" value={password} disabled={busy} onChange={(e) => setPassword(e.target.value)} placeholder={canReusePassword ? '(unchanged)' : 'Enter HTTP password'} aria-describedby={identityChanged ? 'credential-identity-hint' : undefined} />
        </label>
        {identityChanged && <p id="credential-identity-hint" className="status" role="status">{replacementPasswordMessage}</p>}
        <div className="row">
          <button type="submit" className="btn primary" disabled={busy || !serverUrl.trim() || !username.trim() || (!password && !canReusePassword)}>
            {busy ? 'Testing...' : 'Test and save'}
          </button>
          {!isBrowserMode && (
            <button type="button" className="btn" onClick={() => void api.closeConnection()}>
              {done ? 'Done' : 'Cancel'}
            </button>
          )}
        </div>
        {status && <p className={'status ' + (ok ? 'ok' : 'error')}>{status}</p>}
        {done && isBrowserMode && <p className="muted small">The board reloads when you go back to its tab. You can close this one.</p>}
      </form>
    </div>
  )
}
