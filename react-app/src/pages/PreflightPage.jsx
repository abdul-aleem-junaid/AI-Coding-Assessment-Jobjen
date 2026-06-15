// src/pages/PreflightPage.jsx
//
// Route: "/preflight"
// Camera + microphone permission check and rules display before the assessment
// begins. On success, calls onBegin() to navigate to /assessment.

import { useState, useEffect, useRef } from 'react'

// ── Constants ────────────────────────────────────────────────────────────────
const RULES = [
  'Do not open DevTools, browser console, or use inspect element at any time.',
  'Do not switch tabs, open new windows, or leave this page during the assessment.',
  'Keep your face clearly visible in the camera throughout the entire session.',
  'Do not seek assistance from other people or use any unauthorised resources.',
  'Your camera feed and on-screen activity are monitored for the full duration.',
]

const BAR_HEIGHTS = [10, 16, 22, 30, 26, 20, 14, 18, 28, 32, 24, 18, 12, 20, 28, 32, 24, 16, 10, 16]

// ── Icons ────────────────────────────────────────────────────────────────────
const CameraIcon = () => (
  <svg width="52" height="40" viewBox="0 0 52 40" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="2" y="10" width="48" height="28" rx="5" />
    <circle cx="26" cy="24" r="9" />
    <path d="M18 10V8a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
  </svg>
)

const MicIcon = () => (
  <svg width="14" height="22" viewBox="0 0 14 22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="1" width="8" height="12" rx="4" />
    <path d="M1 9a6 6 0 0 0 12 0" />
    <line x1="7" y1="15" x2="7" y2="21" />
    <line x1="4" y1="21" x2="10" y2="21" />
  </svg>
)

// ── Component ────────────────────────────────────────────────────────────────
export default function PreflightPage({ streamRef, onBegin }) {
  const [permission, setPermission] = useState('idle') // idle | requesting | granted | denied
  const [micLevel, setMicLevel]     = useState(0)

  const preflightVideoRef = useRef(null)
  const audioCtxRef       = useRef(null)
  const animFrameRef      = useRef(null)

  // Attach stream to video element once permission is granted
  useEffect(() => {
    if (permission === 'granted' && preflightVideoRef.current && streamRef.current) {
      preflightVideoRef.current.srcObject = streamRef.current
    }
  }, [permission])

  // Cleanup AudioContext and animation frame on unmount
  useEffect(() => {
    return () => {
      cancelAnimationFrame(animFrameRef.current)
      audioCtxRef.current?.close()
    }
  }, [])

  const startMicMeter = (stream) => {
    const ctx     = new AudioContext()
    audioCtxRef.current = ctx
    const source  = ctx.createMediaStreamSource(stream)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 256
    source.connect(analyser)
    const data = new Uint8Array(analyser.frequencyBinCount)
    const tick = () => {
      analyser.getByteFrequencyData(data)
      const avg = data.reduce((s, v) => s + v, 0) / data.length
      setMicLevel(Math.min(100, avg * 2.5))
      animFrameRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const requestPermissions = async () => {
    setPermission('requesting')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      streamRef.current = stream
      setPermission('granted')
      startMicMeter(stream)
    } catch {
      setPermission('denied')
    }
  }

  const activeBarCount = Math.round((micLevel / 100) * BAR_HEIGHTS.length)

  return (
    <div className="w-screen h-screen flex font-sans">

      {/* ── Left: camera preview ──────────────────────────────────────── */}
      <div className="w-[45%] bg-jobjen-panel flex flex-col p-7 gap-3.5">
        <p className="text-jobjen-subtle text-[0.7rem] font-semibold tracking-[0.1em] uppercase">
          Camera Preview
        </p>
        <div className="relative flex-1 bg-jobjen-surface rounded-xl overflow-hidden">
          <video
            ref={preflightVideoRef}
            autoPlay muted playsInline
            className="w-full h-full object-cover block"
            style={{ transform: 'scaleX(-1)' }}
          />
          {permission !== 'granted' && (
            <div className={`absolute inset-0 flex flex-col items-center justify-center gap-4 bg-jobjen-surface p-8 text-center text-sm leading-relaxed ${permission === 'denied' ? 'text-red-400' : 'text-jobjen-subtle'}`}>
              <CameraIcon />
              <p>
                {permission === 'denied'
                  ? 'Access denied. Allow camera & microphone in your browser settings and reload the page.'
                  : 'Your camera preview will appear here.'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Right: rules + action ─────────────────────────────────────── */}
      <div className="w-[55%] bg-jobjen-bg flex flex-col px-11 py-12 overflow-y-auto gap-7">

        <div className="flex flex-col gap-2.5">
          <span className="jobjen-badge text-[0.7rem] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-sm w-fit">
            Jobjen
          </span>
          <h2 className="text-[1.75rem] font-bold text-jobjen-text">Before You Begin</h2>
          <p className="text-sm text-jobjen-muted leading-relaxed">
            Please read the rules below carefully. Camera and microphone access is required to start the assessment.
          </p>
        </div>

        <ol className="list-none flex flex-col gap-3.5">
          {RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-3.5 text-sm text-jobjen-muted leading-[1.55]">
              <span className="shrink-0 w-6 h-6 bg-jobjen-accent text-jobjen-text rounded-full flex items-center justify-center text-[0.7rem] font-bold mt-0.5">
                {i + 1}
              </span>
              <span>{rule}</span>
            </li>
          ))}
        </ol>

        {/* Microphone level meter */}
        {permission === 'granted' && (
          <div className="bg-jobjen-surface border border-jobjen-border rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2.5 text-jobjen-muted">
              <MicIcon />
              <span className="text-xs font-semibold text-jobjen-text tracking-wide">Microphone Test</span>
              <span className={`ml-auto text-xs ${micLevel > 10 ? 'text-jobjen-accent font-semibold' : 'text-jobjen-subtle'}`}>
                {micLevel > 10 ? 'Working' : 'Speak to test…'}
              </span>
            </div>
            <div className="flex items-center gap-[3px] h-9">
              {BAR_HEIGHTS.map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm transition-colors duration-75"
                  style={{
                    height: `${h}px`,
                    background: i < activeBarCount
                      ? i < activeBarCount * 0.6 ? 'var(--accent-magenta)' : 'var(--accent-purple)'
                      : 'var(--border-subtle)',
                  }}
                />
              ))}
            </div>
          </div>
        )}

        {/* CTA buttons */}
        <div className="mt-auto pt-6 border-t border-jobjen-border">
          {permission === 'idle' && (
            <button onClick={requestPermissions} className="jobjen-btn-primary w-full py-3.5 px-8 text-base font-semibold rounded-xl">
              Allow Camera &amp; Microphone
            </button>
          )}
          {permission === 'requesting' && (
            <button disabled className="jobjen-btn-primary w-full py-3.5 px-8 text-base font-semibold rounded-xl">
              Requesting access…
            </button>
          )}
          {permission === 'granted' && (
            <button onClick={onBegin} className="jobjen-btn-success w-full py-3.5 px-8 text-base font-semibold rounded-xl">
              Begin Assessment
            </button>
          )}
          {permission === 'denied' && (
            <button disabled className="jobjen-btn-primary w-full py-3.5 px-8 text-base font-semibold rounded-xl">
              Camera Access Required
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
