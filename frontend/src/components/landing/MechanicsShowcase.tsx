import { useScrollSequence } from '../../lib/useScrollSequence'
import { Seal } from '../Logo'
import SealGauge from './SealGauge'

/**
 * The three mechanics, each with the mark drawn as data behind it. The gauge
 * percentage is illustrative of the mechanic, not a live reading. These are
 * arguments, not measurements.
 */
/**
 * `pct` is only set on the mechanic the gauge actually measures. On the other
 * two a gauge would be decoration reading as data - and at 100% it degenerates
 * into a plain ring that says nothing at all - so they carry the mark instead.
 */
const MECHANICS: { label: string; pct?: number; blurb: string }[] = [
  {
    label: 'Contract-authored terms',
    blurb:
      'Most escrow takes the acceptance criteria as an input, which rewards whoever writes more carefully. Here the contract drafts them from the brief and the accepted proposal, and both parties sign that exact text by hash.',
  },
  {
    label: 'Proportional settlement',
    pct: 72,
    blurb:
      'Real work lands partly done far more often than it lands cleanly failed. Rulings are a completion percentage with a per-criterion breakdown, and escrow splits on it. All-or-nothing is just the 100 and 0 cases.',
  },
  {
    label: 'Scope, decided',
    blurb:
      '“That was always included” against “that is new work” ends more engagements than bad delivery does. Because the signed agreement is on chain, it is a question with an answer, and out-of-scope work needs a funded change order.',
  },
]

export default function MechanicsShowcase() {
  const { wrapperRef, panelRefs } = useScrollSequence<HTMLDivElement>(MECHANICS.length)

  return (
    <section className="bg-paper">
      <div className="mx-auto max-w-6xl px-5 pt-24 pb-10 text-center sm:px-8 sm:pt-32">
        <span className="label text-seal-500">What is different here</span>
        <h2 className="mt-3 font-serif text-3xl font-semibold text-ink sm:text-5xl">
          Three mechanics
        </h2>
      </div>

      <div ref={wrapperRef} className="relative" style={{ height: `${MECHANICS.length * 100}vh` }}>
        <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
          {/* Outline type as texture, this page's substitute for a grid or
              noise overlay. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden select-none"
          >
            <span className="stroke-type font-serif text-[24vw] leading-none font-semibold whitespace-nowrap opacity-60">
              GENHIRE
            </span>
          </div>

          {MECHANICS.map((mechanic, index) => (
            <div
              key={mechanic.label}
              ref={(el) => {
                panelRefs.current[index] = el
              }}
              className="absolute inset-0 z-10 flex flex-col items-center justify-center px-6 text-center opacity-0"
            >
              <div className="mb-8 flex flex-col items-center text-ink">
                {mechanic.pct === undefined ? (
                  <Seal size={168} />
                ) : (
                  <>
                    <div className="relative">
                      <SealGauge pct={mechanic.pct} size={200} />
                      <span className="tabnum absolute inset-0 flex items-center justify-center font-mono text-2xl text-ink">
                        {mechanic.pct}%
                      </span>
                    </div>
                    <span className="label mt-3 text-ink-faint">an illustrative ruling</span>
                  </>
                )}
              </div>
              <span className="label tabnum mb-3 block text-seal-500">
                {String(index + 1).padStart(2, '0')} / {String(MECHANICS.length).padStart(2, '0')}
              </span>
              <h3 className="mb-3 font-serif text-3xl font-semibold text-ink sm:text-4xl">
                {mechanic.label}
              </h3>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-ink-soft">{mechanic.blurb}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
