// src/components/chat/ChatPanel.jsx
//
// AI assistant side panel — a coach-only coding helper the candidate can chat
// with while solving the assigned problem. Talks to the backend
// `POST /technical/assistant` endpoint through the encrypted `api` layer (which
// injects the single-use technical token + the crypto envelope automatically).
// The server binds the chat to the session's assigned question and hard-bounds
// the assistant to coaching (it never writes the solution).

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import api from '../../lib/api'
import { getSession } from '../../lib/session'
import ChatThread from './ChatThread'

// ── Icons ─────────────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="2" y1="2" x2="12" y2="12" />
    <line x1="12" y1="2" x2="2" y2="12" />
  </svg>
)

// Server limits mirrored here so we never trip a 400 (per-turn MaxLength 4000,
// array ArrayMaxSize 40 in AssistantChatDto).
const MAX_TURN_CHARS = 4000
const MAX_TURNS = 40

/** Flatten an @assistant-ui message's content parts into plain text. */
function partsToText(content) {
  if (typeof content === 'string') return content.trim()
  if (Array.isArray(content)) {
    return content
      .filter((p) => p && p.type === 'text' && typeof p.text === 'string')
      .map((p) => p.text)
      .join('\n')
      .trim()
  }
  return ''
}

// ── Real adapter — calls the coach-only backend assistant ─────────────────────
const assistantAdapter = {
  async *run({ messages, abortSignal }) {
    const { sessionId } = getSession()
    if (!sessionId) {
      yield {
        content: [
          {
            type: 'text',
            text: "I can't reach your session right now. Please reload the page and try again.",
          },
        ],
      }
      return
    }

    // Build the bounded turn history the backend expects (oldest-first, last
    // turn = the candidate). Drop empties; clamp each turn + the count.
    const history = (messages ?? [])
      .map((m) => ({ role: m.role, text: partsToText(m.content) }))
      .filter(
        (m) => (m.role === 'user' || m.role === 'assistant') && m.text,
      )
      .map((m) => ({ role: m.role, text: m.text.slice(0, MAX_TURN_CHARS) }))
      .slice(-MAX_TURNS)

    if (!history.length || history[history.length - 1].role !== 'user') return

    try {
      const res = await api.post(
        '/technical/assistant',
        { sessionId, messages: history },
        { signal: abortSignal },
      )
      const reply =
        res?.data?.reply ||
        "Sorry, I couldn't come up with a reply. Please try again."
      yield { content: [{ type: 'text', text: reply }] }
    } catch (err) {
      if (err?.code === 'ERR_CANCELED' || abortSignal?.aborted) return
      const msg =
        err?.response?.data?.message ||
        'The AI assistant is temporarily unavailable. Please try again in a moment.'
      yield { content: [{ type: 'text', text: msg }] }
    }
  },
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ChatPanel({ onClose }) {
  const runtime = useLocalRuntime(assistantAdapter)

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div className="flex flex-col h-full bg-jobjen-panel border-l border-jobjen-border font-sans min-w-0">

        {/* Header */}
        <div className="px-4 py-3.5 border-b border-jobjen-border bg-jobjen-surface shrink-0 flex items-center justify-between">
          <span className="text-[0.78rem] font-bold tracking-[0.07em] uppercase text-jobjen-text">
            AI Assistant
          </span>
          <button
            onClick={onClose}
            title="Close chat"
            className="text-jobjen-subtle hover:text-jobjen-text transition-colors p-1 rounded cursor-pointer"
          >
            <CloseIcon />
          </button>
        </div>

        <ChatThread />
      </div>
    </AssistantRuntimeProvider>
  )
}
