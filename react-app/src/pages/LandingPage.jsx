// src/pages/LandingPage.jsx
//
// Route: "/"
// First screen the candidate sees. Shows the Jobjen brand and a CTA to
// start the preflight check.

export default function LandingPage({ onStart, starting = false }) {
  return (
    <div className="jobjen-hero w-screen h-screen flex flex-col items-center justify-center gap-4 font-sans">
      <span className="jobjen-badge text-[0.7rem] font-bold tracking-[0.12em] px-3 py-1 rounded-sm">
        Jobjen
      </span>
      <h1 className="text-[2.5rem] font-bold text-jobjen-text">
        Coding Assessment
      </h1>
      <p className="text-base text-jobjen-muted max-w-[400px] text-center leading-relaxed">
        Complete the tasks in the interactive notebook. Your code runs entirely
        in your browser — no installs needed.
      </p>
      <button
        onClick={onStart}
        disabled={starting}
        className="jobjen-btn-primary mt-2 px-8 py-3 text-base font-semibold rounded-md disabled:opacity-60"
      >
        {starting ? 'Starting…' : 'Start Assessment'}
      </button>
    </div>
  );
}
