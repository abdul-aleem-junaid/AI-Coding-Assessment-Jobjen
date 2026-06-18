// src/pages/AssessmentPage.jsx
//
// Route: "/assessment"
// Full-screen assessment layout: a thin top toolbar (submit), the
// JupyterLite notebook iframe, the AI chat panel, and a draggable PiP camera.
// On mount it starts the screen+mic recording (streamed to S3); on Submit it
// finalizes the recording, uploads all workspace notebooks, and submits.

import { useState, useEffect, useRef, useMemo } from 'react'
import ChatPanel      from '../components/chat/ChatPanel'
import NotebookFrame  from '../components/notebook/NotebookFrame'
import PiPCamera      from '../components/camera/PiPCamera'
import { useSession, getSession } from '../lib/session'
import { ScreenRecorder, acquireScreenStream } from '../lib/screenRecorder'
import { exportAndUploadNotebooks } from '../lib/notebookExport'
import { importQuestionFiles, resetWorkspace } from '../lib/notebookImport'
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

/** mm:ss for the countdown pill. */
function formatRemaining(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
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
  const autoSubmittedRef = useRef(false)
  // Capture the recording duration ONCE, on the first stop() (L4). A failed
  // submit drops back to 'active'; on the retry the recorder is already stopped
  // and returns 0, which would otherwise overwrite the real duration with 0.
  const durationRef = useRef(0)

  // Absolute deadline (ms) from the server; 0 = no time limit. Recomputed only
  // when the server value changes, so close/reopen keeps the same deadline.
  const deadlineMs = useMemo(() => {
    const t = session.deadlineAt ? new Date(session.deadlineAt).getTime() : 0
    return Number.isFinite(t) && t > 0 ? t : 0
  }, [session.deadlineAt])
  const [remainingMs, setRemainingMs] = useState(() =>
    deadlineMs ? Math.max(0, deadlineMs - Date.now()) : 0,
  )

  // Seed the question's attachment files into the JupyterLite workspace, so the
  // candidate sees them directly (the primary file auto-opens).
  //
  // The workspace is browser-IndexedDB-backed and shared across EVERY assessment
  // opened in this browser (it is not scoped per candidate/session). So we gate
  // on a persistent marker: when this is a NEW session (the stored owner differs
  // from the current sessionId), wipe the workspace first so a previous
  // question's files can't leak in, then import. When it's the SAME session (a
  // genuine resume after a reload), we touch nothing — keeping the candidate's
  // in-progress edits and avoiding re-importing the pristine files over them.
  useEffect(() => {
    if (importedRef.current) return
    importedRef.current = true

    const { sessionId, question } = getSession()
    const files = question?.files

    const MARKER_KEY = 'jobjen.workspaceOwner'
    let prevOwner = null
    try { prevOwner = localStorage.getItem(MARKER_KEY) } catch { /* storage disabled */ }

    // Without a sessionId we can't tell a new session from a resume; fall back to
    // the plain import (no wipe) rather than risk clobbering an existing one.
    const isResume = !!sessionId && prevOwner === sessionId
    if (isResume) return

    const run = async () => {
      if (sessionId) {
        try {
          await resetWorkspace()
        } catch (err) {
          console.warn('[assessment] workspace reset failed:', err)
        }
        try { localStorage.setItem(MARKER_KEY, sessionId) } catch { /* ignore */ }
      }
      if (files && files.length > 0) {
        await importQuestionFiles(files, { open: true })
      }
    }

    run().catch((err) => {
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

  // Warn before an accidental reload / tab-close while the assessment is still
  // live, so a misclick (Ctrl-R, closing the tab) doesn't wipe the in-progress
  // recording + notebook work. Disarmed once submitted (phase === 'done').
  useEffect(() => {
    if (phase === 'done') return
    const onBeforeUnload = (e) => {
      e.preventDefault()
      e.returnValue = '' // some browsers require a set returnValue to prompt
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [phase])

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

  const handleSubmit = async ({ auto = false } = {}) => {
    if (phase === 'submitting') return
    // Manual submit needs an active recording + confirmation. An automatic
    // time-up submit bypasses both — time is up, we submit whatever exists.
    if (!auto) {
      if (recordingDown) {
        setSubmitError('Your screen is not being recorded. Please re-share your entire screen before submitting.')
        return
      }
      const ok = window.confirm('Submit your assessment? You will not be able to make further changes.')
      if (!ok) return
    }

    const { sessionId } = getSession()
    setPhase('submitting')
    setSubmitError('')

    // 1. Finalize the recording (best-effort — the backend assembles whatever
    //    parts landed even if the tail upload fails). Capture the duration once
    //    (L4): a retry calls stop() again, which returns 0 on an already-stopped
    //    recorder; reusing the stored value avoids overwriting it with 0.
    setSubmitStep('recording')
    try {
      const r = await recorderRef.current?.stop()
      if (r?.durationSec) durationRef.current = r.durationSec
    } catch (err) {
      console.error('[assessment] recording finalize failed:', err)
    }
    const durationSec = durationRef.current

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

  // Time-budget countdown + auto-submit. Recomputed from the SERVER deadline on
  // every tick, so close/reopen continues correctly (no reset, no pause).
  // Auto-submits exactly once when the clock hits zero.
  useEffect(() => {
    if (!deadlineMs) return // no time limit on this question
    const tick = () => {
      const left = Math.max(0, deadlineMs - Date.now())
      setRemainingMs(left)
      if (left <= 0 && !autoSubmittedRef.current && phase === 'active') {
        autoSubmittedRef.current = true
        handleSubmit({ auto: true })
      }
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineMs, phase])

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
          {deadlineMs ? (
            <span
              className={`px-2.5 py-1 rounded-md text-xs font-bold tabular-nums ${
                remainingMs <= 60000
                  ? 'bg-red-600 text-white animate-pulse'
                  : remainingMs <= 5 * 60000
                    ? 'bg-amber-600 text-white'
                    : 'bg-jobjen-surface text-jobjen-text border border-jobjen-border'
              }`}
              title="Time remaining"
            >
              ⏱ {formatRemaining(remainingMs)}
            </span>
          ) : null}
          <button
            onClick={() => handleSubmit()}
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
            Screen recording interrupted
          </h2>
          <p className="text-sm text-jobjen-muted max-w-[460px] leading-relaxed">
            Your entire screen must be shared and recorded for the whole
            assessment.{' '}
            {recordingDown === 'start-failed'
              ? 'We could not start the recording.'
              : recordingDown === 'upload-failed'
                ? 'Your recording could not be uploaded — please check your internet connection.'
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
