// src/pages/AssessmentPage.jsx
//
// Route: "/assessment"
// Full-screen assessment layout: a thin top toolbar (task + submit), the
// JupyterLite notebook iframe, the AI chat panel, and a draggable PiP camera.
// On mount it starts the screen+mic recording (streamed to S3); on Submit it
// finalizes the recording, uploads all workspace notebooks, and submits.

import { useState, useEffect, useRef } from 'react'
import Markdown from 'react-markdown'
import ChatPanel      from '../components/chat/ChatPanel'
import NotebookFrame  from '../components/notebook/NotebookFrame'
import PiPCamera      from '../components/camera/PiPCamera'
import { useSession, getSession } from '../lib/session'
import { ScreenRecorder } from '../lib/screenRecorder'
import { exportAndUploadNotebooks } from '../lib/notebookExport'
import { importQuestionFiles } from '../lib/notebookImport'
import api from '../lib/api'

const ChatBubbleIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
)

const SUBMIT_LABELS = {
  recording: 'Finalizing your screen recording…',
  notebooks: 'Uploading your solution files…',
  finalizing: 'Submitting your assessment…',
}

export default function AssessmentPage({ streamRef, screenStreamRef }) {
  const session = useSession()
  const [chatOpen, setChatOpen] = useState(true)
  const [blurred,  setBlurred]  = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [phase, setPhase] = useState('active') // active | submitting | done
  const [submitStep, setSubmitStep] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [recWarning, setRecWarning] = useState('')

  const recorderRef = useRef(null)
  const importedRef = useRef(false)

  // Seed the question's attachment files into the JupyterLite workspace once, so
  // the candidate sees them directly (the primary file auto-opens).
  useEffect(() => {
    if (importedRef.current) return
    const files = getSession().question?.files
    if (!files || files.length === 0) return
    importedRef.current = true
    importQuestionFiles(files, { open: true }).catch((err) => {
      console.error('[assessment] file import failed:', err)
      setRecWarning((w) => w || 'Some task files could not be loaded into the notebook. You can still download them from "View Task".')
    })
  }, [])

  // Start the screen+mic recording once, on mount.
  useEffect(() => {
    let cancelled = false
    // Guard against React StrictMode's double-invoke (dev) starting two recorders.
    if (recorderRef.current) return
    const { sessionId } = getSession()
    const screen = screenStreamRef.current
    const mic = streamRef.current
    if (!sessionId || !screen || !mic) return

    const recorder = new ScreenRecorder({ sessionId, screenStream: screen, micStream: mic })
    recorderRef.current = recorder
    recorder.start().catch((err) => {
      if (cancelled) return
      console.error('[assessment] recording failed to start:', err)
      setRecWarning('Screen recording could not start. You can still complete and submit the assessment.')
    })
    return () => { cancelled = true }
  }, [streamRef, screenStreamRef])

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

  const handleSubmit = async () => {
    if (phase === 'submitting') return
    const ok = window.confirm('Submit your assessment? You will not be able to make further changes.')
    if (!ok) return

    const { sessionId } = getSession()
    setPhase('submitting')
    setSubmitError('')

    let durationSec = 0
    // 1. Finalize the recording (best-effort — the backend assembles whatever
    //    parts landed even if the tail upload fails).
    setSubmitStep('recording')
    try {
      const r = await recorderRef.current?.stop()
      durationSec = r?.durationSec ?? 0
    } catch (err) {
      console.error('[assessment] recording finalize failed:', err)
    }

    // 2. Export + upload all workspace notebooks (the core deliverable).
    setSubmitStep('notebooks')
    try {
      await exportAndUploadNotebooks(sessionId)
    } catch (err) {
      console.error('[assessment] notebook upload failed:', err)
      setSubmitError('We could not upload your solution files. Please try submitting again.')
      setPhase('active')
      setSubmitStep('')
      return
    }

    // 3. Mark the session submitted (locks the invite, queues transcode).
    setSubmitStep('finalizing')
    try {
      await api.post('/technical/submit', { sessionId, durationSec })
    } catch (err) {
      console.error('[assessment] submit failed:', err)
      setSubmitError('Submission failed. Please try again.')
      setPhase('active')
      setSubmitStep('')
      return
    }

    // Stop the webcam too — we're done.
    streamRef.current?.getTracks().forEach((t) => t.stop())
    setPhase('done')
  }

  // ── Terminal "submitted" screen ────────────────────────────────────────
  if (phase === 'done') {
    return (
      <div className="jobjen-hero w-screen h-screen flex flex-col items-center justify-center gap-4 font-sans px-6">
        <span className="jobjen-badge text-[0.7rem] font-bold tracking-[0.12em] px-3 py-1 rounded-sm">Jobjen</span>
        <h1 className="text-[2rem] font-bold text-jobjen-text text-center">Assessment submitted</h1>
        <p className="text-base text-jobjen-muted max-w-[460px] text-center leading-relaxed">
          Thank you{session.candidateName ? `, ${session.candidateName}` : ''}. Your screen
          recording and solution files have been received. You can close this tab.
        </p>
      </div>
    )
  }

  const question = session.question

  return (
    <div className="w-screen h-screen flex flex-col">
      {/* Top toolbar */}
      <header className="h-12 shrink-0 flex items-center gap-3 px-4 bg-jobjen-panel border-b border-jobjen-border">
        <span className="jobjen-badge text-[0.62rem] font-bold tracking-[0.12em] px-2.5 py-0.5 rounded-sm">Jobjen</span>
        <span className="text-sm font-semibold text-jobjen-text truncate">
          Technical Round{session.candidateName ? ` — ${session.candidateName}` : ''}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setTaskOpen(true)}
            className="jobjen-btn-secondary px-3.5 py-1.5 text-xs font-semibold rounded-md"
          >
            View Task
          </button>
          <button
            onClick={handleSubmit}
            disabled={phase === 'submitting'}
            className="jobjen-btn-success px-4 py-1.5 text-xs font-semibold rounded-md disabled:opacity-60"
          >
            Submit Assessment
          </button>
        </div>
      </header>

      {recWarning && (
        <div className="shrink-0 bg-amber-900/40 text-amber-200 text-xs px-4 py-1.5 text-center">
          {recWarning}
        </div>
      )}

      <div className="flex-1 min-h-0 flex">
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

      {/* Task modal */}
      {taskOpen && (
        <div
          className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center p-6"
          onClick={() => setTaskOpen(false)}
        >
          <div
            className="bg-jobjen-surface border border-jobjen-border rounded-2xl max-w-[760px] w-full max-h-[80vh] overflow-y-auto p-7 font-sans"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3 mb-4">
              <h2 className="text-xl font-bold text-jobjen-text">
                {question?.name ?? 'Your Task'}
              </h2>
              <button
                onClick={() => setTaskOpen(false)}
                className="ml-auto text-jobjen-subtle hover:text-jobjen-text text-2xl leading-none"
              >
                ×
              </button>
            </div>
            {question?.timeLimit > 0 && (
              <p className="text-xs text-jobjen-subtle mb-4">
                Suggested time: {question.timeLimit} minutes
              </p>
            )}
            <div className="prose prose-invert prose-sm max-w-none text-jobjen-muted">
              <Markdown>{question?.description || 'No description provided.'}</Markdown>
            </div>
            {question?.files?.length > 0 && (
              <div className="mt-5 border-t border-jobjen-border pt-4">
                <p className="text-xs font-semibold text-jobjen-text mb-2 uppercase tracking-wide">
                  Attachments
                </p>
                <ul className="flex flex-col gap-1.5">
                  {question.files.map((f) => (
                    <li key={f.name}>
                      <a
                        href={f.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-jobjen-accent hover:underline"
                      >
                        {f.name}
                      </a>
                      {f.purpose ? <span className="text-jobjen-subtle text-xs"> — {f.purpose}</span> : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Submitting overlay */}
      {phase === 'submitting' && (
        <div className="fixed inset-0 z-[10000] bg-black/70 flex flex-col items-center justify-center gap-4 font-sans">
          <div className="w-10 h-10 border-[3px] border-jobjen-border border-t-jobjen-accent rounded-full animate-spin" />
          <p className="text-jobjen-text text-sm font-semibold">
            {SUBMIT_LABELS[submitStep] ?? 'Submitting…'}
          </p>
          <p className="text-jobjen-subtle text-xs">Please don't close this tab.</p>
        </div>
      )}

      {/* Submit error toast */}
      {submitError && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[10001] bg-red-800 text-white text-sm font-semibold px-5 py-3 rounded-xl shadow-lg font-sans">
          {submitError}
        </div>
      )}
    </div>
  )
}
