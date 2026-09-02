import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Job, JobStatus, Milestone, MilestoneStatus } from '../lib/types'
import { shortAddress } from '../lib/format'
import { Mono } from './ui'

const JOB_TONES: Record<JobStatus, string> = {
  drafting: 'border-seal-200 bg-seal-50 text-seal-700',
  awaiting_sow: 'border-amber-500/30 bg-amber-100 text-amber-700',
  sow_drafted: 'border-amber-500/30 bg-amber-100 text-amber-700',
  active: 'border-ink/15 bg-vellum text-ink',
  completed: 'border-signed-500/30 bg-signed-100 text-signed-700',
  cancelled: 'border-rule bg-vellum text-ink-faint',
  expired: 'border-rule bg-vellum text-ink-faint',
}

const JOB_WORDS: Record<JobStatus, string> = {
  drafting: 'Taking proposals',
  awaiting_sow: 'Awaiting drafting',
  sow_drafted: 'Awaiting signature',
  active: 'In force',
  completed: 'Completed',
  cancelled: 'Withdrawn',
  expired: 'Expired',
}

export function StatusChip({ status }: { status: JobStatus }) {
  return (
    <span className={`inline-block rounded-sm border px-2 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider ${JOB_TONES[status]}`}>
      {JOB_WORDS[status]}
    </span>
  )
}

const MILESTONE_WORDS: Record<MilestoneStatus, string> = {
  pending: 'Not yet delivered',
  submitted: 'Awaiting adjudication',
  ruled: 'Ruled',
  settled: 'Settled',
}

export const milestoneWord = (status: MilestoneStatus) => MILESTONE_WORDS[status]

/** The completion percentage, drawn as a filled measure rather than a number
 *  alone - the whole point is that it is a proportion, not a verdict.
 *
 *  The remainder is hatched rather than left blank or filled in a second
 *  colour: hatching reads as "the part that was not earned" (and went back to
 *  the client), where a second solid colour would read as a rival quantity. */
export function CompletionBar({ pct, settled = false }: { pct: number; settled?: boolean }) {
  const tone = pct >= 90 ? 'bg-signed-500' : pct >= 40 ? 'bg-amber-500' : 'bg-seal-500'
  return (
    <div className="flex items-center gap-3">
      <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-vellum">
        <div className="hatch-corridor absolute inset-y-0 right-0" style={{ left: `${pct}%` }} />
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ${tone}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <Mono className={`tabnum ${settled ? 'text-ink' : 'text-ink-soft'}`}>{pct}%</Mono>
    </div>
  )
}

/** A wax-seal style stamp for a settled milestone. */
export function SettledStamp({ pct }: { pct: number }) {
  return (
    <div className="stamp pointer-events-none select-none">
      <div className="flex h-16 w-16 -rotate-5 flex-col items-center justify-center rounded-full border-2 border-seal-500/45 text-seal-500/80">
        <span className="font-mono text-sm font-medium leading-none">{pct}%</span>
        <span className="mt-0.5 font-mono text-[0.5rem] uppercase tracking-[0.14em]">settled</span>
      </div>
    </div>
  )
}

export function PartyLine({ label, address, you }: { label: string; address: string; you?: boolean }) {
  return (
    <div>
      <div className="label mb-1">{label}</div>
      <Link to={`/profile/${address}`} className="font-mono text-[0.8125rem] text-ink hover:text-seal-600 hover:underline">
        {shortAddress(address)}
      </Link>
      {you && <span className="ml-2 font-mono text-[0.625rem] uppercase tracking-wider text-seal-500">you</span>}
    </div>
  )
}

export function Clause({ n, title, children }: { n: number | string; title: string; children: ReactNode }) {
  return (
    <section className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-t border-rule py-6 first:border-t-0">
      <div className="pt-0.5 font-mono text-xs text-ink-faint tabular-nums">{n}.</div>
      <div>
        <h3 className="mb-3 font-serif text-lg font-semibold text-ink">{title}</h3>
        {children}
      </div>
    </section>
  )
}

export function jobTitle(job: Job): string {
  const firstLine = job.brief.trim().split('\n')[0]
  return firstLine.length > 90 ? `${firstLine.slice(0, 88)}…` : firstLine
}

export const totalPaid = (job: Job): bigint =>
  job.milestones.reduce((sum: bigint, m: Milestone) => sum + BigInt(m.paid || '0'), 0n)
