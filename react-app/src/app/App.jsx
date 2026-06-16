// src/app/App.jsx
//
// Root application shell: router, DevTools guard wiring, and the global
// "DevTools detected" toast.  Route-level code lives in src/pages/.

import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'

import { registerDevToolsToast, setDevToolsGuardActive, isDevToolsTriggered, DEVTOOLS_GUARD_ENABLED } from '../utils/devtoolsGuard'
import LandingPage    from '../pages/LandingPage'
import PreflightPage  from '../pages/PreflightPage'
import AssessmentPage from '../pages/AssessmentPage'

import './App.css'

export default function App() {
  const location    = useLocation()
  const navigate    = useNavigate()
  const isAssessment = location.pathname === '/assessment'

  const [toast, setToast] = useState(() => isDevToolsTriggered())
  const streamRef = useRef(null)

  // Stop media tracks on unmount
  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  // Register the toast callback so devtoolsGuard can trigger it
  useEffect(() => {
    registerDevToolsToast(() => setToast(true))
    return () => registerDevToolsToast(null)
  }, [])

  // Activate / suspend the guard depending on the current route
  useEffect(() => {
    if (!DEVTOOLS_GUARD_ENABLED) return
    setDevToolsGuardActive(isAssessment)
  }, [isAssessment])

  // Block DevTools keyboard shortcuts on the assessment page
  useEffect(() => {
    if (!DEVTOOLS_GUARD_ENABLED || !isAssessment) return

    const onKeyDown = (e) => {
      const isDevShortcut =
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey &&
          ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase()))
      if (isDevShortcut) e.preventDefault()
    }

    const onContextMenu = (e) => e.preventDefault()

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('contextmenu', onContextMenu)
    }
  }, [isAssessment])

  return (
    <>
      {/* DevTools warning toast */}
      {toast && (
        <div className="fixed top-5 right-5 z-[99999] bg-red-800 text-white text-sm font-semibold px-[22px] py-[14px] rounded-xl shadow-[0_4px_16px_rgba(0,0,0,0.35)] animate-slide-in font-sans">
          Access Restricted: Developer tools are not allowed.
        </div>
      )}

      <Routes>
        <Route
          path="/"
          element={<LandingPage onStart={() => navigate('/preflight')} />}
        />
        <Route
          path="/preflight"
          element={<PreflightPage streamRef={streamRef} onBegin={() => navigate('/assessment')} />}
        />
        <Route
          path="/assessment"
          element={
            streamRef.current
              ? <AssessmentPage streamRef={streamRef} />
              : <Navigate to="/preflight" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}
