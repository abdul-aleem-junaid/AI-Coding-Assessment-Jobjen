// src/pages/AssessmentPage.jsx
//
// Route: "/assessment"
// Full-screen assessment layout: JupyterLite notebook iframe on the left,
// AI chat panel on the right, and a draggable PiP camera feed.
// Tab-switch / window-blur detection blurs the UI to deter cheating.

import { useState, useEffect, useRef } from 'react'
import ChatPanel      from '../components/chat/ChatPanel'
import NotebookFrame  from '../components/notebook/NotebookFrame'
import PiPCamera      from '../components/camera/PiPCamera'

// ── Icon ─────────────────────────────────────────────────────────────────────
const ChatBubbleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

// ── Component ────────────────────────────────────────────────────────────────
export default function AssessmentPage({ streamRef }) {
  const [chatOpen, setChatOpen] = useState(true)
  const [blurred,  setBlurred]  = useState(false)

  // Tab-switch / window-blur detection
  useEffect(() => {
    const onBlur       = () => setTimeout(() => { if (!document.hasFocus()) setBlurred(true) }, 0)
    const onFocus      = () => setBlurred(false)
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
    <div className="w-screen h-screen flex">

      {/* Blur overlay on tab switch */}
      {blurred && (
        <div className="fixed inset-0 z-[9998] backdrop-blur-[18px] bg-black/25" />
      )}

      {/* JupyterLite iframe — fills remaining space */}
      <div className="h-full min-w-0 flex-1">
        <NotebookFrame onBlur={() => setBlurred(true)} onFocus={() => setBlurred(false)} />
      </div>

      {/* AI chat panel — fixed 300 px */}
      {chatOpen && (
        <div className="h-full w-[300px] shrink-0 overflow-hidden">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* Reopen button — right edge when chat is closed */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          title="Open AI Assistant"
          className="fixed right-0 top-1/2 -translate-y-1/2 z-[999] flex flex-col items-center gap-1.5 bg-jobjen-panel border border-r-0 border-jobjen-border rounded-l-xl py-5 px-2.5 text-jobjen-subtle hover:text-jobjen-text hover:border-jobjen-accent transition-colors duration-150 cursor-pointer"
        >
          <ChatBubbleIcon />
          <span className="text-[0.58rem] font-bold tracking-widest uppercase [writing-mode:vertical-rl] rotate-180">AI</span>
        </button>
      )}

      {/* Draggable PiP camera */}
      <PiPCamera streamRef={streamRef} />
    </div>
  )
}
