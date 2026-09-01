import type { TxState } from '../lib/useTx'
import { Callout, Spinner } from './ui'

/** The one place a transaction's progress or failure is shown to a user. */
export default function TxNotice({ state, onDismiss }: { state: TxState; onDismiss?: () => void }) {
  if (state.phase === 'idle') return null

  if (state.phase === 'signing') {
    return (
      <Callout>
        <span className="inline-flex items-center gap-2">
          <Spinner /> Waiting for your wallet…
        </span>
      </Callout>
    )
  }

  if (state.phase === 'waiting') {
    return (
      <Callout>
        <span className="inline-flex items-center gap-2">
          <Spinner /> {state.note}
        </span>
        <div className="mt-1 font-mono text-[0.6875rem] text-ink-faint">{state.hash}</div>
      </Callout>
    )
  }

  if (state.phase === 'failed') {
    return (
      <Callout tone="seal">
        <div className="flex items-start justify-between gap-4">
          <div>
            <strong className="font-medium">That didn’t go through.</strong>
            <p className="mt-0.5">{state.message}</p>
            {state.hash && <div className="mt-1 font-mono text-[0.6875rem] opacity-70">{state.hash}</div>}
          </div>
          {onDismiss && (
            <button onClick={onDismiss} className="shrink-0 text-xs underline underline-offset-2">
              dismiss
            </button>
          )}
        </div>
      </Callout>
    )
  }

  return <Callout tone="signed">Done — recorded on chain.</Callout>
}
