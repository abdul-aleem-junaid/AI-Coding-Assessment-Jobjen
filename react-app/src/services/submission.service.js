// src/services/submission.service.js
//
// API calls for submitting the completed assessment.
//   • submitAssessment — upload the candidate's notebook + metadata
//
// ─── INTEGRATION CHECKLIST ────────────────────────────────────────────────────
//  1. Replace the placeholder endpoint with the real one from the backend.
//  2. Confirm whether the backend expects raw JSON, multipart/form-data, or
//     a pre-signed S3 URL upload flow.
//  3. Call submitAssessment() from AssessmentPage when the candidate clicks
//     a "Submit" button (to be added to the UI).
// ─────────────────────────────────────────────────────────────────────────────

import apiClient from './apiClient'

/**
 * Submit the completed assessment notebook.
 *
 * @param {{
 *   notebookContent: object,   // parsed .ipynb JSON from the iframe postMessage
 *   durationSeconds: number,   // actual time the candidate spent
 *   events?: object[],         // optional proctoring event log
 * }} payload
 *
 * @returns {Promise<{
 *   submissionId: string,
 *   status: 'received' | 'queued',
 *   message: string,
 * }>}
 */
export async function submitAssessment(payload) {
  // TODO: replace with real endpoint once backend confirms URL
  const { data } = await apiClient.post('/assessment/submit', payload)
  return data
}

/**
 * Save a draft / auto-save checkpoint (optional heartbeat endpoint).
 *
 * @param {{ notebookContent: object }} payload
 * @returns {Promise<{ savedAt: string }>}
 */
export async function saveDraft(payload) {
  // TODO: replace with real endpoint once backend confirms URL
  const { data } = await apiClient.post('/assessment/draft', payload)
  return data
}
