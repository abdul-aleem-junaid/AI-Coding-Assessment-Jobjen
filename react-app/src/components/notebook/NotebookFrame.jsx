// src/components/notebook/NotebookFrame.jsx
//
// Renders the JupyterLite application inside an iframe.
// Notifies the parent when the iframe's inner window gains / loses focus
// so the assessment blur-overlay can react.

import { useRef } from 'react'
import { registerNotebookWindow } from '../../lib/notebookExport'

export default function NotebookFrame({ onBlur, onFocus }) {
  const iframeRef = useRef(null)

  const handleLoad = () => {
    try {
      const win = iframeRef.current?.contentWindow
      if (!win) return
      // Expose the iframe window to the notebook-export bridge (parent side).
      registerNotebookWindow(win)
      win.addEventListener('blur',  () => { if (!document.hasFocus()) onBlur?.() })
      win.addEventListener('focus', () => onFocus?.())
    } catch {
      // Cross-origin frames will throw — safe to ignore
    }
  }

  return (
    <iframe
      ref={iframeRef}
      src="./lab/lab/index.html"
      title="Coding Assessment"
      className="w-full h-full border-none block"
      onLoad={handleLoad}
    />
  )
}
