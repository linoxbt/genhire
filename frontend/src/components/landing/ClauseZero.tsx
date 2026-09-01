import { Link } from 'react-router-dom'
import { useInView } from '../../lib/useInView'
import { useScrollDepth } from '../../lib/useScrollDepth'
import MeasureBar from './MeasureBar'

/**
 * The section that has to land the argument: the contract writes the criteria,
 * and settles on how many of them were met.
 *
 * Desktop and mobile are two separate DOM compositions rather than one reflowing
 * layout — the desktop version is art-directed with absolute positioning and
 * clamped gutters, which does not survive being squeezed into a phone.
 */
const CRITERIA = [
  'The cart page displays name, quantity, unit price and total.',
  'It renders correctly from 320px to 768px without horizontal scrolling.',
  'A test payment to the sandbox endpoint returns a success response.',
  'A confirmation email is sent within five minutes of payment.',
]

function Panel() {
  return (
    <div className="w-full text-paper">
      <div className="mb-5 flex items-baseline justify-between gap-4">
        <span className="text-sm text-paper">Cart and payment UI</span>
        <span className="label tabnum text-paper/40">Milestone 1 of 2</span>
      </div>
      <MeasureBar pct={75} amountWei="6000000000000000" />
      <ul className="mt-6 space-y-2 border-t border-paper/15 pt-5">
        {CRITERIA.map((criterion, index) => (
          <li key={criterion} className="grid grid-cols-[1.25rem_1fr] gap-x-1 text-[0.9375rem]">
            <span className={index < 3 ? 'text-signed-500' : 'text-seal-400'}>
              {index < 3 ? '✓' : '✗'}
            </span>
            <span className="font-serif text-paper/75">{criterion}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function ClauseZero() {
  const { ref, inView } = useInView<HTMLElement>(0.15)
  const headingRef = useScrollDepth<HTMLHeadingElement>()

  return (
    <section
      ref={ref}
      data-tone="dark"
      className="relative flex w-full flex-col justify-center overflow-hidden bg-ink py-20 md:min-h-[100dvh] md:py-0"
    >
      {/* Desktop: art-directed */}
      <div className="hidden md:block">
        <div className="absolute top-[18%] left-[clamp(1.6rem,3.5vw,13rem)] z-10 max-w-md">
          <span className="label mb-4 block text-seal-400">Clause 0</span>
          <h2
            ref={headingRef}
            className={`scroll-depth-blur font-serif text-[3.4vw] leading-[0.95] font-semibold text-paper ${
              inView ? 'animate-reveal' : 'opacity-0'
            }`}
          >
            Neither party
            <br />
            wrote the standard
            <br />
            they are held to
          </h2>
          <p
            className={`mt-6 max-w-sm text-[0.95rem] leading-relaxed text-paper/60 ${
              inView ? 'animate-reveal' : 'opacity-0'
            }`}
            style={inView ? { animationDelay: '150ms' } : undefined}
          >
            The brief and the accepted proposal go in. The contract drafts the acceptance criteria
            itself, and both parties sign that exact text by its hash before any work starts. Every
            later ruling is measured against it.
          </p>
          <Link
            to="/about"
            className={`mt-6 inline-block border-b border-paper/30 pb-1 text-sm text-paper transition-colors hover:border-paper ${
              inView ? 'animate-reveal' : 'opacity-0'
            }`}
            style={inView ? { animationDelay: '300ms' } : undefined}
          >
            How adjudication works →
          </Link>
        </div>

        <div
          className={`absolute top-1/2 right-[clamp(1.6rem,3.5vw,13rem)] z-20 w-[44vw] -translate-y-1/2 ${
            inView ? 'animate-reveal' : 'opacity-0'
          }`}
          style={inView ? { animationDelay: '250ms' } : undefined}
        >
          <Panel />
        </div>
      </div>

      {/* Mobile: stacked */}
      <div className="px-5 md:hidden">
        <span className="label mb-3 block text-seal-400">Clause 0</span>
        <h2
          className={`font-serif text-3xl leading-tight font-semibold text-paper ${
            inView ? 'animate-reveal' : 'opacity-0'
          }`}
        >
          Neither party wrote the standard they are held to
        </h2>
        <p className="mt-4 text-[0.95rem] leading-relaxed text-paper/60">
          The contract drafts the acceptance criteria itself, and both parties sign that exact text
          before any work starts.
        </p>
        <div className="mt-10">
          <Panel />
        </div>
        <Link
          to="/about"
          className="mt-8 inline-block border-b border-paper/30 pb-1 text-sm text-paper"
        >
          How adjudication works →
        </Link>
      </div>
    </section>
  )
}
