import { useEffect, useMemo, useRef, useState } from 'react'
import type { AppWindowContext, SettingsStatus } from '../../../shared/types.ts'
import { api } from '../api.ts'
import { SettingsContext } from '../settings-context.ts'
import { useTheme } from '../theme.ts'
import { newerSettings } from '../preference-state.ts'
import { LocalReview, type LocalReviewHandle } from './LocalReview.tsx'

export function ReviewWindow({ context }: { context: Extract<AppWindowContext, { kind: 'review' }> }) {
  const [settings, setSettings] = useState<SettingsStatus | null>(null)
  const [error, setError] = useState(context.error ?? '')
  const viewer = useRef<LocalReviewHandle>(null)
  useTheme(settings?.theme)
  useEffect(() => { document.title = `#${context.link?.id ?? ''} ${context.subject ?? 'Review'}` }, [context.link?.id, context.subject])
  useEffect(() => {
    let active = true
    const reload = () => void api.getSettings().then(saved => { if (active) setSettings(previous => newerSettings(previous, saved)) }).catch(error => { if (active) setError(error.message) })
    const offSettings = api.onSettingsChanged(reload)
    const offConnection = api.onConnectionChanged(() => {
      void api.getWindowContext?.().then(current => {
        if (active && current.kind === 'review' && current.error?.startsWith('Connection changed')) setError('Connection changed. Close and reopen this review. Unsaved text is kept here.')
      }).catch(reason => { if (active) setError(reason.message) })
    })
    const offClose = api.onReviewCloseRequested?.(token => api.replyReviewClose?.(token, viewer.current?.canClose() !== false))
    reload()
    return () => { active = false; offSettings(); offConnection(); offClose?.() }
  }, [])
  const handle = useMemo(() => ({ settings, save: async (patch: Parameters<NonNullable<typeof api.patchSettings>>[0]) => {
    if (!api.patchSettings) throw new Error('Settings are unavailable')
    const saved = await api.patchSettings(patch)
    setSettings(previous => newerSettings(previous, saved))
  } }), [settings])
  if (!context.link || !context.subject || context.error) return <main className="app connection"><section className="panel" role="alert"><h2>Could not open review</h2><p>{error || 'The review context is unavailable.'}</p><button className="btn" onClick={() => void api.closeReviewWindow?.()}>Close review</button></section></main>
  return <SettingsContext.Provider value={handle}>
    {settings && <LocalReview separate ref={viewer} link={context.link} subject={context.subject} navigationError={error} blocked={error.startsWith('Connection changed')} onClose={() => void api.closeReviewWindow?.()} onMutate={write => write()} />}
  </SettingsContext.Provider>
}
