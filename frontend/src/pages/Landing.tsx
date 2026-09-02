import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllJobs } from '../lib/genhire'
import { isDeployed, useNetwork } from '../lib/network'
import { formatGen } from '../lib/format'
import type { Job } from '../lib/types'
import Splash from '../components/landing/Splash'
import Hero from '../components/landing/Hero'
import ClauseZero from '../components/landing/ClauseZero'
import LifecycleRail from '../components/landing/LifecycleRail'
import MechanicsShowcase from '../components/landing/MechanicsShowcase'

interface Stats {
  jobs: number
  escrowed: bigint
  paid: bigint
  settled: number
  partial: number
}

/** `null` while loading, `false` once we know we could not read the chain. */
function useStats(): Stats | null | false {
  const [state, setState] = useState<Stats | null | false>(null)
  const network = useNetwork()

  useEffect(() => {
    setState(null)
    if (!isDeployed()) return setState(false)
    let cancelled = false
    getAllJobs()
      .then((jobs: Job[]) => {
        if (cancelled) return
        const settled = jobs.flatMap((job) => job.milestones).filter((m) => m.status === 'settled')
        setState({
          jobs: jobs.length,
          escrowed: jobs.reduce((sum, job) => sum + BigInt(job.escrow || '0'), 0n),
          paid: settled.reduce((sum, m) => sum + BigInt(m.paid || '0'), 0n),
          settled: settled.length,
          partial: settled.filter((m) => m.pct > 0 && m.pct < 100).length,
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.error('GenHire: could not read protocol stats', err)
        setState(false)
      })
    return () => {
      cancelled = true
    }
    // Keyed on the network: these figures are per-chain, and without this the
    // headline numbers keep showing whichever network was selected at mount.
  }, [network])

  return state
}

/**
 * The live figures, or an honest statement that they could not be read.
 *
 * Never a zero and never a placeholder number: a fabricated figure on a page
 * about verifiable settlement would undercut the entire argument.
 */
function StatBar() {
  const stats = useStats()

  return (
    <section className="border-t border-rule bg-paper">
      <div className="tabnum mx-auto flex max-w-6xl flex-wrap gap-x-8 gap-y-2 px-5 py-6 font-mono text-[0.75rem] text-ink-faint sm:px-8">
        {stats === null && <span>reading the contract…</span>}
        {stats === false && <span>live figures unavailable, the network is not answering right now</span>}
        {stats && stats.jobs === 0 && <span>no engagements posted on this network yet</span>}
        {stats && stats.jobs > 0 && (
          <>
            <span>{formatGen(stats.escrowed)} in escrow</span>
            <span>·</span>
            <span>{formatGen(stats.paid)} settled</span>
            <span>·</span>
            <span>
              {stats.partial} of {stats.settled} settlements were partial
            </span>
            <span>·</span>
            <span>
              {stats.jobs} engagement{stats.jobs === 1 ? '' : 's'}
            </span>
          </>
        )}
      </div>
    </section>
  )
}

/** Where money can move: the four places, stated plainly. */
const SETTLEMENT_POINTS = [
  'A milestone settles on its ruled percentage, once its appeal window closes undisputed.',
  'A client withdraws a brief nobody was engaged on, and is refunded in full.',
  'The deadline passes with work outstanding, and whatever is escrowed returns to the client.',
  'A dispute resolves, and its bond goes to whichever party the re-adjudication proved right.',
]

export default function Landing() {
  return (
    <>
      <Splash />
      <Hero />
      <ClauseZero />
      <LifecycleRail />
      <MechanicsShowcase />

      <section className="border-t border-rule bg-paper">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-24">
          <div className="grid items-start gap-x-12 gap-y-8 lg:grid-cols-[1fr_1.4fr]">
            <div>
              <span className="label mb-2 block text-seal-500">Where money can move</span>
              <h2 className="max-w-xs font-serif text-2xl font-semibold text-ink sm:text-3xl">
                Four places, none of them a judging call.
              </h2>
            </div>
            <ol className="grid gap-4 sm:grid-cols-2">
              {SETTLEMENT_POINTS.map((point, index) => (
                <li key={point} className="border border-rule p-4">
                  <span className="label tabnum text-seal-500">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">{point}</p>
                </li>
              ))}
            </ol>
          </div>
          <p className="mt-8 max-w-2xl text-sm text-ink-faint">
            A ruling never pays out on landing. It opens an appeal window first, so the losing side
            still has a bonded way to contest it. Every terminal state is permissionlessly reachable,
            so escrow can never be stranded by a counterparty who walks away.
          </p>
        </div>
      </section>

      <StatBar />

      <section className="border-t border-rule bg-paper">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-6 px-5 py-14 sm:px-8 sm:py-20">
          <h2 className="max-w-md font-serif text-2xl font-semibold text-ink sm:text-3xl">
            Write the brief. The contract will write the agreement.
          </h2>
          <Link
            to="/post"
            className="shrink-0 rounded-sm bg-seal-500 px-5 py-3 font-mono text-xs tracking-wider text-white uppercase transition-colors hover:bg-seal-600"
          >
            Post a brief →
          </Link>
        </div>
      </section>
    </>
  )
}
