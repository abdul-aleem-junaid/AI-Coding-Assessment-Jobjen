// src/hooks/useSubmission.js
//
// React hook for submitting the completed assessment.
//
// Usage (in AssessmentPage.jsx):
//   const { submit, submitting, submitted, error } = useSubmission()
//   // call submit({ notebookContent, durationSeconds }) to trigger
//
// ─── INTEGRATION CHECKLIST ─────────────────────────────────────────────────
//  1. Call submit() when the candidate clicks a "Submit Assessment" button.
//  2. On success (submitted === true), show a confirmation screen.
//  3. Remove USE_MOCK guard once backend is ready.
// ─────────────────────────────────────────────────────────────────────────────

import { useApi } from './useApi'
import { submitAssessment } from '../services'

const USE_MOCK = !import.meta.env.VITE_API_BASE_URL

export function useSubmission() {
  const { loading: submitting, error, run, data } = useApi(submitAssessment)

  const submit = async (payload) => {
    if (USE_MOCK) {
      // Simulate a 1 s network delay in dev
      await new Promise((r) => setTimeout(r, 1000))
      return { submissionId: 'mock-001', status: 'received' }
    }
    return run(payload)
  }

  return {
    submit,
    submitting,
    submitted: !!data,
    error,
  }
}
