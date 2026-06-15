import {
  AssistantRuntimeProvider,
  useLocalRuntime,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
} from "@assistant-ui/react";
import ReactMarkdown from "react-markdown";

// ── Icons ─────────────────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="2" y1="2" x2="12" y2="12" />
    <line x1="12" y1="2" x2="2" y2="12" />
  </svg>
);

// ── Mock adapter ──────────────────────────────────────────────────────────────
// INTEGRATION POINT: Replace `mockAdapter` with your real ChatModelAdapter
// when the backend is ready. The adapter only needs a `run` method that
// returns an async generator yielding { content: [...] } objects.
//
// Example swap (one line change here + import at top):
//   const runtime = useLocalRuntime(myRealAdapter);
// ─────────────────────────────────────────────────────────────────────────────
const mockAdapter = {
  async *run({ abortSignal }) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    yield {
      content: [
        { type: "text", text: "This is a placeholder reply. Backend coming soon." },
      ],
    };
  },
};

// Markdown element map — all Tailwind, no CSS file needed
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
};

// The Text component in MessagePrimitive.Content receives { type, text, status }
const MarkdownText = ({ text }) => (
  <ReactMarkdown components={mdComponents}>{text}</ReactMarkdown>
);

function UserMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-end">
      <div
        className="max-w-[88%] px-3 py-2.5 rounded-xl rounded-br-[3px] text-[0.8rem] leading-[1.55] break-words text-white"
        style={{ background: "var(--btn-gradient)" }}
      >
        <MessagePrimitive.Content />
      </div>
    </MessagePrimitive.Root>
  );
}

function AssistantMessage() {
  return (
    <MessagePrimitive.Root className="flex w-full justify-start">
      <div className="max-w-[88%] px-3 py-2.5 rounded-xl rounded-bl-[3px] text-[0.8rem] leading-[1.55] break-words bg-jobjen-surface text-jobjen-muted border border-jobjen-border">
        <MessagePrimitive.Content components={{ Text: MarkdownText }} />
      </div>
    </MessagePrimitive.Root>
  );
}

function ChatThread() {
  return (
    <ThreadPrimitive.Root className="flex-1 flex flex-col overflow-hidden min-h-0">
      <ThreadPrimitive.Viewport className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-0">
        <ThreadPrimitive.Empty>
          <p className="text-[0.8rem] text-jobjen-subtle leading-[1.55] py-3 px-1 text-center">
            Hi! I&apos;m your AI assistant. Ask me anything about the assessment.
          </p>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages components={{ UserMessage, AssistantMessage }} />
      </ThreadPrimitive.Viewport>

      <ComposerPrimitive.Root className="flex items-end gap-2 p-2.5 border-t border-jobjen-border bg-jobjen-surface shrink-0 font-sans">
        <ComposerPrimitive.Input
          className="flex-1 bg-jobjen-bg border border-jobjen-border rounded-lg px-3 py-2 text-jobjen-text font-sans text-[0.8rem] resize-none outline-none leading-[1.5] min-h-[36px] max-h-[100px] overflow-y-auto transition-colors focus:border-jobjen-accent placeholder:text-jobjen-subtle"
          placeholder="Ask a question… (Enter to send, Shift+Enter for new line)"
        />
        <ComposerPrimitive.Send
          className="shrink-0 self-end border-none rounded-lg px-3.5 py-2 text-[0.78rem] font-semibold font-sans text-white cursor-pointer transition-all disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110 active:brightness-90"
          style={{ background: "var(--btn-gradient)" }}
        >
          Send
        </ComposerPrimitive.Send>
      </ComposerPrimitive.Root>
    </ThreadPrimitive.Root>
  );
}

export default function ChatPanel({ onClose }) {
  // INTEGRATION POINT: swap mockAdapter with your real adapter here
  const runtime = useLocalRuntime(mockAdapter);

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
  );
}
