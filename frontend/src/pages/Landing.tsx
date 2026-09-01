import { Link } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getAllJobs } from '../lib/genhire'
import { isDeployed } from '../lib/network'
import { formatGen } from '../lib/format'
import type { Job } from '../lib/types'
import { Button, Label } from '../components/ui'

function useStats() {
  const [jobs, setJobs] = useState<Job[] | null>(null)
  useEffect(() => {
    if (!isDeployed()) return setJobs([])
    getAllJobs().then(setJobs).catch(() => setJobs([]))
  }, [])
  if (!jobs) return null
  const settled = jobs.flatMap((j) => j.milestones).filter((m) => m.status === 'settled')
  const paid = settled.reduce((sum, m) => sum + BigInt(m.paid || '0'), 0n)
  const escrowed = jobs.reduce((sum, j) => sum + BigInt(j.escrow || '0'), 0n)
  const partial = settled.filter((m) => m.pct > 0 && m.pct < 100).length
  return { jobs: jobs.length, paid, escrowed, partial, settled: settled.length }
}

export default function Landing() {
  const stats = useStats()
  return (
    <div className="rise">
      <section className="mx-auto max-w-3xl pt-6 pb-14 text-center">
        <Label>An engagement marketplace on GenLayer</Label>
        <h1 className="mt-5 font-serif text-5xl leading-[1.08] font-semibold tracking-tight text-ink sm:text-6xl">
          The contract writes
          <br />
          <span className="italic text-seal-500">the contract.</span>
        </h1>
        <p className="mx-auto mt-6 max-w-xl text-[1.0625rem] leading-relaxed text-ink-soft">
          A client posts a brief and funds it. A freelancer proposes terms. When both accept, the Intelligent Contract
          drafts the binding Statement of Work itself — and every question after that is ruled on against the text it
          wrote.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/post">
            <Button variant="seal">Post a brief</Button>
          </Link>
          <Link to="/jobs">
            <Button variant="outline">Browse the board</Button>
          </Link>
        </div>
      </section>

      <section className="grid gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-3">
        {[
          {
            head: 'It drafts the terms',
            body:
              'Not a rubric one side typed and the other agreed to under protest. The contract turns the brief and the accepted proposal into specific, individually checkable acceptance criteria — then both parties sign that exact text before any work starts.',
          },
          {
            head: 'It pays proportionally',
            body:
              'Real work lands partly done far more often than it lands cleanly failed. Adjudication returns a completion percentage with a per-criterion breakdown, and escrow splits on it. All-or-nothing is just the 100 or 0 case.',
          },
          {
            head: 'It rules on scope',
            body:
              '“That was always included” against “that is new work” is the argument that ends engagements. Here it is a question with an on-chain answer: in scope, and it is owed; out of scope, and it needs a funded change order.',
          },
        ].map((card) => (
          <article key={card.head} className="bg-leaf p-7">
            <h2 className="font-serif text-xl font-semibold text-ink">{card.head}</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{card.body}</p>
          </article>
        ))}
      </section>

      {stats && stats.jobs > 0 && (
        <section className="mt-10 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-4">
          {[
            ['Engagements', String(stats.jobs)],
            ['Held in escrow', formatGen(stats.escrowed)],
            ['Settled to date', formatGen(stats.paid)],
            ['Partial settlements', `${stats.partial} of ${stats.settled}`],
          ].map(([label, value]) => (
            <div key={label} className="bg-leaf px-5 py-6 text-center">
              <div className="font-mono text-xl tabular-nums text-ink">{value}</div>
              <Label className="mt-1.5">{label}</Label>
            </div>
          ))}
        </section>
      )}

      <section className="mt-14 grid gap-10 md:grid-cols-[1fr_1.1fr]">
        <div>
          <Label>The lifecycle</Label>
          <h2 className="mt-3 font-serif text-3xl font-semibold text-ink">
            Seven steps, none of them a middleman
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-ink-soft">
            No arbitrator, no escrow agent, no platform holding the money. GenLayer validators independently fetch the
            delivered work and re-derive every judgment; the funds sit in the contract until the answer is in and its
            appeal window has closed.
          </p>
          <Link to="/about" className="mt-5 inline-block text-sm text-seal-600 underline underline-offset-4">
            How adjudication actually works →
          </Link>
        </div>
        <ol className="space-y-0">
          {[
            ['Post', 'The client writes a brief, splits it into milestones and funds the lot up front.'],
            ['Negotiate', 'Freelancers propose; either side counters. The unspent budget refunds on acceptance.'],
            ['Draft', 'The contract writes the Statement of Work — scope, assumptions, exclusions, criteria.'],
            ['Sign', 'Both parties sign that exact text by its hash. Work cannot start until they have.'],
            ['Deliver', 'The freelancer submits evidence for a milestone, in order.'],
            ['Adjudicate', 'Validators fetch it, judge each criterion, and return a completion percentage.'],
            ['Settle', 'After the appeal window, anyone can settle. Escrow splits on the percentage.'],
          ].map(([head, body], index) => (
            <li key={head} className="grid grid-cols-[2rem_1fr] gap-x-3 border-t border-rule py-3.5 first:border-t-0">
              <span className="pt-0.5 font-mono text-xs text-ink-faint tabular-nums">{index + 1}.</span>
              <div>
                <span className="font-serif text-base font-semibold text-ink">{head}</span>
                <span className="text-sm text-ink-soft"> — {body}</span>
              </div>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
