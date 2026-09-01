import type { TransactionHash } from 'genlayer-js/types'
import { readClient } from './client'

/**
 * Waits for a transaction to genuinely finish, then reports what happened.
 *
 * Two GenLayer-specific traps this exists to close:
 *  - ACCEPTED is not success. A transaction reaches ACCEPTED once it lands in a
 *    block; the contract call inside it can still have reverted. Only the
 *    execution result says which.
 *  - The default poll budget is far too short here. A write that triggers a
 *    validator round (drafting, adjudication, a scope ruling) takes minutes,
 *    not seconds, so this polls against a wall-clock budget instead.
 */
export type TxOutcome =
  | { state: 'confirmed'; hash: string }
  | { state: 'reverted'; hash: string; message: string }
  | { state: 'no_verdict'; hash: string; status: string }
  | { state: 'unresolved'; hash: string }

/**
 * `getTransaction` reports status as the numeric enum ordinal, and leaves
 * `status_name` undefined on this RPC path - so comparing the raw field
 * against status *names* silently never matches, and a transaction that
 * finalized in seconds looks like it hung. Both shapes are normalised here.
 */
const STATUS_NAMES = [
  'UNINITIALIZED', 'PENDING', 'PROPOSING', 'COMMITTING', 'REVEALING', 'ACCEPTED',
  'UNDETERMINED', 'FINALIZED', 'CANCELED', 'APPEAL_REVEALING', 'APPEAL_COMMITTING',
  'READY_TO_FINALIZE', 'VALIDATORS_TIMEOUT', 'LEADER_TIMEOUT',
] as const

const TERMINAL = ['FINALIZED', 'UNDETERMINED', 'CANCELED', 'LEADER_TIMEOUT', 'VALIDATORS_TIMEOUT']

function statusName(tx: any): string {
  const raw = tx?.status_name ?? tx?.status
  if (typeof raw === 'number') return STATUS_NAMES[raw] ?? `UNKNOWN(${raw})`
  return typeof raw === 'string' ? raw : 'PENDING'
}

export async function waitForTx(hash: `0x${string}`, budgetMs = 10 * 60 * 1000): Promise<TxOutcome> {
  const client = readClient()
  const deadline = Date.now() + budgetMs
  let last: any
  // Poll on a backoff rather than a flat interval. A write that triggers a
  // validator round takes minutes, so a fixed 4s poll spends a few hundred
  // requests against a shared RPC quota to learn nothing until the last one.
  let wait = 4000

  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, wait))
    wait = Math.min(wait * 1.5, 20_000)
    try {
      // genlayer-js brands the hash as a fixed-length type; every hash here
      // comes straight back from writeContract, so the shape is already right.
      last = await client.getTransaction({ hash: hash as TransactionHash })
    } catch {
      continue // a read failure mid-poll is not a transaction failure
    }
    const status = statusName(last)
    if (TERMINAL.includes(status)) {
      if (status !== 'FINALIZED') return { state: 'no_verdict', hash, status }
      const receipt = last?.consensus_data?.leader_receipt?.[0]
      const result = String(receipt?.execution_result ?? last?.txExecutionResultName ?? '')
      // A finalized transaction still reports its call's own outcome here:
      // SUCCESS, or an ERROR flavour when the contract raised.
      if (result && result !== 'SUCCESS') {
        return { state: 'reverted', hash, message: extractRevertMessage(receipt) }
      }
      return { state: 'confirmed', hash }
    }
  }
  return { state: 'unresolved', hash }
}

/** Contract rejects are tagged `[EXPECTED]` / `[LLM_ERROR]` / `[EXTERNAL]`;
 *  strip the tag so a user sees the sentence, not the classification. */
function extractRevertMessage(receipt: unknown): string {
  const text = JSON.stringify(receipt ?? {})
  const match = text.match(/\[(?:EXPECTED|LLM_ERROR|EXTERNAL|TRANSIENT)\]\s*([^"\\]+)/)
  if (match) return match[1].trim()
  return 'The contract rejected this transaction.'
}

/** Reads can lag a moment behind a just-finalized write. */
export async function retryRead<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  let lastError: unknown
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 1500 * attempt))
    }
  }
  throw lastError
}
