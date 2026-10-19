// Only the startup link carries the bootstrap key. Remove it before any API
// request and never store it in localStorage, sessionStorage, or a cookie.
const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.hash.slice(1)) : new URLSearchParams()
const bootstrapKey = params.get('browser-key')
if (bootstrapKey !== null) {
  params.delete('browser-key')
  const hash = params.toString()
  window.history.replaceState(null, '', window.location.pathname + window.location.search + (hash ? `#${hash}` : ''))
}

let ready: Promise<void> | undefined

export function ensureBrowserSession(): Promise<void> {
  return ready ??= (async () => {
    const response = await fetch(bootstrapKey === null ? '/api/getSettings' : '/api/session', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(bootstrapKey === null ? [] : [bootstrapKey]),
    })
    if (!response.ok) {
      const body = await response.json() as { error?: string }
      throw new Error(body.error ?? 'Browser session failed')
    }
  })()
}
