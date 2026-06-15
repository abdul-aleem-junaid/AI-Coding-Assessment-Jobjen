// src/utils/devtoolsGuard.js
//
// Manages DevTools detection for the assessment page.
// Uses the `disable-devtool` library and bridges events to React via a
// registered toast callback.
//
// Usage:
//   initDevToolsGuard()        — call once at app startup (main.jsx)
//   setDevToolsGuardActive()   — enable/disable based on current route
//   registerDevToolsToast()    — pass a React state setter to show the toast
//   reportDevToolsOpen()       — called by the JupyterLite iframe too

import DisableDevtool from 'disable-devtool'

const REDIRECT_URL      = 'https://www.google.com'
const REDIRECT_DELAY_MS = 1500

let guardActive   = false
let triggered     = false
let redirectTimer = null
let onToast       = null

function blankIframe() {
  const iframe = document.querySelector('iframe')
  if (iframe) iframe.src = 'about:blank'
}

function scheduleRedirect() {
  if (redirectTimer) return
  redirectTimer = setTimeout(() => {
    window.location.replace(REDIRECT_URL)
  }, REDIRECT_DELAY_MS)
}

/** Called when DevTools is actually opened (not just keyboard shortcuts). */
export function reportDevToolsOpen() {
  if (!guardActive || triggered) return
  triggered = true
  onToast?.()
  blankIframe()
  scheduleRedirect()
}

export function isDevToolsTriggered() {
  return triggered
}

/** Enable detection + redirect on the assessment page; suspend elsewhere. */
export function setDevToolsGuardActive(active) {
  guardActive = active
  if (initialized) {
    DisableDevtool.isSuspend = !active
  }
}

export function registerDevToolsToast(fn) {
  onToast = fn
}

let initialized = false

export function initDevToolsGuard() {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  // Allow the JupyterLite iframe to trigger this via window.parent.__onDevToolsOpen
  window.__onDevToolsOpen = reportDevToolsOpen

  const result = DisableDevtool({
    onDevtoolOpen: () => reportDevToolsOpen(),
    disableMenu: false,
    clearIntervalWhenDevOpenTrigger: true,
  })

  // Start suspended — only activate when guard is enabled for the route
  DisableDevtool.isSuspend = true

  if (!result.success && result.reason !== 'already running') {
    console.warn('[devtools-guard] failed to start:', result.reason)
  }
}
