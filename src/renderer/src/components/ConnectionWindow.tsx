import { useTheme } from '../theme.ts'
import { useEffect, useRef, useState } from 'react'
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
  const [loadError, setLoadError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const fieldsLoaded = useRef(false)

  useEffect(() => {
    let active = true
    const reload = () => {
      void api.getSettings().then(s => {
        if (!active) return
        // The first success can follow a failed load and a focus/settings refresh.
        // Later refreshes update status without replacing unsaved form fields.
        if (!fieldsLoaded.current) {
          fieldsLoaded.current = true
          setServerUrl(s.serverUrl)
          setUsername(s.username)
        }
        setInitial(s)
        setLoadError(null)
      }).catch(e => { if (active) setLoadError(String(e.message ?? e)) })
    }
    reload()
    const offSettings = api.onSettingsChanged(reload)
    window.addEventListener('focus', reload)
    return () => {
      active = false
      offSettings()
      window.removeEventListener('focus', reload)
    }
  }, [])

  async function save() {
    setBusy(true)
    setStatus(null)
    setLoadError(null)
    setDone(false)
    try {
      const current = await api.getSettings()
      await api.saveSettings({ ...current, serverUrl, username, password: password || undefined })
      setInitial(await api.getSettings())
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

  if (!initial) return loadError ? <main className="app connection"><section className="panel settings" role="alert">
    <h2>Gerrit connection</h2><p className="status error">Settings could not be loaded. A failed password cleanup keeps the saved file unchanged.</p><p>{loadError}</p>
  </section></main> : null
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
          Generate an HTTP password in Gerrit under Settings, HTTP Credentials.
          {initial.passwordStorage === 'session'
            ? ' The current password is kept in memory only. Enter it again after the app or browser server restarts.'
            : initial.passwordStorage === 'environment'
              ? ' The password comes from the server environment and is never saved by this app.'
              : initial.encrypted
                ? ' New passwords are encrypted with the OS keychain.'
                : ' Secure storage is unavailable. New passwords are kept in memory only. Enter them again after the app or browser server restarts.'}
        </p>
        {initial.passwordStorage === 'locked' && <p className="status error" role="status">The saved password cannot be read. Its saved copy was kept. Unlock the OS keychain or enter a password for this session.</p>}
        {initial.retainedPasswordStored && <p className="status" role="status">A secure saved password for another connection is kept on disk. It will not be used for this connection.</p>}
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
        {loadError && <p className="status error" role="alert">Settings could not be loaded: {loadError}</p>}
        {status && <p className={'status ' + (ok ? 'ok' : 'error')}>{status}</p>}
        {done && isBrowserMode && <p className="muted small">The board reloads when you go back to its tab. You can close this one.</p>}
      </form>
    </div>
  )
}
