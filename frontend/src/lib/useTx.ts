import { useCallback, useState } from 'react'
import { waitForTx, type TxOutcome } from './tx'

export type TxState =
  | { phase: 'idle' }
  | { phase: 'signing' }
  | { phase: 'waiting'; hash: string; note: string }
  | { phase: 'done'; hash: string }
  | { phase: 'failed'; message: string; hash?: string }

/**
 * Runs one contract write through its whole life: sign, wait for real finality,
 * report. Kept as a hook because every action page needs the same four states
 * and the same "ACCEPTED is not success" check.
 *
 * `note` exists because the waits here are not uniform - a signature confirms in
 * seconds, while drafting or adjudication runs a validator round and takes
 * minutes. Telling the user which one they are in is the difference between
 * patience and a reload.
 */
export function useTx() {
  const [state, setState] = useState<TxState>({ phase: 'idle' })

  const run = useCallback(
    async (
      send: () => Promise<`0x${string}`>,
      { note = 'Confirming on chain…', onDone }: { note?: string; onDone?: () => void | Promise<void> } = {},
    ) => {
      setState({ phase: 'signing' })
      let hash: `0x${string}`
      try {
        hash = await send()
      } catch (error) {
        setState({ phase: 'failed', message: describe(error) })
        return
      }
      setState({ phase: 'waiting', hash, note })
      let outcome: TxOutcome
      try {
        outcome = await waitForTx(hash)
      } catch (error) {
        setState({ phase: 'failed', message: describe(error), hash })
        return
      }
      if (outcome.state === 'confirmed') {
        setState({ phase: 'done', hash })
        await onDone?.()
      } else if (outcome.state === 'reverted') {
        setState({ phase: 'failed', message: outcome.message, hash })
      } else if (outcome.state === 'no_verdict') {
        setState({
          phase: 'failed',
          hash,
          message: `The validators reached no verdict (${outcome.status}). Nothing was changed — you can try again.`,
        })
      } else {
        setState({
          phase: 'failed',
          hash,
          message: 'Still unresolved after ten minutes. The transaction may yet land — reload before retrying.',
        })
      }
    },
    [],
  )

  /** Report a failure that happened before any transaction was attempted -
   *  chiefly "no wallet connected". Without this, a guard like `ctx && run(...)`
   *  silently does nothing and the button looks broken. */
  const fail = useCallback((message: string) => setState({ phase: 'failed', message }), [])

  return {
    state,
    run,
    fail,
    reset: () => setState({ phase: 'idle' }),
    busy: state.phase === 'signing' || state.phase === 'waiting',
  }
}

function describe(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (/user rejected|denied|rejected the request/i.test(message)) return 'You rejected the signature request.'
  if (/insufficient funds/i.test(message)) return 'That wallet does not hold enough GEN for this transaction.'
  const tagged = message.match(/\[(?:EXPECTED|LLM_ERROR|EXTERNAL)\]\s*([^"\\\n]+)/)
  if (tagged) return tagged[1].trim()
  return message.length > 220 ? `${message.slice(0, 218)}…` : message
}
