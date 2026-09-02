import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { postJob, type MilestoneDraft } from '../lib/genhire'
import { useWallet } from '../lib/wallet'
import { useTx } from '../lib/useTx'
import { formatGen, toWei } from '../lib/format'
import { LIMITS, scheduleProblems } from '../lib/limits'
import { Button, Callout, Field, Form, Input, Label, Sheet, Textarea } from '../components/ui'
import TxNotice from '../components/TxNotice'

interface Row {
  title: string
  gen: string
}

const BLANK: Row = { title: '', gen: '' }

export default function PostBrief() {
  const wallet = useWallet()
  const navigate = useNavigate()
  const { state, run, fail, reset, busy } = useTx()

  const [brief, setBrief] = useState('')
  const [days, setDays] = useState('30')
  const [rows, setRows] = useState<Row[]>([{ title: 'First milestone', gen: '' }])

  const total = useMemo(() => {
    try {
      return rows.reduce((sum, row) => sum + (row.gen ? toWei(row.gen) : 0n), 0n)
    } catch {
      return null
    }
  }, [rows])

  const problems = useMemo(() => {
    const list: string[] = []
    if (brief.trim().length < 40) list.push('The brief needs enough detail for the contract to draft criteria from it.')
    list.push(...scheduleProblems(rows, toWei))
    if (!(Number(days) > 0)) list.push('The deadline must be a positive number of days.')
    return list
  }, [brief, rows, total, days])

  const update = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)))

  async function submit() {
    if (!wallet.ctx || total === null) {
      fail('Connect a wallet to post and fund a brief.')
      return
    }
    if (wallet.wrongChain) {
      fail('Your wallet is on a different network than the one selected. Switch it, then try again.')
      wallet.switchChain()
      return
    }
    const milestones: MilestoneDraft[] = rows.map((row) => ({ title: row.title, amount: toWei(row.gen).toString() }))
    const deadline = Math.floor(Date.now() / 1000) + Number(days) * 86400
    await run(() => postJob(wallet.ctx!, brief.trim(), milestones, deadline, total), {
      note: 'Posting the brief and locking the escrow…',
      onDone: () => navigate('/dashboard'),
    })
  }

  return (
    <div className="rise mx-auto max-w-3xl">
      <header className="mb-7">
        <Label>New engagement</Label>
        <h1 className="mt-2 font-serif text-3xl font-semibold text-ink">Post a brief</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft">
          Write it the way you'd explain it to a person. You are not writing acceptance criteria. The contract drafts
          those once a proposal is accepted, and you'll sign them before any work starts.
        </p>
      </header>

      <Sheet className="p-7">
        <Form onSubmit={submit} disabled={problems.length > 0 || busy} className="space-y-6">
          <Field
            label="The brief"
            hint="What needs building, for whom, and what “done” looks like. The contract drafts from this text."
          >
            <Textarea
              rows={7}
              maxLength={LIMITS.brief}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Build a checkout flow for a small storefront: a cart page, a payment step and an order confirmation email. It has to work on mobile and use our existing payments API."
            />
          </Field>

          <div>
            <Label className="mb-2">Milestones</Label>
            <p className="mb-3 text-xs text-ink-faint">
              Your opening split. A freelancer may propose a different one, and the whole amount is escrowed now, and
              whatever the accepted price doesn't use is refunded to you the moment you accept.
            </p>
            <div className="space-y-2">
              {rows.map((row, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="w-6 shrink-0 font-mono text-xs text-ink-faint tabular-nums">{index + 1}.</span>
                  <Input
                    value={row.title}
                    onChange={(e) => update(index, { title: e.target.value })}
                    placeholder="What this milestone delivers"
                    className="flex-1"
                  />
                  <div className="relative w-40 shrink-0">
                    <Input
                      value={row.gen}
                      onChange={(e) => update(index, { gen: e.target.value.replace(/[^0-9.]/g, '') })}
                      placeholder="0.00"
                      inputMode="decimal"
                      className="pr-12 text-right font-mono"
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 font-mono text-[0.6875rem] text-ink-faint">
                      GEN
                    </span>
                  </div>
                  <button
                    onClick={() => setRows((c) => c.filter((_, i) => i !== index))}
                    disabled={rows.length === 1}
                    className="shrink-0 px-1 text-ink-faint transition-colors hover:text-seal-600 disabled:opacity-30"
                    aria-label={`Remove milestone ${index + 1}`}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Button variant="ghost" onClick={() => setRows((c) => [...c, { ...BLANK }])} disabled={rows.length >= 8}>
                + Add milestone
              </Button>
              <div className="text-right">
                <Label>To escrow now</Label>
                <div className="font-mono text-lg tabular-nums text-ink">
                  {total === null ? 'invalid' : formatGen(total)}
                </div>
              </div>
            </div>
          </div>

          <Field label="Deadline" hint="Days from now. After it passes with work outstanding, anyone can return the escrow to you.">
            <Input
              value={days}
              onChange={(e) => setDays(e.target.value.replace(/[^0-9]/g, ''))}
              inputMode="numeric"
              className="w-32 font-mono"
            />
          </Field>

          {problems.length > 0 && (brief.length > 0 || rows.some((r) => r.title || r.gen)) && (
            <Callout tone="amber">
              <ul className="list-inside list-disc space-y-0.5">
                {problems.map((problem) => (
                  <li key={problem}>{problem}</li>
                ))}
              </ul>
            </Callout>
          )}

          <TxNotice state={state} onDismiss={reset} />

          <div className="flex items-center justify-between border-t border-rule pt-5">
            <p className="text-xs text-ink-faint">
              {wallet.isConnected ? 'Signing this transfers the escrow to the contract.' : 'Connect a wallet to post.'}
            </p>
            {wallet.isConnected ? (
              <Button type="submit" variant="seal" busy={busy} disabled={problems.length > 0}>
                Post and fund
              </Button>
            ) : (
              <Button type="button" onClick={wallet.connect} disabled={!wallet.enabled}>
                Connect wallet
              </Button>
            )}
          </div>
        </Form>
      </Sheet>
    </div>
  )
}
