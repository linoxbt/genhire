import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllJobs } from '../lib/genhire'
import { isDeployed, useNetwork } from '../lib/network'
import { formatGen, relativeTime } from '../lib/format'
import type { Job, JobStatus } from '../lib/types'
import { Button, EmptyState, Label, Skeleton } from '../components/ui'
import { StatusChip, jobTitle } from '../components/bits'

const FILTERS: { key: 'open' | 'live' | 'closed' | 'all'; label: string; match: (s: JobStatus) => boolean }[] = [
  { key: 'open', label: 'Taking proposals', match: (s) => s === 'drafting' },
  { key: 'live', label: 'In progress', match: (s) => ['awaiting_sow', 'sow_drafted', 'active'].includes(s) },
  { key: 'closed', label: 'Closed', match: (s) => ['completed', 'cancelled', 'expired'].includes(s) },
  { key: 'all', label: 'Everything', match: () => true },
]

export default function Board() {
  const network = useNetwork()
  const [jobs, setJobs] = useState<Job[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('open')

  useEffect(() => {
    setJobs(null)
    setError(null)
    if (!isDeployed()) {
      setJobs([])
      return
    }
    let cancelled = false
    getAllJobs()
      .then((result) => !cancelled && setJobs(result))
      .catch((err) => !cancelled && setError(err instanceof Error ? err.message : String(err)))
    return () => {
      cancelled = true
    }
  }, [network])

  const shown = useMemo(() => {
    const match = FILTERS.find((f) => f.key === filter)!.match
    return (jobs ?? []).filter((job) => match(job.status))
  }, [jobs, filter])

  return (
    <div className="rise">
      <header className="mb-7 flex flex-wrap items-end justify-between gap-4">
        <div>
          <Label>The board</Label>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">Open briefs</h1>
        </div>
        <Link to="/post">
          <Button variant="seal">Post a brief</Button>
        </Link>
      </header>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-rule pb-3">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`rounded-sm px-3 py-1.5 text-sm transition-colors ${
              filter === f.key ? 'bg-vellum font-medium text-ink' : 'text-ink-soft hover:text-ink'
            }`}
          >
            {f.label}
            {jobs && <span className="ml-1.5 font-mono text-[0.6875rem] text-ink-faint">{jobs.filter((j) => f.match(j.status)).length}</span>}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-sm border border-seal-200 bg-seal-50 px-4 py-3 text-sm text-seal-700">{error}</div>
      )}

      {!jobs && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
      )}

      {jobs && shown.length === 0 && !error && (
        <EmptyState
          title="Nothing here yet"
          body={
            isDeployed()
              ? 'No engagement on this network matches that filter. Posting a brief is the first step.'
              : 'GenHire is not deployed on this network yet. Switch networks in the header.'
          }
          action={
            <Link to="/post">
              <Button variant="seal">Post a brief</Button>
            </Link>
          }
        />
      )}

      <ul className="space-y-3">
        {shown.map((job) => (
          <li key={job.id}>
            <Link
              to={`/job/${job.id}`}
              className="sheet block rounded-sm px-6 py-5 transition-shadow hover:shadow-[0_2px_4px_rgb(28_26_23/0.06),0_18px_40px_-22px_rgb(28_26_23/0.3)]"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[0.6875rem] text-ink-faint">№ {job.id}</span>
                    <StatusChip status={job.status} />
                  </div>
                  <h2 className="mt-2 font-serif text-lg leading-snug font-medium text-ink">{jobTitle(job)}</h2>
                  <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{job.brief}</p>
                </div>
                <div className="text-right">
                  <div className="font-mono text-base tabular-nums text-ink">{formatGen(job.escrow)}</div>
                  <Label className="mt-1">in escrow</Label>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-rule pt-3 text-xs text-ink-faint">
                <span>
                  {job.milestones.length} milestone{job.milestones.length === 1 ? '' : 's'}
                </span>
                {job.status === 'drafting' && (
                  <span>
                    {job.proposal_count} proposal{job.proposal_count === 1 ? '' : 's'}
                  </span>
                )}
                {job.sow_version > 0 && <span>SoW v{job.sow_version}</span>}
                <span className="ml-auto">Deadline {relativeTime(job.deadline)}</span>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
