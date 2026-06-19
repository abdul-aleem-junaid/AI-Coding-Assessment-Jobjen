// src/lib/assistantStream.js
//
// Streaming client for the AI coding-coach chat. Talks to the backend
// `POST /technical/assistant/stream` endpoint, which emits the reply as
// Server-Sent Events (text deltas) so the chat can render token-by-token.
//
// This deliberately bypasses the encrypted `api` (axios) layer:
//   1. axios buffers the whole response body in the browser, so it cannot
//      surface a stream incrementally; native `fetch` + a ReadableStream
//      reader can.
//   2. the endpoint is intentionally UNENCRYPTED — the coaching chat carries
//      no sensitive candidate data, and skipping the envelope is what lets us
//      stream at all. Auth is still enforced server-side via the single-use
//      `X-Technical-Token` header (same token the axios layer injects).

import { apiUrl } from './api'
import { BASIC_AUTH_HEADER } from './basicAuth'
import { getToken } from './session'

/**
 * Stream a coach reply. Calls `onDelta(text)` for each chunk of generated text
 * (in order). Resolves when the stream completes; rejects on transport / HTTP
 * errors or if the server reports an in-stream error.
 *
 * @param {object}   opts
 * @param {string}   opts.sessionId
 * @param {Array<{role:'user'|'assistant', text:string}>} opts.messages
 * @param {(delta:string)=>void} opts.onDelta
 * @param {AbortSignal} [opts.signal]
 */
export async function streamAssistant({ sessionId, messages, onDelta, signal }) {
  const headers = {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  }
  const token = getToken()
  if (token) headers['X-Technical-Token'] = token
  if (BASIC_AUTH_HEADER) headers.Authorization = BASIC_AUTH_HEADER

  const res = await fetch(apiUrl('/api/technical/assistant/stream'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, messages }),
    signal,
  })

  if (!res.ok) {
    // The validation/auth failure path returns plain JSON (the endpoint only
    // switches to SSE once validation passes). Surface its message.
    let message = 'The AI assistant is temporarily unavailable. Please try again in a moment.'
    try {
      const data = await res.json()
      if (data && typeof data.message === 'string') message = data.message
    } catch {
      /* non-JSON body — keep the default */
    }
    const err = new Error(message)
    err.status = res.status
    throw err
  }

  if (!res.body) {
    throw new Error('Streaming is not supported in this browser.')
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let streamError = null

  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })

      // SSE frames are separated by a blank line. Process complete frames and
      // keep any trailing partial frame in the buffer for the next read.
      let sep
      while ((sep = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, sep)
        buffer = buffer.slice(sep + 2)

        // A frame may carry multiple `data:` lines; concatenate their payloads.
        const data = frame
          .split('\n')
          .filter((l) => l.startsWith('data:'))
          .map((l) => l.slice(5).trim())
          .join('')
        if (!data) continue

        let payload
        try {
          payload = JSON.parse(data)
        } catch {
          continue // ignore comments / keep-alive pings / malformed frames
        }

        if (typeof payload.delta === 'string') {
          onDelta(payload.delta)
        } else if (payload.error) {
          streamError = new Error(
            typeof payload.error === 'string'
              ? payload.error
              : 'The AI assistant ran into a problem. Please try again.',
          )
        } else if (payload.done) {
          if (streamError) throw streamError
          return
        }
      }
    }
    if (streamError) throw streamError
  } finally {
    try {
      reader.cancel()
    } catch {
      /* already closed */
    }
  }
}
