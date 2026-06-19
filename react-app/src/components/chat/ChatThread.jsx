// src/components/chat/ChatThread.jsx
//
// Scrollable message thread and composer input for the AI assistant panel.

import {
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from '@assistant-ui/react'
import ReactMarkdown from 'react-markdown'

// ── Icons ─────────────────────────────────────────────────────────────────────
const SparkleIcon = ({ size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2l1.9 5.1L19 9l-5.1 1.9L12 16l-1.9-5.1L5 9l5.1-1.9L12 2z" />
    <path d="M19 14l.9 2.4L22 17l-2.1.6L19 20l-.9-2.4L16 17l2.1-.6L19 14z" opacity="0.7" />
  </svg>
)

const SendIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M22 2L11 13" />
    <path d="M22 2l-7 20-4-9-9-4 20-7z" />
  </svg>
)

// ── Assistant avatar ───────────────────────────────────────────────────────────
const AssistantAvatar = () => (
  <div
    className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-white shadow-[0_2px_8px_rgba(124,58,237,0.4)] self-start mt-0.5"
    style={{ background: 'var(--btn-gradient)' }}
  >
    <SparkleIcon />
  </div>
)

// ── Typing indicator (shown while the coach is generating) ─────────────────────
const TypingDots = () => (
  <div className="flex items-center gap-1 py-0.5" aria-label="Assistant is typing">
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className="w-1.5 h-1.5 rounded-full bg-jobjen-subtle animate-bounce"
        style={{ animationDelay: `${i * 0.15}s`, animationDuration: '0.9s' }}
      />
    ))}
  </div>
)

// ── Markdown renderer ─────────────────────────────────────────────────────────
const mdComponents = {
  p:      ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  code:   ({ className, children }) =>
            className
              ? <code className="font-mono text-[0.73rem]">{children}</code>
              : <code className="bg-white/10 px-1.5 py-px rounded font-mono text-[0.75rem] text-jobjen-text">{children}</code>,
  pre:    ({ children }) => (
            <pre className="bg-black/45 border border-[var(--border-subtle)] rounded-md p-3 overflow-x-auto my-2 text-[0.73rem] leading-[1.5]">
              {children}
            </pre>
          ),
  ul:     ({ children }) => <ul className="list-disc pl-4 my-1 mb-1.5 space-y-0.5">{children}</ul>,
  ol:     ({ children }) => <ol className="list-decimal pl-4 my-1 mb-1.5 space-y-0.5">{children}</ol>,
  li:     ({ children }) => <li className="mb-0.5">{children}</li>,
  strong: ({ children }) => <strong className="text-white font-semibold">{children}</strong>,
  a:      ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer" className="text-jobjen-accent underline underline-offset-2">
              {children}
            </a>
          ),
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
        className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-br-md text-[0.8rem] leading-[1.55] break-words text-white shadow-[0_2px_10px_rgba(124,58,237,0.25)]"
        style={{ background: 'var(--btn-gradient)' }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  )
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-start gap-2">
      <AssistantAvatar />
      <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-md text-[0.8rem] leading-[1.55] break-words bg-jobjen-surface text-jobjen-muted border border-jobjen-border shadow-[0_1px_6px_rgba(0,0,0,0.18)]">
        {/* Bouncing dots only until the first token lands; once any text has
            streamed in, `hasContent` flips true and the dots disappear. (NB:
            `running` is NOT a valid MessageIf filter in @assistant-ui ≥0.14 —
            it's silently ignored — so gate on hasContent, not running.) */}
        <MessagePrimitive.If hasContent={false}>
          <TypingDots />
        </MessagePrimitive.If>
        {/* Render the streamed content live (it updates as tokens arrive). */}
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  )
}

// ── Quick-start suggestion chips (empty state) ─────────────────────────────────
const SUGGESTIONS = [
  'Explain the problem in simple terms',
  'What approach should I take?',
  'Help me debug an error',
]

function SuggestionChips() {
  return (
    <div className="flex flex-col gap-2 mt-1">
      {SUGGESTIONS.map((s) => (
        <ThreadPrimitive.Suggestion
          key={s}
          prompt={s}
          method="replace"
          autoSend
          className="text-left text-[0.78rem] text-jobjen-muted bg-jobjen-surface border border-jobjen-border rounded-xl px-3 py-2 cursor-pointer transition-all hover:border-jobjen-accent hover:text-jobjen-text hover:bg-white/3"
        >
          {s}
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
  )
}

// ── Thread ────────────────────────────────────────────────────────────────────
export default function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col overflow-hidden min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-3.5 flex flex-col gap-3 min-h-0">
        <ThreadPrimitive.Empty>
          <div className="flex flex-col gap-3 py-2 px-0.5">
            <div className="flex items-center gap-2.5">
              <div
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-white shadow-[0_3px_12px_rgba(124,58,237,0.45)]"
                style={{ background: 'var(--btn-gradient)' }}
              >
                <SparkleIcon size={18} />
              </div>
              <div>
                <p className="text-[0.85rem] font-semibold text-jobjen-text">
                  Hi! I&apos;m your AI coding coach
                </p>
                <p className="text-[0.72rem] text-jobjen-subtle">
                  Hints &amp; explanations — not the answer
                </p>
              </div>
            </div>
            <p className="text-[0.78rem] text-jobjen-muted leading-[1.55]">
              Ask me to clarify the problem, explain a concept, or help debug an
              error. I&apos;ll guide you — but I can&apos;t write the solution
              for you.
            </p>
            <SuggestionChips />
          </div>
        </ThreadPrimitive.Empty>

        {/* The in-bubble `hasContent={false}` dots (see AssistantMessage) are the
            single source of the "typing" state — the local runtime mounts the
            assistant message immediately, so no separate thread-level fallback is
            needed (a second one here caused two loaders). */}
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>

      {/* Composer */}
      <div className="shrink-0 border-t border-jobjen-border bg-jobjen-surface p-2.5">
        <ComposerPrimitive.Root className="flex items-end gap-2 bg-jobjen-bg border border-jobjen-border rounded-xl p-1.5 pl-3 transition-colors focus-within:border-jobjen-accent font-sans">
          <ComposerPrimitive.Input
            rows={1}
            autoFocus
            className="flex-1 bg-transparent border-none text-jobjen-text font-sans text-[0.8rem] resize-none outline-none leading-[1.5] py-1.5 min-h-[24px] max-h-[120px] overflow-y-auto placeholder:text-jobjen-subtle"
            placeholder="Ask a question…  (Enter to send)"
          />
          <ComposerPrimitive.Send
            className="shrink-0 self-end flex items-center justify-center border-none rounded-lg w-9 h-9 text-white cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:brightness-90"
            style={{ background: 'var(--btn-gradient)' }}
            aria-label="Send message"
          >
            <SendIcon />
          </ComposerPrimitive.Send>
        </ComposerPrimitive.Root>
        <p className="text-[0.65rem] text-jobjen-subtle text-center mt-1.5 leading-tight">
          Shift+Enter for a new line · Coach mode, hints only
        </p>
      </div>
    </ThreadPrimitive.Root>
  )
}
