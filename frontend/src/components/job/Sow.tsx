import type { Job, StatementOfWork } from '../../lib/types'
import { sameAddress, shortAddress } from '../../lib/format'
import { Button, Callout, Label } from '../ui'

/**
 * The drafted agreement, set as a document. This is the artefact the whole
 * product turns on, so it is typeset rather than tabulated - and the signature
 * block shows the hash both parties actually put their name to.
 */
export default function Sow({
  job,
  sow,
  viewer,
  onDraft,
  onSign,
  busy,
}: {
  job: Job
  sow: StatementOfWork | null
  viewer?: string
  onDraft: () => void
  onSign: () => void
  busy: boolean
}) {
  const isClient = sameAddress(job.client, viewer)
  const isFreelancer = sameAddress(job.freelancer, viewer)
  const isParty = isClient || isFreelancer
  const youSigned = isClient ? job.client_signed : isFreelancer ? job.freelancer_signed : false

  if (job.status === 'drafting') {
    return (
      <p className="text-sm text-ink-faint">
        The contract drafts this once a proposal is accepted. Nothing is binding until both parties sign it.
      </p>
    )
  }

  // A failed read is not the same thing as "not drafted yet". Conflating them
  // showed the drafting call-to-action on an already-active job, where pressing
  // it can only revert.
  if (!sow) {
    return (
      <Callout tone="seal">
        The Statement of Work could not be read from the contract just now. Reload to try again — the
        agreement itself is unaffected.
      </Callout>
    )
  }

  if (job.status === 'awaiting_sow' || sow.version === 0) {
    return (
      <div className="space-y-4">
        <Callout tone="amber">
          Terms are agreed. The contract has yet to draft the Statement of Work — validators will write the acceptance
          criteria from the brief and the accepted proposal, and both parties sign that text before work can start.
        </Callout>
        <div className="flex items-center justify-between">
          <p className="text-xs text-ink-faint">Anyone can trigger drafting — neither side can stall it.</p>
          <Button variant="seal" onClick={onDraft} busy={busy}>
            Draft the agreement
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div>
      {job.sow_version > 1 && (
        <Label className="mb-3">Amendment {job.sow_version - 1} — supersedes version {job.sow_version - 1}</Label>
      )}

      <div className="prose-doc">
        <p>{sow.scope}</p>
      </div>

      {sow.assumptions.length > 0 && (
        <div className="mt-6">
          <Label className="mb-2">Assumptions</Label>
          <ul className="prose-doc space-y-1 text-[0.95rem]">
            {sow.assumptions.map((item, index) => (
              <li key={index} className="grid grid-cols-[1.25rem_1fr]">
                <span className="text-ink-faint">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {sow.exclusions.length > 0 && (
        <div className="mt-5">
          <Label className="mb-2">Expressly excluded</Label>
          <ul className="prose-doc space-y-1 text-[0.95rem]">
            {sow.exclusions.map((item, index) => (
              <li key={index} className="grid grid-cols-[1.25rem_1fr]">
                <span className="text-seal-400">·</span>
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 border-t border-rule-strong pt-5">
        <Label className="mb-4">Executed by</Label>
        <div className="grid gap-6 sm:grid-cols-2">
          <SignatureBlock role="Client" address={job.client} signed={job.client_signed} you={isClient} />
          <SignatureBlock role="Freelancer" address={job.freelancer} signed={job.freelancer_signed} you={isFreelancer} />
        </div>

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Label>Instrument hash (v{sow.version})</Label>
            <div className="mt-0.5 font-mono text-[0.6875rem] break-all text-ink-faint">{job.sow_hash}</div>
          </div>
          {job.status === 'sow_drafted' && isParty && !youSigned && (
            <Button variant="seal" onClick={onSign} busy={busy}>
              Sign this agreement
            </Button>
          )}
        </div>

        {job.status === 'sow_drafted' && (
          <p className="mt-4 text-xs text-ink-faint">
            Signing submits this exact hash, so a signature can never land against text you weren't shown. Work cannot
            begin until both signatures are in.
          </p>
        )}
      </div>
    </div>
  )
}

function SignatureBlock({
  role,
  address,
  signed,
  you,
}: {
  role: string
  address: string
  signed: boolean
  you: boolean
}) {
  return (
    <div>
      <div
        className={`flex h-14 items-end border-b pb-1 ${signed ? 'border-ink' : 'border-dashed border-rule-strong'}`}
      >
        {signed ? (
          <span className="stamp font-serif text-2xl italic text-ink">{shortAddress(address)}</span>
        ) : (
          <span className="text-sm text-ink-faint italic">awaiting signature</span>
        )}
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <Label>{role}</Label>
        {you && <span className="font-mono text-[0.625rem] uppercase tracking-wider text-seal-500">you</span>}
      </div>
    </div>
  )
}
