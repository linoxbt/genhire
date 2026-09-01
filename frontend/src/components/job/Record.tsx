import { useState } from 'react'
import type { Job, Ruling } from '../../lib/types'
import { formatGen, formatDateTime, shortAddress, sameAddress, toWei } from '../../lib/format'
import { Button, Callout, Field, Input, Label, Textarea } from '../ui'

/**
 * The running record of everything the contract has ruled on, plus the two
 * actions that write to it. Scope rulings and amendments live together because
 * they are two answers to the same question - is this new work covered, and if
 * not, what does covering it cost.
 */
export default function Record({
  job,
  rulings,
  viewer,
  onRuleScope,
  onChangeOrder,
  busy,
}: {
  job: Job
  rulings: Ruling[]
  viewer?: string
  onRuleScope: (request: string) => void
  onChangeOrder: (request: string, milestones: { title: string; amount: string }[], deadline: number, total: bigint) => void
  busy: boolean
}) {
  const [panel, setPanel] = useState<'scope' | 'amend' | null>(null)
  const isClient = sameAddress(job.client, viewer)
  const isParty = isClient || sameAddress(job.freelancer, viewer)
  const scopeRecord = rulings.filter((r) => r.kind === 'scope' || r.kind === 'change_order' || r.kind === 'dispute')
  const canAmend = isClient && (job.status === 'active' || job.status === 'completed')

  return (
    <div>
      {scopeRecord.length === 0 && <p className="text-sm text-ink-faint">Nothing has been contested or amended.</p>}

      <ol className="space-y-3">
        {scopeRecord.map((ruling, index) => (
          <li key={index} className="rounded-sm border border-rule bg-vellum/40 px-5 py-4">
            {ruling.kind === 'scope' && (
              <>
                <header className="mb-2 flex flex-wrap items-center gap-x-3">
                  <Label>Scope ruling</Label>
                  <span
                    className={`rounded-sm border px-1.5 py-0.5 font-mono text-[0.625rem] uppercase tracking-wider ${
                      ruling.ruling === 'IN_SCOPE'
                        ? 'border-signed-500/40 bg-signed-100 text-signed-700'
                        : 'border-seal-200 bg-seal-50 text-seal-700'
                    }`}
                  >
                    {ruling.ruling === 'IN_SCOPE' ? 'in scope' : 'out of scope'}
                  </span>
                  <span className="ml-auto font-mono text-[0.6875rem] text-ink-faint">
                    asked by {shortAddress(ruling.by)} · {formatDateTime(ruling.at)}
                  </span>
                </header>
                <p className="prose-doc text-[0.95rem] italic">“{ruling.request}”</p>
                <p className="mt-2 text-sm text-ink-soft">{ruling.reasoning}</p>
                <p className="mt-2 text-xs text-ink-faint">
                  {ruling.ruling === 'IN_SCOPE'
                    ? 'Already covered by the signed agreement — owed at the agreed price.'
                    : 'Not covered — new work needs a funded change order.'}
                </p>
              </>
            )}

            {ruling.kind === 'change_order' && (
              <>
                <header className="mb-2 flex flex-wrap items-center gap-x-3">
                  <Label>Amendment — supersedes v{ruling.sow_version}</Label>
                  <span className="ml-auto font-mono text-[0.8125rem] tabular-nums text-ink">
                    + {formatGen(ruling.added)}
                  </span>
                </header>
                <p className="prose-doc text-[0.95rem] italic">“{ruling.request}”</p>
                <ul className="mt-2 space-y-0.5">
                  {ruling.milestones.map((milestone, i) => (
                    <li key={i} className="flex justify-between text-sm text-ink-soft">
                      <span>{milestone.title}</span>
                      <span className="font-mono text-xs">{formatGen(milestone.amount)}</span>
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-ink-faint">{formatDateTime(ruling.at)}</p>
              </>
            )}

            {ruling.kind === 'dispute' && (
              <>
                <header className="mb-2 flex flex-wrap items-center gap-x-3">
                  <Label>Dispute — milestone {ruling.milestone + 1}</Label>
                  <span className="ml-auto font-mono text-[0.6875rem] text-ink-faint">
                    {shortAddress(ruling.by)} bonded {formatGen(ruling.bond)} · {formatDateTime(ruling.at)}
                  </span>
                </header>
                <p className="prose-doc text-[0.95rem] italic">“{ruling.reason}”</p>
                <p className="mt-1 text-xs text-ink-faint">Contested a ruling of {ruling.contested_pct}%.</p>
              </>
            )}
          </li>
        ))}
      </ol>

      {isParty && (job.status === 'active' || canAmend) && (
        <div className="mt-5 flex flex-wrap gap-2 border-t border-rule pt-4">
          {job.status === 'active' && (
            <Button variant="outline" onClick={() => setPanel(panel === 'scope' ? null : 'scope')}>
              Ask whether something is in scope
            </Button>
          )}
          {canAmend && (
            <Button variant="outline" onClick={() => setPanel(panel === 'amend' ? null : 'amend')}>
              Fund a change order
            </Button>
          )}
        </div>
      )}

      {panel === 'scope' && <ScopeForm busy={busy} onCancel={() => setPanel(null)} onSubmit={onRuleScope} />}
      {panel === 'amend' && (
        <ChangeOrderForm job={job} busy={busy} onCancel={() => setPanel(null)} onSubmit={onChangeOrder} />
      )}
    </div>
  )
}

function ScopeForm({
  busy,
  onCancel,
  onSubmit,
}: {
  busy: boolean
  onCancel: () => void
  onSubmit: (request: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="mt-4 space-y-3 border-t border-rule-strong pt-4">
      <Field
        label="The work in question"
        hint="Describe it plainly. Validators rule on it against the signed agreement, not against either party's memory of the conversation."
      >
        <Textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Also add a dark mode to the cart page." />
      </Field>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="seal" busy={busy} disabled={!text.trim()} onClick={() => onSubmit(text.trim())}>
          Get a ruling
        </Button>
      </div>
    </div>
  )
}

function ChangeOrderForm({
  job,
  busy,
  onCancel,
  onSubmit,
}: {
  job: Job
  busy: boolean
  onCancel: () => void
  onSubmit: (request: string, milestones: { title: string; amount: string }[], deadline: number, total: bigint) => void
}) {
  const [request, setRequest] = useState('')
  const [rows, setRows] = useState([{ title: '', gen: '' }])
  const [days, setDays] = useState('30')

  let total: bigint | null = null
  try {
    total = rows.reduce((sum, row) => sum + (row.gen ? toWei(row.gen) : 0n), 0n)
  } catch {
    total = null
  }
  const deadline = Math.floor(Date.now() / 1000) + Number(days || 0) * 86400
  const deadlineValid = Number(days) > 0 && deadline >= job.deadline

  return (
    <div className="mt-4 space-y-3 border-t border-rule-strong pt-4">
      <Callout tone="amber">
        An amendment re-opens the agreement: the contract re-drafts the whole Statement of Work including this work, and
        both parties sign again before it is in force.
      </Callout>
      <Field label="What you're adding">
        <Textarea rows={3} value={request} onChange={(e) => setRequest(e.target.value)} />
      </Field>
      <div>
        <Label className="mb-2">New milestones</Label>
        <div className="space-y-2">
          {rows.map((row, index) => (
            <div key={index} className="flex items-center gap-2">
              <Input
                value={row.title}
                onChange={(e) => setRows((c) => c.map((r, i) => (i === index ? { ...r, title: e.target.value } : r)))}
                placeholder="What it delivers"
                className="flex-1"
              />
              <Input
                value={row.gen}
                onChange={(e) =>
                  setRows((c) => c.map((r, i) => (i === index ? { ...r, gen: e.target.value.replace(/[^0-9.]/g, '') } : r)))
                }
                className="w-32 text-right font-mono"
                placeholder="0.00"
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
        <Button variant="ghost" className="mt-2" onClick={() => setRows((c) => [...c, { title: '', gen: '' }])}>
          + Milestone
        </Button>
      </div>
      <Field label="New deadline (days from now)" hint="An amendment may extend the deadline, never shorten it.">
        <Input value={days} onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))} className="w-32 font-mono" />
      </Field>
      <div className="flex items-center justify-between">
        <Label>{total === null ? 'invalid' : `funding ${formatGen(total)}`}</Label>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            variant="seal"
            busy={busy}
            disabled={!request.trim() || !total || total === 0n || !deadlineValid || rows.some((r) => !r.title.trim())}
            onClick={() =>
              onSubmit(
                request.trim(),
                rows.map((r) => ({ title: r.title, amount: toWei(r.gen).toString() })),
                deadline,
                total!,
              )
            }
          >
            Fund the amendment
          </Button>
        </div>
      </div>
    </div>
  )
}
