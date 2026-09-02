import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * The masthead. Full viewport, dark, and marked `data-tone="dark"` so the
 * header floats over it transparently rather than laying a paper bar across it.
 */
export default function Hero() {
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const timer = window.setTimeout(() => setRevealed(true), 60)
    return () => window.clearTimeout(timer)
  }, [])

  return (
    <section
      data-tone="dark"
      className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-ink text-paper"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 opacity-70"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 0%, #2b2621 0%, #1f1c19 45%, #1c1a17 100%)',
        }}
      />

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <span
          className={`label mb-6 text-paper/45 transition-opacity duration-700 ${
            revealed ? 'opacity-100' : 'opacity-0'
          }`}
        >
          An engagement marketplace on GenLayer
        </span>

        <h1
          className={`max-w-4xl cursor-default font-serif text-[2.25rem] leading-[1.05] font-semibold tracking-tight text-paper transition-opacity duration-1000 select-none sm:text-6xl md:text-7xl ${
            revealed ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDelay: '150ms' }}
        >
          The contract writes
          <br />
          <span className="text-seal-400 italic">the contract.</span>
        </h1>

        <p
          className={`mt-7 max-w-xl text-[1.0625rem] leading-relaxed text-paper/60 transition-opacity duration-1000 ${
            revealed ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDelay: '350ms' }}
        >
          A client posts a brief and funds it. A freelancer proposes terms. When both accept, the
          Intelligent Contract drafts the binding Statement of Work itself, and every question after
          that is ruled on against the text it wrote.
        </p>

        <div
          className={`mt-9 flex flex-wrap items-center justify-center gap-3 transition-opacity duration-1000 ${
            revealed ? 'opacity-100' : 'opacity-0'
          }`}
          style={{ transitionDelay: '500ms' }}
        >
          <Link
            to="/post"
            className="border border-paper/40 px-6 py-3 font-mono text-xs tracking-[0.2em] text-paper uppercase transition-colors hover:bg-seal-400 hover:text-ink"
          >
            Post a brief
          </Link>
          <Link
            to="/jobs"
            className="border border-paper/20 px-6 py-3 font-mono text-xs tracking-[0.2em] text-paper/70 uppercase transition-colors hover:border-paper/60 hover:text-paper"
          >
            Browse the board
          </Link>
        </div>
      </div>

      <span
        aria-hidden="true"
        className={`relative z-10 pb-8 text-center font-mono text-[0.625rem] tracking-[0.3em] text-paper/25 uppercase transition-opacity duration-1000 ${
          revealed ? 'opacity-100' : 'opacity-0'
        }`}
        style={{ transitionDelay: '800ms' }}
      >
        scroll
      </span>
    </section>
  )
}
