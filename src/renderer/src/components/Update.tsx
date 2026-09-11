// Application updates in the UI: a hook for the state the main process pushes
// and a top bar button while an update is available, downloading or ready.
// The words come from ../../../shared/update.ts.
import { useEffect, useState } from 'react'
import type { UpdateState } from '../../../shared/types.ts'
import { updateAction, updateSummary } from '../../../shared/update.ts'
import { api } from '../api.ts'
import { DownloadIcon, RestartIcon } from './Icons.tsx'

/** Updater state pushed from the main process, or null before the first read. */
export function useUpdateState(): UpdateState | null {
  const [state, setState] = useState<UpdateState | null>(null)
  useEffect(() => {
    const off = api.onUpdateState(setState)
    void api.getUpdateState().then((s) => setState((prev) => prev ?? s))
    return off
  }, [])
  return state
}

/** Do what the state calls for next. Failures come back through the pushed state, not as exceptions. */
export async function runUpdateAction(state: UpdateState, confirmInstall = false): Promise<void> {
  try {
    switch (updateAction(state)) {
      case 'check':
        await api.checkForUpdate()
        break
      case 'download':
        await api.downloadUpdate()
        break
      case 'install':
        await api.installUpdate(confirmInstall)
        break
    }
  } catch {
    // The main process records the failure in the state it pushes.
  }
}

function showsUpdate(s: UpdateState): boolean {
  return s.status === 'available' || s.status === 'downloading' || s.status === 'downloaded'
}

/** Top bar button: download, progress ring, then restart. A click on restart asks first. */
export function UpdatePill(props: { state: UpdateState | null }) {
  const s = props.state
  if (!s || !showsUpdate(s)) return null
  const busy = s.status === 'downloading'
  const ready = s.status === 'downloaded'
  const label = busy ? `${Math.floor(s.downloadPercent ?? 0)}%` : ready ? 'Restart to update' : `Update ${s.availableVersion}`
  const summary = updateSummary(s)
  return (
    <button
      className={'btn update' + (ready ? ' ready' : '')}
      disabled={busy}
      title={summary}
      aria-label={summary}
      onClick={() => void runUpdateAction(s, true)}
    >
      {busy ? <ProgressRing percent={s.downloadPercent ?? 0} /> : ready ? <RestartIcon /> : <DownloadIcon />}
      <span>{label}</span>
    </button>
  )
}

function ProgressRing(props: { percent: number }) {
  const r = 6
  const c = 2 * Math.PI * r
  const done = Math.min(100, Math.max(0, props.percent)) / 100
  return (
    <svg className="ring" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r={r} fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - done)}
      />
    </svg>
  )
}
