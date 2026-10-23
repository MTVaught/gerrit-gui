import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { ConnectionWindow } from './components/ConnectionWindow.tsx'
import './styles.css'
import { workflowColorCss } from '../../shared/workflow-colors.ts'
import { api, isBrowserMode } from './api.ts'
import { ensureBrowserSession } from './browser-session.ts'
import { ReviewWindow } from './components/ReviewWindow.tsx'
import { useTheme } from './theme.ts'

const stateStyles = document.createElement('style')
stateStyles.textContent = workflowColorCss()
document.head.append(stateStyles)

const root = createRoot(document.getElementById('root')!)
const start = async () => {
  // The registered native role is authoritative; changing the hash cannot mount a board.
  const context = await api.getWindowContext?.()
  root.render(<React.StrictMode>{context?.kind === 'review'
    ? <ReviewWindow context={context} />
    : context?.kind === 'connection' || !context && /connection/.test(window.location.hash)
      ? <ConnectionWindow /> : <App />}</React.StrictMode>)
}

function BrowserSessionError({ message }: { message: string }) {
  useTheme()
  return <main className="app connection"><section className="panel" role="alert">
    <h2>{isBrowserMode ? 'Browser session required' : 'Could not open application'}</h2><p>{message}</p>
  </section></main>
}

if (isBrowserMode) {
  void ensureBrowserSession().then(start, error => {
    root.render(<BrowserSessionError message={String(error.message ?? error)} />)
  })
} else void start().catch(error => root.render(<BrowserSessionError message={String(error.message ?? error)} />))
