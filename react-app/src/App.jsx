import { useState, useEffect, useRef } from 'react'
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom'
import { registerDevToolsToast, setDevToolsGuardActive, isDevToolsTriggered } from './devtoolsGuard.js'
import LandingPage from './components/LandingPage'
import PreflightCheck from './components/PreflightCheck'
import AssessmentView from './components/AssessmentView'
import './App.css'

function App() {
  const location = useLocation()
  const isAssessment = location.pathname === '/assessment'

  const [toast, setToast] = useState(() => isDevToolsTriggered())
  const streamRef = useRef(null)
  const navigate = useNavigate()

  useEffect(() => {
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()) }
  }, [])

  useEffect(() => {
    registerDevToolsToast(() => setToast(true))
    return () => registerDevToolsToast(null)
  }, [])

  useEffect(() => {
    setDevToolsGuardActive(isAssessment)
  }, [isAssessment])

  // Assessment only: block DevTools shortcuts and right-click (no redirect).
  useEffect(() => {
    if (!isAssessment) return

    const onKeyDown = (e) => {
      const isDevShortcut =
        e.key === 'F12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey &&
          ['I', 'J', 'C', 'K'].includes(e.key.toUpperCase()))
      if (isDevShortcut) {
        e.preventDefault()
      }
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
          element={<PreflightCheck streamRef={streamRef} onBegin={() => navigate('/assessment')} />}
        />
        <Route
          path="/assessment"
          element={
            streamRef.current
              ? <AssessmentView streamRef={streamRef} />
              : <Navigate to="/preflight" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  )
}

export default App
