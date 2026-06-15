import DisableDevtool from 'disable-devtool'

const REDIRECT_URL = 'https://www.google.com'
const REDIRECT_DELAY_MS = 1500

/** Only redirect when the candidate is on the assessment page. */
let guardActive = false
let triggered = false
let redirectTimer = null
let onToast = null

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

/** Called when DevTools is actually opened (not keyboard shortcuts). */
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

/** Enable detection + redirect on assessment; suspend everywhere else. */
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

  window.__onDevToolsOpen = reportDevToolsOpen

  const result = DisableDevtool({
    onDevtoolOpen: () => reportDevToolsOpen(),
    disableMenu: false,
    clearIntervalWhenDevOpenTrigger: true,
  })

  DisableDevtool.isSuspend = true

  if (!result.success && result.reason !== 'already running') {
    console.warn('[devtools-guard] failed to start:', result.reason)
  }
}
