import { useState, useEffect, useRef } from 'react'
import ChatPanel from './ChatPanel'

const ChatBubbleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

export default function AssessmentView({ streamRef }) {
  const [chatOpen, setChatOpen] = useState(true)
  const [blurred, setBlurred] = useState(false)
  const [pipPos, setPipPos] = useState(null)

  const iframeRef = useRef(null)
  const pipVideoRef = useRef(null)
  const pipRef = useRef(null)
  const drag = useRef({ active: false, startMouseX: 0, startMouseY: 0, startElemX: 0, startElemY: 0 })

  // Attach stream to PiP video on mount
  useEffect(() => {
    if (pipVideoRef.current && streamRef.current) {
      pipVideoRef.current.srcObject = streamRef.current
    }
  }, [])

  // Tab-switch / window-blur detection
  useEffect(() => {
    const onBlur = () => setTimeout(() => { if (!document.hasFocus()) setBlurred(true) }, 0)
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

  // PiP drag tracking
  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (!drag.current.active) return
      const pip = pipRef.current
      const maxX = window.innerWidth - pip.offsetWidth
      const maxY = window.innerHeight - pip.offsetHeight
      setPipPos({
        x: Math.max(0, Math.min(maxX, drag.current.startElemX + clientX - drag.current.startMouseX)),
        y: Math.max(0, Math.min(maxY, drag.current.startElemY + clientY - drag.current.startMouseY)),
      })
    }
    const onMouseMove = e => onMove(e.clientX, e.clientY)
    const onTouchMove = e => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY) }
    const onUp = () => { drag.current.active = false }
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend', onUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onUp)
    }
  }, [])

  const handleIframeLoad = () => {
    try {
      const iframeWin = iframeRef.current?.contentWindow
      if (!iframeWin) return
      iframeWin.addEventListener('blur', () => {
        setTimeout(() => { if (!document.hasFocus()) setBlurred(true) }, 0)
      })
      iframeWin.addEventListener('focus', () => setBlurred(false))
    } catch {}
  }

  const startDrag = (clientX, clientY) => {
    const rect = pipRef.current.getBoundingClientRect()
    drag.current = { active: true, startMouseX: clientX, startMouseY: clientY, startElemX: rect.left, startElemY: rect.top }
  }

  return (
    <div className="w-screen h-screen flex">

      {/* Blur overlay on tab switch */}
      {blurred && (
        <div className="fixed inset-0 z-[9998] backdrop-blur-[18px] bg-black/25" />
      )}

      {/* JupyterLite iframe — fills remaining space */}
      <div className="h-full min-w-0 flex-1">
        <iframe
          ref={iframeRef}
          src="./lab/lab/index.html"
          title="Coding Assessment"
          className="w-full h-full border-none block"
          onLoad={handleIframeLoad}
        />
      </div>

      {/* AI chat panel — fixed 300 px */}
      {chatOpen && (
        <div className="h-full w-[300px] shrink-0 overflow-hidden">
          <ChatPanel onClose={() => setChatOpen(false)} />
        </div>
      )}

      {/* Reopen tab — right edge when chat is closed */}
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
      <div
        ref={pipRef}
        className="fixed bottom-4 right-4 w-[200px] h-[140px] bg-jobjen-panel rounded-xl overflow-hidden z-[1000] shadow-[0_4px_20px_rgba(0,0,0,0.5)] border-2 border-jobjen-border cursor-grab active:cursor-grabbing select-none touch-none"
        style={pipPos ? { left: pipPos.x, top: pipPos.y, right: 'auto', bottom: 'auto' } : undefined}
        onMouseDown={e => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
        onTouchStart={e => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
      >
        <video
          ref={pipVideoRef}
          autoPlay muted playsInline
          className="w-full h-full object-cover block"
          style={{ transform: 'scaleX(-1)' }}
        />
      </div>
    </div>
  )
}
