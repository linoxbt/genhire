import { useScrollSequence } from '../../lib/useScrollSequence'

/**
 * The seven steps of an engagement, one at a time, pinned while you scroll
 * through them. The counter is computed rather than typed so it cannot drift
 * out of sync with the list.
 */
const STEPS = [
  {
    verb: 'Post',
    method: 'post_job',
    body: 'The client writes a brief, splits it into milestones and funds the whole budget up front. A GenLayer contract cannot pull funds later, so escrow is only ever as real as what arrived with the call.',
  },
  {
    verb: 'Negotiate',
    method: 'submit_proposal · counter_proposal',
    body: 'Freelancers propose at or below the budget; either side can counter. Whatever the accepted price leaves unspent is refunded to the client the moment they accept.',
  },
  {
    verb: 'Draft',
    method: 'draft_sow',
    body: 'The contract writes the Statement of Work — scope, assumptions, exclusions, and one list of checkable acceptance criteria per milestone. Permissionless, so neither side can stall it.',
  },
  {
    verb: 'Sign',
    method: 'sign_sow',
    body: 'Both parties submit the drafted text’s hash. A signature can never land against text a party was not shown, and work cannot begin until both are in.',
  },
  {
    verb: 'Deliver',
    method: 'submit_milestone',
    body: 'The freelancer submits evidence for one milestone, in order, before the deadline. Validators will fetch those URLs themselves.',
  },
  {
    verb: 'Adjudicate',
    method: 'adjudicate_milestone',
    body: 'Independent validators judge the evidence against the criteria and return a completion percentage with a per-criterion breakdown. Permissionless, so a ruling cannot be withheld.',
  },
  {
    verb: 'Settle',
    method: 'settle_milestone',
    body: 'Once the appeal window closes undisputed, anyone can settle. The escrow splits on the ruled percentage: paid plus refunded is exactly the milestone amount.',
  },
]

export default function LifecycleRail() {
  const { wrapperRef, panelRefs } = useScrollSequence<HTMLDivElement>(STEPS.length)

  return (
    <section data-tone="dark" className="bg-ink text-paper">
      <div className="mx-auto max-w-6xl px-5 pt-24 pb-10 text-center sm:px-8 sm:pt-32">
        <span className="label text-seal-400">The lifecycle</span>
        <h2 className="mt-3 font-serif text-3xl font-semibold text-paper sm:text-5xl">
          Seven steps, no middleman
        </h2>
      </div>

      <div ref={wrapperRef} className="relative" style={{ height: `${STEPS.length * 100}vh` }}>
        <div className="sticky top-0 flex h-screen items-center justify-center overflow-hidden">
          {STEPS.map((step, index) => (
            <div
              key={step.verb}
              ref={(el) => {
                panelRefs.current[index] = el
              }}
              className="absolute inset-0 flex flex-col items-center justify-center px-6 text-center opacity-0"
            >
              <span className="label tabnum mb-4 block text-seal-400">
                {String(index + 1).padStart(2, '0')} / {String(STEPS.length).padStart(2, '0')}
              </span>
              <h3 className="mb-4 font-serif text-4xl font-semibold text-paper sm:text-6xl">
                {step.verb}
              </h3>
              <code className="mb-6 font-mono text-[0.6875rem] tracking-wider text-paper/40">
                {step.method}
              </code>
              <p className="max-w-xl text-[0.95rem] leading-relaxed text-paper/60">{step.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
