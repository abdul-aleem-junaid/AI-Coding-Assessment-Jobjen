// src/components/chat/ChatPanel.jsx
//
// AI assistant side panel.
// INTEGRATION POINT: Replace `mockAdapter` with a real ChatModelAdapter
// when the backend is ready — only the `useLocalRuntime` call needs updating.

import { AssistantRuntimeProvider, useLocalRuntime } from '@assistant-ui/react'
import ChatThread from './ChatThread'

// ── Icons ─────────────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="2" y1="2" x2="12" y2="12" />
    <line x1="12" y1="2" x2="2" y2="12" />
  </svg>
)

// ── Mock adapter (replace with real adapter when backend is ready) ────────────
const mockAdapter = {
  async *run({ abortSignal }) {
    await new Promise((resolve) => setTimeout(resolve, 600))
    yield {
      content: [{ type: 'text', text: 'This is a placeholder reply. Backend coming soon.' }],
    }
  },
}

// ── Component ────────────────────────────────────────────────────────────────
export default function ChatPanel({ onClose }) {
  const runtime = useLocalRuntime(mockAdapter)

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
