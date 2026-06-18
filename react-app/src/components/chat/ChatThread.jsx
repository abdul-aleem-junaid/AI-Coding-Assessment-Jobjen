// src/components/chat/ChatThread.jsx
//
// Scrollable message thread and composer input for the AI assistant panel.

import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react'
import ReactMarkdown from 'react-markdown'

// ── Markdown renderer ─────────────────────────────────────────────────────────
const mdComponents = {
  p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  code:   ({ className, children }) =>
            className
              ? <code className="font-mono text-[0.73rem]">{children}</code>
              : <code className="bg-white/10 px-1.5 py-px rounded font-mono text-[0.75rem]">{children}</code>,
  pre:    ({ children }) => (
            <pre className="bg-black/45 border border-[var(--border-subtle)] rounded-md p-3 overflow-x-auto my-1.5">
              {children}
            </pre>
          ),
  ul:     ({ children }) => <ul className="list-disc pl-4 my-1 mb-1.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 my-1 mb-1.5">{children}</ol>,
  li:     ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
  h1:     ({ children }) => <h1 className="text-white font-bold text-[0.87rem] mt-2 mb-1">{children}</h1>,
  h2:     ({ children }) => <h2 className="text-white font-bold text-[0.85rem] mt-2 mb-1">{children}</h2>,
  h3:     ({ children }) => <h3 className="text-white font-bold text-[0.82rem] mt-1.5 mb-1">{children}</h3>,
}

const MarkdownText = ({ text }) => (
  <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
)

// ── Message bubbles ───────────────────────────────────────────────────────────
function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end">
      <div
        className="max-w-[88%] px-3 py-2.5 rounded-xl rounded-br-[3px] text-[0.8rem] leading-[1.55] break-words text-white"
        style={{ background: 'var(--btn-gradient)' }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-start">
      <div className="max-w-[88%] px-3 py-2.5 rounded-xl rounded-bl-[3px] text-[0.8rem] leading-[1.55] break-words bg-jobjen-surface text-jobjen-muted border border-jobjen-border">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

// ── Thread ────────────────────────────────────────────────────────────────────
export default function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col overflow-hidden min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
        <ThreadPrimitive.Empty>
          <p className="text-[0.8rem] text-jobjen-subtle leading-[1.55] py-3 px-1 text-center">
            Hi! I&apos;m your AI coding coach. Ask me to clarify the problem,
            explain a concept, or help debug an error. I&apos;ll guide you with
            hints — but I can&apos;t write the solution for you.
          </p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>

      {/* Composer */}
      <ComposerPrimitive.Root className="flex items-end gap-2 p-2.5 border-t border-jobjen-border bg-jobjen-surface shrink-0 font-sans">
        <ComposerPrimitive.Input
          className="flex-1 bg-jobjen-bg border border-jobjen-border rounded-lg px-3 py-2 text-jobjen-text font-sans text-[0.8rem] resize-none outline-none leading-[1.5] min-h-[36px] max-h-[100px] overflow-y-auto transition-colors focus:border-jobjen-accent placeholder:text-jobjen-subtle"
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
        />
        <ComposerPrimitive.Send
          className="shrink-0 self-end border-none rounded-lg px-3.5 py-2 text-[0.78rem] font-semibold font-sans text-white cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:brightness-90"
          style={{ background: 'var(--btn-gradient)' }}
        >
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  )
}
