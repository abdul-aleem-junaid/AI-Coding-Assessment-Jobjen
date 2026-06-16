// src/services/assessment.service.js
//
// API calls related to the assessment session lifecycle:
//   • Validating the candidate token before showing the UI
//   • Fetching assessment configuration (title, time limit, notebook URL)
//
// ─── INTEGRATION CHECKLIST ────────────────────────────────────────────────────
//  Replace the placeholder endpoint strings with the real ones from the backend.
//  Every function returns the `data` property of the Axios response directly.
// ─────────────────────────────────────────────────────────────────────────────

import apiClient from './apiClient'

/**
 * Validate the candidate token and fetch session metadata.
 *
 * @returns {Promise<{
 *   candidateName: string,
 *   assessmentTitle: string,
 *   timeLimitMinutes: number,
 *   notebookUrl: string,   // URL to the .ipynb file to pre-load
 *   expiresAt: string,     // ISO datetime
 * }>}
 */
export async function validateSession() {
  // TODO: replace with real endpoint once backend confirms URL
  const { data } = await apiClient.get('/assessment/session')
  return data
}

/**
 * Fetch full assessment config (instructions, metadata, etc.).
 *
 * @param {string} assessmentId
 * @returns {Promise<object>}
 */
export async function getAssessmentConfig(assessmentId) {
  // TODO: replace with real endpoint
  const { data } = await apiClient.get(`/assessment/${assessmentId}/config`)
  return data
}
