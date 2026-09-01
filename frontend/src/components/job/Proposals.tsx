import { useState } from 'react'
import type { Job, Proposal } from '../../lib/types'
import { formatGen, redline, sameAddress, shortAddress, toWei, formatDateTime } from '../../lib/format'
import { Button, Field, Input, Label, Textarea } from '../ui'

/** A counter-offer only means something next to what it changed, so the
 *  approach text is shown as a redline against its parent rather than as a
 *  fresh block of prose the reader has to diff by eye. */
function Redline({ before, after }: { before: string; after: string }) {
  return (
    <p className="prose-doc text-[0.95rem]">
      {redline(before, after).map((part, index) =>
        part.kind === 'same' ? (
          <span key={index}>{part.text}</span>
        ) : (
          <span key={index} className={part.kind === 'add' ? 'redline-add' : 'redline-del'}>
            {part.text}
          </span>
        ),
      )}
    </p>
  )
}

export function ProposalList({
  job,
  proposals,
  viewer,
  onAccept,
  onCounter,
  busy,
}: {
  job: Job
  proposals: Proposal[]
  viewer?: string
  onAccept: (idx: number) => void
  onCounter: (parentIdx: number, approach: string, milestones: { title: string; amount: string }[]) => void
  busy: boolean
}) {
  const [counteringIdx, setCounteringIdx] = useState<number | null>(null)

  if (proposals.length === 0) {
    return <p className="text-sm text-ink-faint">No proposals yet.</p>
  }

  return (
    <div className="space-y-4">
      {proposals.map((proposal) => {
        const parent = proposal.parent >= 0 ? proposals[proposal.parent] : null
        const yours = sameAddress(proposal.from, viewer)
        const addressedToYou = sameAddress(proposal.to, viewer)
        const accepted = job.freelancer !== '0x0000000000000000000000000000000000000000' && job.accepted_proposal_idx === proposal.idx
        const open = job.status === 'drafting'

        return (
          <article
            key={proposal.idx}
            className={`rounded-sm border px-5 py-4 ${
              accepted ? 'border-signed-500/40 bg-signed-100/40' : 'border-rule bg-vellum/40'
            }`}
          >
            <header className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="font-mono text-[0.6875rem] text-ink-faint">#{proposal.idx}</span>
              <span className="font-mono text-[0.8125rem] text-ink">{shortAddress(proposal.from)}</span>
              {yours && <span className="font-mono text-[0.625rem] uppercase tracking-wider text-seal-500">you</span>}
              <span className="label">
                {proposal.kind === 'counter' ? `counter to #${proposal.parent}` : 'proposal'}
              </span>
              {accepted && (
                <span className="rounded-sm border border-signed-500/40 px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider text-signed-700">
                  accepted
                </span>
              )}
              <span className="ml-auto font-mono text-base tabular-nums text-ink">{formatGen(proposal.price)}</span>
            </header>

            {parent ? (
              <Redline before={parent.approach} after={proposal.approach} />
            ) : (
              <p className="prose-doc text-[0.95rem]">{proposal.approach}</p>
            )}

            <ul className="mt-3 space-y-1 border-t border-rule pt-3">
              {proposal.milestones.map((milestone, index) => (
                <li key={index} className="flex justify-between gap-4 text-sm">
                  <span className="text-ink-soft">
                    <span className="font-mono text-xs text-ink-faint">{index + 1}.</span> {milestone.title}
                  </span>
                  <span className="font-mono text-[0.8125rem] tabular-nums text-ink">{formatGen(milestone.amount)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-3 flex items-center gap-2 text-xs text-ink-faint">
              <span>{formatDateTime(proposal.created_at)}</span>
              {open && addressedToYou && (
                <div className="ml-auto flex gap-2">
                  <Button variant="ghost" onClick={() => setCounteringIdx(counteringIdx === proposal.idx ? null : proposal.idx)}>
                    Counter
                  </Button>
                  <Button variant="seal" onClick={() => onAccept(proposal.idx)} busy={busy}>
                    Accept these terms
                  </Button>
                </div>
              )}
            </div>

            {counteringIdx === proposal.idx && (
              <CounterForm
                base={proposal}
                busy={busy}
                onCancel={() => setCounteringIdx(null)}
                onSubmit={(approach, milestones) => onCounter(proposal.idx, approach, milestones)}
              />
            )}
          </article>
        )
      })}
    </div>
  )
}

function CounterForm({
  base,
  busy,
  onCancel,
  onSubmit,
}: {
  base: Proposal
  busy: boolean
  onCancel: () => void
  onSubmit: (approach: string, milestones: { title: string; amount: string }[]) => void
}) {
  const [approach, setApproach] = useState(base.approach)
  const [rows, setRows] = useState(
    base.milestones.map((m) => ({ title: m.title, gen: formatGen(m.amount, { suffix: false }) })),
  )

  let total: bigint | null = null
  try {
    total = rows.reduce((sum, row) => sum + (row.gen ? toWei(row.gen) : 0n), 0n)
  } catch {
    total = null
  }

  return (
    <div className="mt-4 border-t border-rule-strong pt-4">
      <Field label="Your counter" hint="Edited text shows to the other side as a redline against the offer you countered.">
        <Textarea rows={4} value={approach} onChange={(e) => setApproach(e.target.value)} />
      </Field>
      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              value={row.title}
              onChange={(e) => setRows((c) => c.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))}
              className="flex-1"
            />
            <Input
              value={row.gen}
              onChange={(e) =>
                setRows((c) =>
                  c.map((r, i) => (i === index ? { ...r, gen: e.target.value.replace(/[^0-9.]/g, '') } : r)),
                )
              }
              className="w-32 text-right font-mono"
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
      <div className="mt-3 flex items-center justify-between">
        <Button variant="ghost" onClick={() => setRows((c) => [...c, { title: '', gen: '' }])} disabled={rows.length >= 8}>
          + Milestone
        </Button>
        <div className="flex items-center gap-3">
          <Label>{total === null ? 'invalid' : formatGen(total)}</Label>
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            busy={busy}
            disabled={total === null || total === 0n || rows.some((r) => !r.title.trim())}
            onClick={() =>
              onSubmit(
                approach.trim(),
                rows.map((r) => ({ title: r.title, amount: toWei(r.gen).toString() })),
              )
            }
          >
            Send counter
          </Button>
        </div>
      </div>
    </div>
  )
}
