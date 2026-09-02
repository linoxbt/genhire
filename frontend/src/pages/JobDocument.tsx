import { useCallback, useEffect, useRef, useState } from 'react'
import type { EIP1193Provider } from 'viem'
import { Link, useParams } from 'react-router-dom'
import * as api from '../lib/genhire'
import { useWallet } from '../lib/wallet'
import { useTx } from '../lib/useTx'
import { retryRead } from '../lib/tx'
import { NETWORKS, useNetwork } from '../lib/network'
import { useNow } from '../lib/useNow'
import { formatGen, formatDate, relativeTime, sameAddress, toWei } from '../lib/format'
import type { Job, Proposal, Ruling, StatementOfWork } from '../lib/types'
import { ZERO_ADDRESS } from '../lib/types'
import { Button, Callout, Label, Sheet, Skeleton, Textarea } from '../components/ui'
import { Clause, PartyLine, StatusChip, jobTitle, totalPaid } from '../components/bits'
import TxNotice from '../components/TxNotice'
import { ProposalList } from '../components/job/Proposals'
import Sow from '../components/job/Sow'
import Milestones from '../components/job/Milestones'
import Record from '../components/job/Record'

/**
 * The engagement, rendered as the instrument it is: a numbered document whose
 * clauses fill in as the deal progresses, with every action taken in place
 * rather than from a separate control panel.
 */
export default function JobDocument() {
  const { id } = useParams()
  // `/job/abc` would otherwise send NaN straight into a contract read.
  const jobId = /^\d+$/.test(id ?? '') ? Number(id) : NaN
  const validId = Number.isInteger(jobId) && jobId > 0
  const network = useNetwork()
  const now = useNow()
  const wallet = useWallet()
  const { state, run, fail, reset, busy } = useTx()

  const [job, setJob] = useState<Job | null>(null)
  const [proposals, setProposals] = useState<Proposal[]>([])
  const [rulings, setRulings] = useState<Ruling[]>([])
  const [sow, setSow] = useState<StatementOfWork | null>(null)
  const [appealWindow, setAppealWindow] = useState(48 * 3600)
  const [maxRounds, setMaxRounds] = useState(3)
  const [error, setError] = useState<string | null>(null)
  const [review, setReview] = useState('')

  const loadToken = useRef<{ cancelled: boolean }>({ cancelled: false })

  const load = useCallback(
    async (token: { cancelled: boolean } = loadToken.current) => {
      // Wrapped in retryRead because a node can lag a moment behind a write it
      // just finalized: without it the page could re-render pre-transaction
      // state directly beside the success notice.
      const [nextJob, nextProposals, nextRulings, nextSow, window, rounds] = await Promise.all([
        retryRead(() => api.getJob(jobId)),
        retryRead(() => api.getProposals(jobId)),
        retryRead(() => api.getRulings(jobId)),
        retryRead(() => api.getSow(jobId)),
        api.getAppealWindow(),
        api.getMaxDisputeRounds(),
      ])
      if (token.cancelled) return
      setJob(nextJob)
      setProposals(nextProposals)
      setRulings(nextRulings)
      setSow(nextSow)
      setAppealWindow(Number(window))
      setMaxRounds(Number(rounds))
    },
    [jobId],
  )

  useEffect(() => {
    setJob(null)
    setError(null)
    if (!validId) {
      setError(`“${id}” is not an engagement number.`)
      return
    }
    // Cancelled on unmount and on any id/network change. Without this, six
    // in-flight reads for job 1 could resolve after a navigation to job 2 and
    // paint job 1's parties and escrow under job 2's heading.
    const token = { cancelled: false }
    loadToken.current = token
    load(token).catch((err) => {
      if (token.cancelled) return
      setError(err instanceof Error ? err.message : String(err))
    })
    return () => {
      token.cancelled = true
    }
  }, [load, network, validId, id])

  const ctx = wallet.ctx

  /**
   * Runs one action, or explains why it cannot run.
   *
   * Several of these methods are permissionless, so their buttons are shown to
   * everyone - including visitors with no wallet. Guarding with `ctx && run(...)`
   * made those clicks a silent no-op; routing the missing-wallet case through
   * the same notice the user already reads for every other failure is the
   * difference between "nothing happened" and "connect a wallet to do this".
   */
  const act = (send: (context: NonNullable<typeof ctx>) => Promise<`0x${string}`>, note: string) => {
    if (!ctx) {
      fail(
        wallet.enabled
          ? 'Connect a wallet to sign this transaction.'
          : 'Wallet connection is not configured on this deployment, so this is a read-only view.',
      )
      return
    }
    if (wallet.wrongChain) {
      // Signing here would hand a transaction built for the selected network to
      // a provider sitting on a different one.
      fail(`Your wallet is on a different network than ${NETWORKS[network].label}. Switch it, then try again.`)
      wallet.switchChain()
      return
    }
    return run(() => send(ctx), { note, onDone: () => load(loadToken.current) })
  }

  if (error) {
    return (
      <Callout tone="seal">
        {error}
        <div className="mt-2">
          <Link to="/jobs" className="underline underline-offset-2">
            Back to the board
          </Link>
        </div>
      </Callout>
    )
  }

  if (!job) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-96" />
      </div>
    )
  }

  const viewer = wallet.address
  const isClient = sameAddress(job.client, viewer)
  const isFreelancer = sameAddress(job.freelancer, viewer)
  const isParty = isClient || isFreelancer
  const engaged = job.freelancer !== ZERO_ADDRESS
  const paid = totalPaid(job)
  const deadlinePassed = job.deadline * 1000 < now
  const alreadyReviewed = job.reviews.some((r) => sameAddress(r.reviewer, viewer))

  return (
    <div className="rise mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between">
        <Link to="/jobs" className="text-sm text-ink-soft hover:text-ink">
          ← The board
        </Link>
        <span className="font-mono text-[0.6875rem] text-ink-faint">Engagement № {job.id}</span>
      </div>

      <Sheet className="px-8 py-8 sm:px-12 sm:py-10">
        <header className="border-b border-rule-strong pb-6 text-center">
          <Label>Engagement instrument</Label>
          <h1 className="mt-3 font-serif text-3xl leading-tight font-semibold text-ink">{jobTitle(job)}</h1>
          <div className="mt-4 flex items-center justify-center gap-3">
            <StatusChip status={job.status} />
            {job.sow_version > 0 && (
              <span className="font-mono text-[0.625rem] uppercase tracking-wider text-ink-faint">
                SoW v{job.sow_version}
              </span>
            )}
          </div>
        </header>

        <div className="grid grid-cols-2 gap-6 border-b border-rule py-6 sm:grid-cols-4">
          <PartyLine label="Client" address={job.client} you={isClient} />
          {engaged ? (
            <PartyLine label="Freelancer" address={job.freelancer} you={isFreelancer} />
          ) : (
            <div>
              <Label className="mb-1">Freelancer</Label>
              <span className="text-sm text-ink-faint italic">not yet engaged</span>
            </div>
          )}
          <div>
            <Label className="mb-1">In escrow</Label>
            <span className="font-mono text-[0.8125rem] tabular-nums text-ink">{formatGen(job.escrow)}</span>
            {paid > 0n && (
              <span className="block font-mono text-[0.6875rem] text-ink-faint">{formatGen(paid)} settled</span>
            )}
          </div>
          <div>
            <Label className="mb-1">Deadline</Label>
            <span className="font-mono text-[0.8125rem] text-ink">{formatDate(job.deadline)}</span>
            <span className={`block font-mono text-[0.6875rem] ${deadlinePassed ? 'text-seal-600' : 'text-ink-faint'}`}>
              {relativeTime(job.deadline)}
            </span>
          </div>
        </div>

        <TxNotice state={state} onDismiss={reset} />

        <Clause n={1} title="The brief">
          <div className="prose-doc whitespace-pre-wrap">{job.brief}</div>
          <p className="mt-4 text-xs text-ink-faint">
            Posted {formatDate(job.created_at)} · funded {formatGen(job.budget)}
            {job.agreed_price !== '0' && ` · agreed at ${formatGen(job.agreed_price)}`}
          </p>
        </Clause>

        <Clause n={2} title="Proposals and counters">
          <ProposalList
            job={job}
            proposals={proposals}
            viewer={viewer}
            busy={busy}
            onAccept={(idx) => act((c) => api.acceptProposal(c, job.id, idx), 'Accepting the terms…')}
            onCounter={(parentIdx, approach, milestones) =>
              act((c) => api.counterProposal(c, job.id, parentIdx, approach, milestones), 'Sending your counter…')
            }
          />
          {job.status === 'drafting' && !isClient && wallet.isConnected && (
            <ProposeForm
              busy={busy}
              onSubmit={(approach, milestones) =>
                act((c) => api.submitProposal(c, job.id, approach, milestones), 'Submitting your proposal…')
              }
            />
          )}
          {job.status === 'drafting' && !wallet.isConnected && (
            <p className="mt-4 text-sm text-ink-faint">Connect a wallet to propose on this brief.</p>
          )}
        </Clause>

        <Clause n={3} title="Statement of work">
          <Sow
            job={job}
            sow={sow}
            viewer={viewer}
            busy={busy}
            onDraft={() =>
              act(
                (c) => api.draftSow(c, job.id),
                'The contract is drafting the agreement. Validators are writing and checking the criteria. This takes a few minutes.',
              )
            }
            onSign={() => act((c) => api.signSow(c, job.id, job.sow_hash), 'Recording your signature…')}
          />
        </Clause>

        <Clause n={4} title="Milestones and settlement">
          <Milestones
            job={job}
            viewer={viewer}
            appealWindow={appealWindow}
            maxRounds={maxRounds}
            busy={busy}
            actions={{
              // Validators read the evidence during this transaction and store
              // what they find, so delivery takes a consensus round rather than
              // being a plain state write.
              onSubmit: (index, urls, notes) =>
                act(
                  (c) => api.submitMilestone(c, job.id, index, urls, notes),
                  'Validators are reading the evidence and recording the delivery. This takes a few minutes.',
                ),
              onAdjudicate: (index) =>
                act(
                  (c) => api.adjudicateMilestone(c, job.id, index),
                  'Validators are judging the recorded evidence against the criteria. This takes a few minutes.',
                ),
              // The bond read happens inside `send` so a failure there is
              // reported like any other, rather than becoming an unhandled
              // rejection that leaves the button looking inert.
              onDispute: (index, reason) =>
                act(async (c) => {
                  const bond = BigInt(await api.getRequiredBond(job.id, index))
                  return api.disputeRuling(c, job.id, index, reason, bond)
                }, 'Bonding your dispute…'),
              onSettle: (index) =>
                act((c) => api.settleMilestone(c, job.id, index), 'Splitting the escrow on the ruling…'),
              getBond: (index) => api.getRequiredBond(job.id, index),
            }}
          />
        </Clause>

        <Clause n={5} title="Scope rulings and amendments">
          <Record
            job={job}
            rulings={rulings}
            viewer={viewer}
            busy={busy}
            onRuleScope={(request) =>
              act(
                (c) => api.ruleScope(c, job.id, request),
                'Validators are ruling on this against the signed agreement. This takes a few minutes.',
              )
            }
            onChangeOrder={(request, milestones, deadline, total) =>
              act((c) => api.openChangeOrder(c, job.id, request, milestones, deadline, total), 'Funding the amendment…')
            }
          />
        </Clause>

        {(job.reviews.length > 0 || (isParty && ['completed', 'expired'].includes(job.status))) && (
          <Clause n={6} title="Closing remarks">
            <div className="space-y-3">
              {job.reviews.map((entry, index) => (
                <blockquote key={index} className="border-l-2 border-rule-strong pl-4">
                  <p className="prose-doc text-[0.95rem] italic">“{entry.text}”</p>
                  <footer className="mt-1 font-mono text-[0.6875rem] text-ink-faint">
                    {sameAddress(entry.reviewer, job.client) ? 'the client' : 'the freelancer'}
                  </footer>
                </blockquote>
              ))}
              {isParty && !alreadyReviewed && ['completed', 'expired'].includes(job.status) && (
                <div className="space-y-2 pt-2">
                  <Textarea
                    rows={2}
                    maxLength={280}
                    value={review}
                    onChange={(e) => setReview(e.target.value)}
                    placeholder="One short, permanent note about working with the other party."
                  />
                  <div className="flex justify-end">
                    <Button
                      busy={busy}
                      disabled={!review.trim()}
                      onClick={() => act((c) => api.submitReview(c, job.id, review.trim()), 'Recording your review…')}
                    >
                      Leave it on the record
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Clause>
        )}

        <ClosingActions job={job} isClient={isClient} busy={busy} act={act} deadlinePassed={deadlinePassed} />
      </Sheet>
    </div>
  )
}

type Act = (
  send: (context: { account: `0x${string}`; provider: EIP1193Provider }) => Promise<`0x${string}`>,
  note: string,
) => void

function ClosingActions({
  job,
  isClient,
  busy,
  act,
  deadlinePassed,
}: {
  job: Job
  isClient: boolean
  busy: boolean
  act: Act
  deadlinePassed: boolean
}) {
  const canCancel = isClient && job.status === 'drafting'
  const canExpire =
    deadlinePassed &&
    BigInt(job.escrow) > 0n &&
    ['drafting', 'awaiting_sow', 'sow_drafted', 'active'].includes(job.status)
  if (!canCancel && !canExpire) return null

  return (
    <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
      {canCancel && (
        <Button variant="outline" busy={busy} onClick={() => act((c) => api.cancelJob(c, job.id), 'Withdrawing the brief…')}>
          Withdraw and refund
        </Button>
      )}
      {canExpire && (
        <>
          <Button variant="outline" busy={busy} onClick={() => act((c) => api.refundExpired(c, job.id), 'Returning the escrow…')}>
            Return the escrow
          </Button>
          <p className="text-xs text-ink-faint">
            The deadline has passed. Anyone can call this. The escrow returns to the client.
          </p>
        </>
      )}
    </div>
  )
}

function ProposeForm({
  busy,
  onSubmit,
}: {
  busy: boolean
  onSubmit: (approach: string, milestones: { title: string; amount: string }[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [approach, setApproach] = useState('')
  const [rows, setRows] = useState([{ title: '', gen: '' }])

  let total: bigint | null = null
  try {
    // parseEther, never float arithmetic - `0.1 * 1e18` does not land on a whole wei.
    total = rows.reduce((sum, row) => sum + (row.gen ? toWei(row.gen) : 0n), 0n)
  } catch {
    total = null
  }

  if (!open) {
    return (
      <div className="mt-5 border-t border-rule pt-4">
        <Button variant="seal" onClick={() => setOpen(true)}>
          Propose on this brief
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-5 space-y-3 border-t border-rule-strong pt-4">
      <Label>Your approach</Label>
      <Textarea
        rows={4}
        value={approach}
        onChange={(e) => setApproach(e.target.value)}
        placeholder="How you'd tackle it, and anything the brief left open."
      />
      <Label>Your milestone split, at or below the posted budget</Label>
      <div className="space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              value={row.title}
              onChange={(e) => setRows((c) => c.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))}
              placeholder="What this milestone delivers"
              className="w-full flex-1 rounded-sm border border-rule bg-leaf px-3 py-2 text-sm focus:border-ink focus:outline-none"
            />
            <input
              value={row.gen}
              onChange={(e) =>
                setRows((c) => c.map((r, i) => (i === index ? { ...r, gen: e.target.value.replace(/[^0-9.]/g, '') } : r)))
              }
              placeholder="0.00"
              className="w-32 rounded-sm border border-rule bg-leaf px-3 py-2 text-right font-mono text-sm focus:border-ink focus:outline-none"
            />
            <button
              onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
              disabled={rows.length === 1}
              className="px-1 text-ink-faint hover:text-seal-600 disabled:opacity-30"
              aria-label="Remove"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={() => setRows((c) => [...c, { title: '', gen: '' }])} disabled={rows.length >= 8}>
          + Milestone
        </Button>
        <div className="flex items-center gap-3">
          <Label>{total === null ? 'invalid' : formatGen(total)}</Label>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="seal"
            busy={busy}
            disabled={!approach.trim() || !total || total === 0n || rows.some((r) => !r.title.trim())}
            onClick={() =>
              onSubmit(
                approach.trim(),
                rows.map((r) => ({ title: r.title, amount: toWei(r.gen).toString() })),
              )
            }
          >
            Submit proposal
          </Button>
        </div>
      </div>
    </div>
  )
}
