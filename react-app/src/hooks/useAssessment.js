// src/hooks/useAssessment.js
//
// React hook for assessment session lifecycle.
// Auto-validates the session token on mount and exposes the session data.
//
// Usage (in App.jsx or AssessmentPage.jsx):
//   const { session, loading, error } = useAssessment()
//
// ─── INTEGRATION CHECKLIST ─────────────────────────────────────────────────
//  Remove the mock and call the real service by setting VITE_API_BASE_URL.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect } from 'react'
import { useApi }    from './useApi'
import { validateSession } from '../services'

// ── Mock data (remove once backend is ready) ─────────────────────────────────
const MOCK_SESSION = {
  candidateName:    'Candidate',
  assessmentTitle:  'Python Coding Assessment',
  timeLimitMinutes: 60,
  notebookUrl:      null,
  expiresAt:        new Date(Date.now() + 60 * 60 * 1000).toISOString(),
}

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL

export function useAssessment() {
  const { data: session, loading, error, run } = useApi(validateSession)

  useEffect(() => {
    if (USE_MOCK) return // skip API call when no base URL configured
    run()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    session: USE_MOCK ? MOCK_SESSION : session,
    loading: USE_MOCK ? false        : loading,
    error:   USE_MOCK ? null         : error,
  }
}
