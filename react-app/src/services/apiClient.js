// src/services/apiClient.js
//
// Central Axios instance used by every service file.
// Responsibilities:
//   • Sets base URL from VITE_API_BASE_URL env variable
//   • Attaches the candidate JWT on every request (request interceptor)
//   • Normalises errors into a consistent shape (response interceptor)
//
// ─── INTEGRATION CHECKLIST ────────────────────────────────────────────────────
//  1. Set VITE_API_BASE_URL in .env (copy .env.example → .env)
//  2. Confirm the Authorization header format with the backend team
//     (currently: Bearer <token>)
//  3. Update getToken() if the token source changes (e.g. localStorage, cookie)
// ─────────────────────────────────────────────────────────────────────────────

import axios from 'axios'

// ── Token resolution ────────────────────────────────────────────────────────

/**
 * Returns the candidate JWT in the following priority order:
 *   1. `?token=` URL query parameter  (recruiter-generated assessment link)
 *   2. `VITE_DEV_TOKEN` env variable  (local development convenience)
 *   3. `null`                         (unauthenticated / not yet implemented)
 */
function getToken() {
  const urlToken = new URLSearchParams(window.location.search).get('token')
  if (urlToken) return urlToken

  const devToken = import.meta.env.VITE_DEV_TOKEN
  if (devToken) return devToken

  return null
}

// ── Axios instance ───────────────────────────────────────────────────────────

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'https://api.jobjen.com/v1',
  timeout: 15_000,                // 15 s — reasonable for an assessment platform
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor: inject auth token ───────────────────────────────────

apiClient.interceptors.request.use((config) => {
  const token = getToken()
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor: normalise errors ───────────────────────────────────
//
// Every rejection resolves to an Error with:
//   error.message  — human-readable string
//   error.status   — HTTP status code (or 0 for network errors)
//   error.data     — raw response body (if any)

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    const status  = error.response?.status  ?? 0
    const data    = error.response?.data    ?? null
    const message = data?.message ?? data?.error ?? error.message ?? 'Unknown error'

    const normalised = new Error(message)
    normalised.status = status
    normalised.data   = data
    return Promise.reject(normalised)
  },
)

export default apiClient
