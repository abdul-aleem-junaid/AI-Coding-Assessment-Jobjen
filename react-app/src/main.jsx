// src/main.jsx — Application entry point
//
// Bootstraps the React tree, router, and DevTools guard.
// Keep this file as thin as possible; logic lives in app/App.jsx.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'

import { initDevToolsGuard } from './utils/devtoolsGuard'
import { initSessionFromUrl } from './lib/session'
import './styles/index.css'
import App from './app/App.jsx'

// Capture the magic-link token (?token=...&round=technical) before React renders
// and before HashRouter rewrites the URL. The query string precedes the `#`.
initSessionFromUrl()

// Initialise the DevTools guard before React renders
initDevToolsGuard()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)
