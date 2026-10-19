import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { ConnectionWindow } from './components/ConnectionWindow.tsx'
import './styles.css'
import { workflowColorCss } from '../../shared/workflow-colors.ts'
import { isBrowserMode } from './api.ts'
import { ensureBrowserSession } from './browser-session.ts'
import { useTheme } from './theme.ts'

const stateStyles = document.createElement('style')
stateStyles.textContent = workflowColorCss()
document.head.append(stateStyles)

const root = createRoot(document.getElementById('root')!)
const start = () => root.render(
  <React.StrictMode>
    {/* The connection window loads the same bundle with #connection (GERRIT_GUI_TAB=connection in the main window, for screenshots). */}
    {/connection/.test(window.location.hash) ? <ConnectionWindow /> : <App />}
  </React.StrictMode>,
)

function BrowserSessionError({ message }: { message: string }) {
  useTheme()
  return <main className="app connection"><section className="panel" role="alert">
    <h2>Browser session required</h2><p>{message}</p>
  </section></main>
}

if (isBrowserMode) {
  void ensureBrowserSession().then(start, error => {
    root.render(<BrowserSessionError message={String(error.message ?? error)} />)
  })
} else start()
