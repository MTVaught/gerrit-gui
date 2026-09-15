import React from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { ConnectionWindow } from './components/ConnectionWindow.tsx'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* The connection window loads the same bundle with #connection (GERRIT_GUI_TAB=connection in the main window, for screenshots). */}
    {/connection/.test(window.location.hash) ? <ConnectionWindow /> : <App />}
  </React.StrictMode>,
)
