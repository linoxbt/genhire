import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getJobsFor } from '../lib/genhire'
import { isDeployed, useNetwork } from '../lib/network'
import { formatGen, sameAddress, shortAddress, formatDate } from '../lib/format'
import type { Job } from '../lib/types'
import { Callout, EmptyState, Label, Skeleton } from '../components/ui'
import { CompletionBar, StatusChip, jobTitle } from '../components/bits'

/**
 * An address's record, derived entirely from settled milestones. There is no
 * reputation score to game here - the only numbers shown are ones the contract
 * already ruled and paid out on.
 */
export default function Profile() {
  const { address = '' } = useParams()
  const network = useNetwork()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setJobs(null)
    setFailed(false)
    if (!isDeployed()) return setJobs([])
    let cancelled = false
    getJobsFor(address)
      .then((result) => !cancelled && setJobs(result))
      // An RPC failure is not "you have nothing". Coercing it to an empty list
      // told a client with live escrow that they had no engagements.
      .catch((err) => {
        if (cancelled) return
        console.error('GenHire: could not read jobs', err)
        setFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [network, address])

  if (failed) {
    return (
      <Callout tone="seal">
        <strong className="font-medium">Couldn’t read this address’s record.</strong>
        <p className="mt-0.5">
          The network didn’t answer. An unread record is not an empty one — reload to try again.
        </p>
      </Callout>
    )
  }

  if (!jobs) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  const asClient = jobs.filter((job) => sameAddress(job.client, address))
  const asFreelancer = jobs.filter((job) => sameAddress(job.freelancer, address))
  const involved = [...new Set([...asClient, ...asFreelancer])].sort((a, b) => b.id - a.id)

  const settled = asFreelancer.flatMap((job) => job.milestones).filter((m) => m.status === 'settled')
  const earned = settled.reduce((sum, m) => sum + BigInt(m.paid || '0'), 0n)
  const averagePct = settled.length
    ? Math.round(settled.reduce((sum, m) => sum + m.pct, 0) / settled.length)
    : null
  const clean = settled.filter((m) => m.pct === 100).length
  const reviews = jobs.flatMap((job) => job.reviews).filter((review) => sameAddress(review.subject, address))

  return (
    <div className="rise mx-auto max-w-3xl">
      <header className="mb-8">
        <Label>Record of</Label>
        <h1 className="mt-2 font-mono text-2xl break-all text-ink">{address}</h1>
        <p className="mt-1 text-sm text-ink-faint">{shortAddress(address)}</p>
      </header>

      {settled.length > 0 && (
        <section className="mb-9 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-4">
          {[
            ['Milestones delivered', String(settled.length)],
            ['Delivered in full', `${clean} of ${settled.length}`],
            ['Average completion', averagePct === null ? '—' : `${averagePct}%`],
            ['Earned', formatGen(earned)],
          ].map(([label, value]) => (
            <div key={label} className="bg-leaf px-4 py-5 text-center">
              <div className="font-mono text-lg tabular-nums text-ink">{value}</div>
              <Label className="mt-1">{label}</Label>
            </div>
          ))}
        </section>
      )}

      {settled.length > 0 && (
        <section className="mb-9">
          <Label className="mb-3">Every ruling, in order</Label>
          <ul className="space-y-2">
            {settled.map((milestone, index) => (
              <li key={index} className="rounded-sm border border-rule bg-vellum/40 px-5 py-3">
                <div className="flex items-baseline justify-between gap-4">
                  <span className="font-serif text-[0.9375rem] text-ink">{milestone.title}</span>
                  <span className="font-mono text-xs text-ink-faint">{formatDate(milestone.settled_at)}</span>
                </div>
                <div className="mt-2">
                  <CompletionBar pct={milestone.pct} settled />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reviews.length > 0 && (
        <section className="mb-9">
          <Label className="mb-3">What counterparties said</Label>
          <div className="space-y-3">
            {reviews.map((review, index) => (
              <blockquote key={index} className="border-l-2 border-rule-strong pl-4">
                <p className="prose-doc text-[0.95rem] italic">“{review.text}”</p>
                <footer className="mt-1 font-mono text-[0.6875rem] text-ink-faint">
                  {shortAddress(review.reviewer)} · {formatDate(review.at)}
                </footer>
              </blockquote>
            ))}
          </div>
        </section>
      )}

      <section>
        <Label className="mb-3">Engagements</Label>
        {involved.length === 0 ? (
          <EmptyState title="Nothing on record" body="This address has not been party to an engagement on this network." />
        ) : (
          <ul className="space-y-2">
            {involved.map((job) => (
              <li key={job.id}>
                <Link to={`/job/${job.id}`} className="sheet flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm px-5 py-3.5">
                  <span className="font-mono text-[0.6875rem] text-ink-faint">№ {job.id}</span>
                  <StatusChip status={job.status} />
                  <span className="min-w-0 flex-1 truncate font-serif text-[0.9375rem] text-ink">{jobTitle(job)}</span>
                  <span className="font-mono text-[0.6875rem] text-ink-faint">
                    {sameAddress(job.client, address) ? 'as client' : 'as freelancer'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
