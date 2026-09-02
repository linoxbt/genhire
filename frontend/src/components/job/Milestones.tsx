import { useEffect, useState } from 'react'
import type { Job, Milestone } from '../../lib/types'
import { formatGen, formatDateTime, relativeTime, sameAddress } from '../../lib/format'
import { Button, Callout, Field, Input, Label, Textarea } from '../ui'
import { LIMITS, isAcceptableEvidenceUrl } from '../../lib/limits'
import { CompletionBar, SettledStamp, milestoneWord } from '../bits'
import { useNow } from '../../lib/useNow'

export interface MilestoneActions {
  onSubmit: (index: number, urls: string[], notes: string) => void
  onAdjudicate: (index: number) => void
  onDispute: (index: number, reason: string) => void
  onSettle: (index: number) => void
  /** The exact bond this milestone needs, in wei. Read from the contract. */
  getBond: (index: number) => Promise<string>
}

export default function Milestones({
  job,
  viewer,
  appealWindow,
  maxRounds,
  actions,
  busy,
}: {
  job: Job
  viewer?: string
  appealWindow: number
  maxRounds: number
  actions: MilestoneActions
  busy: boolean
}) {
  return (
    <div className="space-y-4">
      {job.milestones.map((milestone, index) => (
        <MilestoneCard
          key={index}
          job={job}
          milestone={milestone}
          index={index}
          viewer={viewer}
          appealWindow={appealWindow}
          maxRounds={maxRounds}
          actions={actions}
          busy={busy}
        />
      ))}
    </div>
  )
}

function MilestoneCard({
  job,
  milestone,
  index,
  viewer,
  appealWindow,
  maxRounds,
  actions,
  busy,
}: {
  job: Job
  milestone: Milestone
  index: number
  viewer?: string
  appealWindow: number
  maxRounds: number
  actions: MilestoneActions
  busy: boolean
}) {
  const [panel, setPanel] = useState<'deliver' | 'dispute' | null>(null)
  const [urls, setUrls] = useState('')
  const [notes, setNotes] = useState('')
  const [reason, setReason] = useState('')
  // Read rather than recomputed: the 5% figure lives in the contract, and a
  // user should see the amount they are about to bond before they sign, not
  // after.
  const [bond, setBond] = useState<string | null>(null)

  useEffect(() => {
    if (panel !== 'dispute') return
    let cancelled = false
    setBond(null)
    actions
      .getBond(index)
      .then((value) => !cancelled && setBond(value))
      .catch(() => !cancelled && setBond(''))
    return () => {
      cancelled = true
    }
  }, [panel, index, actions])

  const isClient = sameAddress(job.client, viewer)
  const isFreelancer = sameAddress(job.freelancer, viewer)
  const isParty = isClient || isFreelancer
  const live = job.status === 'active'
  const disputeOpen = BigInt(job.dispute_bond || '0') > 0n && job.dispute_milestone === index
  const now = useNow()
  const windowCloses = milestone.ruled_at + appealWindow
  // `ruled_at` is 0 until a ruling lands, so only trust this once ruled.
  const windowClosed = milestone.status === 'ruled' && windowCloses * 1000 < now
  const previousSettled = job.milestones.slice(0, index).every((m) => m.status === 'settled')

  const evidenceUrls = urls
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  // The contract enforces both of these; checking here means the user finds out
  // now rather than through a reverted transaction.
  const evidenceProblems = [
    ...(evidenceUrls.length > LIMITS.evidenceUrls
      ? [`At most ${LIMITS.evidenceUrls} evidence URLs.`]
      : []),
    ...evidenceUrls
      .filter((url) => !isAcceptableEvidenceUrl(url))
      .map((url) => `“${url.slice(0, 60)}” must start with https://, http://, ipfs:// or ar://`),
  ]

  return (
    <article className="relative rounded-sm border border-rule bg-vellum/40 px-5 py-5">
      {milestone.status === 'settled' && (
        <div className="absolute top-4 right-5">
          <SettledStamp pct={milestone.pct} />
        </div>
      )}

      <header className="flex flex-wrap items-start gap-x-3 gap-y-1 pr-20">
        <span className="font-mono text-xs text-ink-faint tabular-nums">{index + 1}.</span>
        <h3 className="font-serif text-lg font-semibold text-ink">{milestone.title}</h3>
        <span className="ml-auto font-mono text-[0.9375rem] tabular-nums text-ink">{formatGen(milestone.amount)}</span>
      </header>

      <div className="mt-1 ml-6">
        <Label>{milestoneWord(milestone.status)}</Label>
      </div>

      {milestone.criteria.length > 0 && (
        <div className="mt-4 ml-6">
          <Label className="mb-2">Acceptance criteria, drafted by the contract</Label>
          <ul className="space-y-1.5">
            {milestone.criteria.map((criterion, criterionIndex) => {
              const result = milestone.criteria_result?.[criterionIndex]
              return (
                <li key={criterionIndex} className="grid grid-cols-[1.25rem_1fr] gap-x-1 text-[0.9375rem]">
                  <span
                    className={
                      !result ? 'text-ink-faint' : result.met ? 'text-signed-500' : 'text-seal-500'
                    }
                  >
                    {!result ? '□' : result.met ? '✓' : '✗'}
                  </span>
                  <div>
                    <span className="font-serif text-ink">{criterion}</span>
                    {result?.note && <span className="block text-xs text-ink-faint">{result.note}</span>}
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {milestone.evidence.length > 0 && (
        <div className="mt-4 ml-6">
          <Label className="mb-1.5">Delivered {formatDateTime(milestone.submitted_at)}</Label>
          <ul className="space-y-0.5">
            {milestone.evidence.map((url) => (
              <li key={url}>
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-mono text-xs break-all text-seal-600 underline underline-offset-2"
                >
                  {url}
                </a>
              </li>
            ))}
          </ul>
          {milestone.notes && <p className="mt-2 font-serif text-[0.9375rem] text-ink-soft">{milestone.notes}</p>}
        </div>
      )}

      {(milestone.status === 'ruled' || milestone.status === 'settled') && (
        <div className="mt-4 ml-6 border-t border-rule pt-4">
          <Label className="mb-2">
            Ruling{milestone.rounds > 1 ? `, round ${milestone.rounds} of ${maxRounds}` : ''}
          </Label>
          <CompletionBar pct={milestone.pct} settled={milestone.status === 'settled'} />
          <p className="mt-3 font-serif text-[0.9375rem] leading-relaxed text-ink">{milestone.reasoning}</p>
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.6875rem] text-ink-faint">
            <span>to freelancer {formatGen(String((BigInt(milestone.amount) * BigInt(milestone.pct)) / 100n))}</span>
            <span>
              refunded {formatGen(String(BigInt(milestone.amount) - (BigInt(milestone.amount) * BigInt(milestone.pct)) / 100n))}
            </span>
            {milestone.status === 'ruled' && !disputeOpen && (
              <span className={windowClosed ? 'text-signed-700' : 'text-amber-700'}>
                {windowClosed ? 'appeal window closed' : `appeal window closes ${relativeTime(windowCloses)}`}
              </span>
            )}
          </div>
        </div>
      )}

      {disputeOpen && (
        <div className="mt-4 ml-6">
          <Callout tone="seal">
            <strong className="font-medium">Contested.</strong> {formatGen(job.dispute_bond)} is bonded against this
            ruling; the next adjudication decides the bond too. If the percentage moves, the bond returns to the
            disputer. If it stands, it goes to the other party.
          </Callout>
        </div>
      )}

      {live && (
        <div className="mt-4 ml-6 flex flex-wrap items-center gap-2 border-t border-rule pt-4">
          {milestone.status === 'pending' && isFreelancer && previousSettled && (
            <Button onClick={() => setPanel(panel === 'deliver' ? null : 'deliver')}>Deliver this milestone</Button>
          )}

          {/* Adjudication and settlement are permissionless in the contract,
              precisely so a counterparty who stops responding cannot strand the
              escrow. Gating them behind `isParty` here re-imposed the failure
              the design removes. */}
          {milestone.status === 'submitted' && (
            <Button variant="seal" onClick={() => actions.onAdjudicate(index)} busy={busy}>
              {disputeOpen ? 'Re-adjudicate' : 'Request adjudication'}
            </Button>
          )}
          {milestone.status === 'ruled' && !disputeOpen && windowClosed && (
            <Button variant="seal" onClick={() => actions.onSettle(index)} busy={busy}>
              Settle: split {milestone.pct}/{100 - milestone.pct}
            </Button>
          )}
          {!isParty && (milestone.status === 'submitted' || (milestone.status === 'ruled' && windowClosed)) && (
            <span className="text-xs text-ink-faint">Anyone can do this. It cannot be withheld.</span>
          )}

          {milestone.status === 'ruled' && !disputeOpen && !windowClosed && milestone.rounds < maxRounds && isParty && (
            <Button variant="outline" onClick={() => setPanel(panel === 'dispute' ? null : 'dispute')}>
              Dispute this ruling
            </Button>
          )}
        </div>
      )}

      {panel === 'deliver' && (
        <div className="mt-4 ml-6 space-y-3 border-t border-rule-strong pt-4">
          <Field label="Evidence" hint="One URL per line. Validators fetch each of these themselves at adjudication.">
            <Textarea
              rows={3}
              value={urls}
              onChange={(e) => setUrls(e.target.value)}
              placeholder={'https://github.com/you/repo\nhttps://your-app.example.com'}
              className="font-mono text-xs"
            />
          </Field>
          <Field label="Note to the adjudicator" hint="Optional. Treated as a claim to verify, never as an instruction.">
            <Input value={notes} maxLength={LIMITS.notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
          {evidenceProblems.length > 0 && urls.trim().length > 0 && (
            <Callout tone="amber">
              <ul className="list-inside list-disc space-y-0.5">
                {evidenceProblems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Callout>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button
              variant="seal"
              busy={busy}
              disabled={evidenceUrls.length === 0 || evidenceProblems.length > 0}
              onClick={() => actions.onSubmit(index, evidenceUrls, notes.trim())}
            >
              Submit delivery
            </Button>
          </div>
        </div>
      )}

      {panel === 'dispute' && (
        <div className="mt-4 ml-6 space-y-3 border-t border-rule-strong pt-4">
          <Field
            label="Why this ruling is wrong"
            hint="Given to the next adjudication as context, so it is a genuine second look rather than a repeat."
          >
            <Textarea rows={3} maxLength={LIMITS.reason} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <Callout tone="amber">
            {bond === null
              ? 'Reading the required bond from the contract…'
              : bond === ''
                ? 'The required bond could not be read just now. Submitting will still use the contract’s own figure.'
                : `Disputing bonds ${formatGen(bond)}. You get it back only if the percentage changes.`}
          </Callout>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setPanel(null)}>
              Cancel
            </Button>
            <Button variant="seal" busy={busy} disabled={!reason.trim()} onClick={() => actions.onDispute(index, reason.trim())}>
              Bond and dispute
            </Button>
          </div>
        </div>
      )}
    </article>
  )
}
