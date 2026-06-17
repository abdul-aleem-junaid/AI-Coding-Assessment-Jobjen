// src/pages/AssessmentPage.jsx
//
// Route: "/assessment"
// Full-screen assessment layout: a thin top toolbar (submit), the
// JupyterLite notebook iframe, the AI chat panel, and a draggable PiP camera.
// On mount it starts the screen+mic recording (streamed to S3); on Submit it
// finalizes the recording, uploads all workspace notebooks, and submits.

import { useState, useEffect, useRef } from 'react'
import ChatPanel      from '../components/chat/ChatPanel'
import NotebookFrame  from '../components/notebook/NotebookFrame'
import PiPCamera      from '../components/camera/PiPCamera'
import { useSession, getSession } from '../lib/session'
import { ScreenRecorder, acquireScreenStream } from '../lib/screenRecorder'
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
  const [phase, setPhase] = useState('active') // active | submitting | done
  const [submitStep, setSubmitStep] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [recWarning, setRecWarning] = useState('')
  const [recordingDown, setRecordingDown] = useState('') // '' = healthy; else a reason
  const [reSharing, setReSharing] = useState(false)
  const [reshareError, setReshareError] = useState('')

  const recorderRef = useRef(null)
  const startedRef = useRef(false)
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
      setRecWarning((w) => w || 'Some task files could not be loaded into the notebook automatically. Please contact your recruiter if any files are missing.')
    })
  }, [])

  // Create a recorder for a screen stream and start it. Shared by the initial
  // mount and the re-share recovery. onLost fires if the candidate ends the
  // screen share (browser "Stop sharing" pill) or the recorder dies — we then
  // block the assessment and force a re-share, never continuing unrecorded.
  const startRecording = async (screenStream) => {
    const { sessionId } = getSession()
    if (!sessionId || !screenStream) throw new Error('Missing session or screen stream')
    const recorder = new ScreenRecorder({
      sessionId,
      screenStream,
      micStream: streamRef.current,
      onLost: () => setRecordingDown('screen-share-stopped'),
    })
    recorderRef.current = recorder
    await recorder.start()
  }

  // Start the screen+mic recording once, on mount. If it can't start, block the
  // assessment and make the candidate re-share rather than continuing unrecorded.
  useEffect(() => {
    if (startedRef.current) return // guard React StrictMode double-invoke
    const { sessionId } = getSession()
    if (!sessionId || !screenStreamRef.current || !streamRef.current) return
    startedRef.current = true
    startRecording(screenStreamRef.current).catch((err) => {
      console.error('[assessment] recording failed to start:', err)
      setRecordingDown('start-failed')
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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

  // Re-acquire the entire screen and resume recording after a loss / start
  // failure. Triggered by a click (getDisplayMedia needs a user gesture).
  const handleReshare = async () => {
    if (reSharing) return
    setReSharing(true)
    setReshareError('')
    try {
      // Disarm the old (dead) recorder so stopping its tracks can't re-fire the
      // "lost" flow, then acquire a fresh FULL-screen share and resume.
      recorderRef.current?.dispose?.()
      const screen = await acquireScreenStream()
      screenStreamRef.current?.getTracks().forEach((t) => t.stop())
      screenStreamRef.current = screen
      await startRecording(screen)
      setRecordingDown('')
    } catch (err) {
      setReshareError(
        err?.code === 'ENTIRE_SCREEN_REQUIRED'
          ? 'You must share your ENTIRE screen — not a single tab or window.'
          : 'Screen sharing was blocked or cancelled. Please allow it to continue.',
      )
    } finally {
      setReSharing(false)
    }
  }

  const handleSubmit = async () => {
    if (phase === 'submitting') return
    if (recordingDown) {
      setSubmitError('Your screen is not being recorded. Please re-share your entire screen before submitting.')
      return
    }
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

      {/* Recording stopped / failed — BLOCKING. Recording is mandatory, so the
          candidate cannot continue or submit until they re-share their screen. */}
      {recordingDown && phase !== 'done' && (
        <div className="fixed inset-0 z-[10002] bg-black/85 flex flex-col items-center justify-center gap-5 font-sans px-6 text-center">
          <h2 className="text-[1.5rem] font-bold text-jobjen-text">
            Screen recording stopped
          </h2>
          <p className="text-sm text-jobjen-muted max-w-[460px] leading-relaxed">
            Your entire screen must be shared and recorded for the whole
            assessment.{' '}
            {recordingDown === 'start-failed'
              ? 'We could not start the recording.'
              : 'The screen share was stopped.'}{' '}
            Please re-share your <strong>entire screen</strong> to continue —
            your progress is safe.
          </p>
          <button
            onClick={handleReshare}
            disabled={reSharing}
            className="jobjen-btn-success px-6 py-3 text-sm font-semibold rounded-xl disabled:opacity-60"
          >
            {reSharing ? 'Waiting for screen share…' : 'Re-share my screen & resume'}
          </button>
          {reshareError && (
            <p className="text-red-400 text-xs max-w-[440px] leading-relaxed">
              {reshareError}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
