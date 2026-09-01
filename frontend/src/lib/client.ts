import { createClient } from 'genlayer-js'
import type { EIP1193Provider } from 'viem'
import { getActiveChain } from './network'

/**
 * Read client - talks straight to the GenLayer RPC, no wallet involved. Built
 * per call so it always targets the currently selected network rather than one
 * frozen at module load.
 */
export function readClient() {
  return createClient({ chain: getActiveChain() })
}

/** Write client - signs through whichever wallet Reown AppKit connected. */
export function writeClient(account: `0x${string}`, provider: EIP1193Provider) {
  return createClient({ chain: getActiveChain(), account, provider })
}
