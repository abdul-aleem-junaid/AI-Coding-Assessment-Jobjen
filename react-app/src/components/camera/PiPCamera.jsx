// src/components/camera/PiPCamera.jsx
//
// Draggable Picture-in-Picture camera feed.
// Renders a mirrored <video> that shows the candidate's webcam stream.
// The feed can be dragged anywhere on screen via mouse or touch.

import { useRef, useEffect, useState } from 'react'

export default function PiPCamera({ streamRef }) {
  const videoRef = useRef(null)
  const pipRef   = useRef(null)
  const drag     = useRef({ active: false, startMouseX: 0, startMouseY: 0, startElemX: 0, startElemY: 0 })
  const [pipPos, setPipPos] = useState(null)

  // Attach the media stream to the video element on mount
  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current
    }
  }, [])

  // Global mouse / touch move + up handlers for drag tracking
  useEffect(() => {
    const onMove = (clientX, clientY) => {
      if (!drag.current.active) return
      const pip  = pipRef.current
      const maxX = window.innerWidth  - pip.offsetWidth
      const maxY = window.innerHeight - pip.offsetHeight
      setPipPos({
        x: Math.max(0, Math.min(maxX, drag.current.startElemX + clientX - drag.current.startMouseX)),
        y: Math.max(0, Math.min(maxY, drag.current.startElemY + clientY - drag.current.startMouseY)),
      })
    }

    const onMouseMove = (e) => onMove(e.clientX, e.clientY)
    const onTouchMove = (e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY) }
    const onUp        = () => { drag.current.active = false }

    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onUp)
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('touchend',  onUp)

    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onUp)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend',  onUp)
    }
  }, [])

  const startDrag = (clientX, clientY) => {
    const rect = pipRef.current.getBoundingClientRect()
    drag.current = { active: true, startMouseX: clientX, startMouseY: clientY, startElemX: rect.left, startElemY: rect.top }
  }

  return (
    <div
      ref={pipRef}
      className="fixed bottom-4 right-4 w-[200px] h-[140px] bg-jobjen-panel rounded-xl overflow-hidden z-[1000] shadow-[0_4px_20px_rgba(0,0,0,0.5)] border-2 border-jobjen-border cursor-grab active:cursor-grabbing select-none touch-none"
      style={pipPos ? { left: pipPos.x, top: pipPos.y, right: 'auto', bottom: 'auto' } : undefined}
      onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY) }}
      onTouchStart={(e) => startDrag(e.touches[0].clientX, e.touches[0].clientY)}
    >
      <video
        ref={videoRef}
        autoPlay muted playsInline
        className="w-full h-full object-cover block"
        style={{ transform: 'scaleX(-1)' }}
      />
    </div>
  )
}
