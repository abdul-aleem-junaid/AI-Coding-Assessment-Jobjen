import { useState, useEffect, useRef } from 'react'
import DisableDevtool from 'disable-devtool'
import './App.css'

function App() {
  const [open, setOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [blurred, setBlurred] = useState(false)
  const triggered = useRef(false)

  const iframeRef = useRef(null)

  const handleIframeLoad = () => {
    try {
      const iframeWin = iframeRef.current?.contentWindow
      if (!iframeWin) return
      // When focus is inside the iframe, the IFRAME's window fires blur/focus —
      // not the parent's. Proxy those events back to our blur state.
      iframeWin.addEventListener('blur', () => {
        setTimeout(() => {
          if (!document.hasFocus()) setBlurred(true)
        }, 0)
      })
      iframeWin.addEventListener('focus', () => setBlurred(false))
    } catch (e) {}
  }

  const handleDevToolsOpen = () => {
    if (triggered.current) return
    triggered.current = true
    setToast(true)
    const iframe = document.querySelector('iframe')
    if (iframe) iframe.src = 'about:blank'
    setTimeout(() => {
      window.location.href = 'https://www.google.com'
    }, 1500)
  }

  useEffect(() => {
    // Expose so the iframe can call back into the parent
    window.__onDevToolsOpen = handleDevToolsOpen

    DisableDevtool({ onDevToolOpen: handleDevToolsOpen })

    return () => { delete window.__onDevToolsOpen }
  }, [])

  useEffect(() => {
    const onBlur = () => {
      setTimeout(() => {
        // document.hasFocus() returns true when focus is anywhere in the
        // document (including inside an iframe) — only false when the user
        // has actually left the tab/window entirely.
        if (document.hasFocus()) return
        setBlurred(true)
      }, 0)
    }
    const onFocus = () => setBlurred(false)
    const onVisibility = () => setBlurred(document.hidden)

    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <>
      {toast && (
        <div className="toast">
          Access Restricted: Developer tools are not allowed.
        </div>
      )}

      {blurred && <div className="blur-overlay" />}

      {open ? (
        <div className="app">
          <iframe
            ref={iframeRef}
            src="./lab/lab/index.html"
            title="JupyterLite"
            className="jupyter-frame"
            onLoad={handleIframeLoad}
          />
        </div>
      ) : (
        <div className="landing">
          <h1>Coding Assessment</h1>
          <p>An interactive coding environment that runs entirely in your browser.</p>
          <button onClick={() => setOpen(true)}>Start Assessment</button>
        </div>
      )}
    </>
  )
}

export default App
