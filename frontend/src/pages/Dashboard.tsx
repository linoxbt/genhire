import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getJobsFor } from '../lib/genhire'
import { useWallet } from '../lib/wallet'
import { useNetwork, isDeployed } from '../lib/network'
import { formatGen, relativeTime, sameAddress } from '../lib/format'
import type { Job } from '../lib/types'
import { Button, Callout, EmptyState, Label, Skeleton } from '../components/ui'
import { StatusChip, jobTitle } from '../components/bits'

/** Everything waiting on you, and everything you're party to. */
export default function Dashboard() {
  const wallet = useWallet()
  const network = useNetwork()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [failed, setFailed] = useState(false)

  const address = wallet.address

  useEffect(() => {
    setJobs(null)
    setFailed(false)
    // Nothing to look up without an address; the connect prompt renders below.
    if (!address) return
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

  if (!wallet.isConnected) {
    return (
      <EmptyState
        title="Connect a wallet"
        body="Your engagements are looked up by address — there is no account to sign in to."
        action={
          <Button onClick={wallet.connect} disabled={!wallet.enabled}>
            {wallet.enabled ? 'Connect wallet' : 'Wallet connection is not configured'}
          </Button>
        }
      />
    )
  }

  if (failed) {
    return (
      <Callout tone="seal">
        <strong className="font-medium">Couldn’t read your engagements.</strong>
        <p className="mt-0.5">
          The network didn’t answer. This says nothing about what you have on chain — reload to try
          again.
        </p>
      </Callout>
    )
  }

  if (!jobs) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }

  const mine = jobs.filter((job) => sameAddress(job.client, wallet.address) || sameAddress(job.freelancer, wallet.address))
  const waiting = mine.filter((job) => actionFor(job, wallet.address) !== null)
  const escrowed = mine.reduce((sum, job) => sum + BigInt(job.escrow), 0n)

  return (
    <div className="rise">
      <header className="mb-7">
        <Label>Your engagements</Label>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">
          {mine.length} engagement{mine.length === 1 ? '' : 's'}
          {escrowed > 0n && (
            <span className="ml-3 font-mono text-base font-normal text-ink-soft">{formatGen(escrowed)} in escrow</span>
          )}
        </h1>
      </header>

      {waiting.length > 0 && (
        <section className="mb-9">
          <Label className="mb-3">Waiting on you</Label>
          <ul className="space-y-2">
            {waiting.map((job) => (
              <li key={job.id}>
                <Link
                  to={`/job/${job.id}`}
                  className="flex items-center gap-4 rounded-sm border border-seal-200 bg-seal-50 px-5 py-3.5 transition-colors hover:bg-seal-100"
                >
                  <span className="font-mono text-[0.6875rem] text-seal-700">№ {job.id}</span>
                  <span className="min-w-0 flex-1 truncate font-serif text-[0.9375rem] text-ink">{jobTitle(job)}</span>
                  <span className="shrink-0 text-sm font-medium text-seal-700">{actionFor(job, wallet.address)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {mine.length === 0 ? (
        <EmptyState
          title="Nothing yet"
          body="Post a brief, or propose on one from the board."
          action={
            <Link to="/post">
              <Button variant="seal">Post a brief</Button>
            </Link>
          }
        />
      ) : (
        <ul className="space-y-2">
          {mine.map((job) => (
            <li key={job.id}>
              <Link to={`/job/${job.id}`} className="sheet flex flex-wrap items-center gap-x-4 gap-y-2 rounded-sm px-5 py-4">
                <span className="font-mono text-[0.6875rem] text-ink-faint">№ {job.id}</span>
                <StatusChip status={job.status} />
                <span className="min-w-0 flex-1 truncate font-serif text-[0.9375rem] text-ink">{jobTitle(job)}</span>
                <span className="font-mono text-[0.6875rem] text-ink-faint">
                  {sameAddress(job.client, wallet.address) ? 'as client' : 'as freelancer'}
                </span>
                <span className="font-mono text-[0.8125rem] tabular-nums text-ink">{formatGen(job.escrow)}</span>
                <span className="font-mono text-[0.6875rem] text-ink-faint">{relativeTime(job.deadline)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The single next thing this address can do, or null if the ball is elsewhere. */
function actionFor(job: Job, viewer?: string): string | null {
  const isClient = sameAddress(job.client, viewer)
  const isFreelancer = sameAddress(job.freelancer, viewer)

  if (job.status === 'drafting' && isClient && job.proposal_count > 0) return 'Proposals to review'
  if (job.status === 'awaiting_sow') return 'Trigger drafting'
  if (job.status === 'sow_drafted') {
    if (isClient && !job.client_signed) return 'Sign the agreement'
    if (isFreelancer && !job.freelancer_signed) return 'Sign the agreement'
    return null
  }
  if (job.status === 'active') {
    const next = job.milestones.findIndex((m) => m.status !== 'settled')
    if (next === -1) return null
    const milestone = job.milestones[next]
    if (milestone.status === 'pending' && isFreelancer) return 'Deliver the next milestone'
    if (milestone.status === 'submitted') return 'Request adjudication'
    if (milestone.status === 'ruled') return 'Ready to settle'
  }
  return null
}
