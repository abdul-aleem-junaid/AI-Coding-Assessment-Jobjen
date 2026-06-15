export default function LandingPage({ onStart }) {
  return (
    <div className="jobjen-hero w-screen h-screen flex flex-col items-center justify-center gap-4 font-sans">
      <span className="jobjen-badge text-[0.7rem] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded-sm">
        Jobjen
      </span>
      <h1 className="text-[2.5rem] font-bold text-jobjen-text">Coding Assessment</h1>
      <p className="text-base text-jobjen-muted max-w-[400px] text-center leading-relaxed">
        Complete the tasks in the interactive notebook. Your code runs entirely in your browser — no installs needed.
      </p>
      <button
        onClick={onStart}
        className="jobjen-btn-primary mt-2 px-8 py-3 text-base font-semibold rounded-md"
      >
        Start Assessment
      </button>
    </div>
  )
}
