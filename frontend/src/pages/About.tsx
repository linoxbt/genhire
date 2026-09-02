import { Link } from 'react-router-dom'
import { Label } from '../components/ui'

const SECTIONS = [
  {
    head: 'Why a normal contract can’t do this',
    body: [
      'An ordinary smart contract can hold money and release it on a condition it can check: a signature, a balance, a block height. It cannot read a repository and decide whether the login page it finds there is what the brief asked for. That judgment has always had to come from outside: an oracle, an arbitrator, a platform’s support team.',
      'A GenLayer Intelligent Contract runs its own non-deterministic step. Several independent validators, often on different underlying models, each fetch the delivered work themselves and re-derive the judgment; consensus is reached on the substance of their answers rather than on identical bytes. No single model’s opinion decides anything, and there is no address anywhere with the power to overrule the outcome.',
    ],
  },
  {
    head: 'The contract drafts before it judges',
    body: [
      'Most escrow designs take the acceptance criteria as an input: one party writes them, the other agrees, and the judge is handed them later. That puts whoever writes more carefully at a permanent advantage, and it is where most real disputes actually begin, not in the delivery but in what was agreed.',
      'GenHire inverts that. The brief and the accepted proposal go in; the contract itself drafts the Statement of Work, turning vague wording into specific, individually checkable criteria, one list per milestone. Both parties then sign that exact text by its hash, so neither can be bound by a draft they were never shown, and neither wrote the standard they will be held to.',
    ],
  },
  {
    head: 'Rulings are proportions, not verdicts',
    body: [
      'Adjudication returns a completion percentage from 0 to 100, with a per-criterion breakdown showing which requirements were met and why. Escrow splits on that number: the freelancer receives amount × pct ÷ 100 and the client is refunded the rest, down to the last wei.',
      'This is the whole reason for the design. Real work lands partly done far more often than it lands cleanly failed, and a yes/no verdict forces the adjudicator to round a substantially-delivered milestone to either full payment or nothing. All-or-nothing still exists here; it is simply the 100 and 0 cases.',
    ],
  },
  {
    head: 'Scope is a question with an answer',
    body: [
      '“That was always included” against “that is new work” is the argument that ends more engagements than bad delivery does. Because the signed Statement of Work exists on chain, it is a decidable question: either party can ask the contract whether a request falls inside it.',
      'In scope means the freelancer owes it at the agreed price. Out of scope means it needs a change order: a funded amendment that adds escrow, re-drafts the whole agreement including the new work, and requires both signatures again before it is in force.',
    ],
  },
  {
    head: 'Nothing pays out instantly, and nothing gets stuck',
    body: [
      'A ruling does not move money. It opens an appeal window, during which either party can bond a percentage of the milestone and force a re-adjudication, with their stated reason handed to the next round as context, so it is a genuine second look rather than a repeat. If the percentage moves, the bond comes back; if it stands, it goes to the other party. Rounds are capped so settlement always terminates.',
      'Once the window closes undisputed, anyone at all can settle it. The same is true of returning escrow after the deadline. No step in the lifecycle depends on a counterparty still being around to co-operate, so funds can never be stranded by someone simply walking away.',
    ],
  },
]

export default function About() {
  return (
    <div className="rise mx-auto max-w-2xl">
      <header className="mb-10">
        <Label>How it works</Label>
        <h1 className="mt-3 font-serif text-4xl leading-tight font-semibold text-ink">
          Adjudication without an adjudicator
        </h1>
      </header>

      <div className="space-y-10">
        {SECTIONS.map((section) => (
          <section key={section.head}>
            <h2 className="font-serif text-2xl font-semibold text-ink">{section.head}</h2>
            <div className="prose-doc mt-3">
              {section.body.map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-12 border-t border-rule pt-8">
        <Label className="mb-3">Where the money can move</Label>
        <p className="prose-doc">
          Funds leave the contract in exactly four places, and none of them is a judging call:
          settlement of a ruled milestone, withdrawal of a brief nobody accepted, return of escrow
          after the deadline, and resolution of a dispute bond. A ruling stays economically
          reversible for as long as it can still be contested.
        </p>
        <p className="mt-6 text-sm text-ink-soft">
          Every figure in this app is read live from the contract.{' '}
          <Link to="/jobs" className="text-seal-600 underline underline-offset-4">
            See the board
          </Link>
          .
        </p>
      </section>
    </div>
  )
}
