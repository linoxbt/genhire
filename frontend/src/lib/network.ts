import { useSyncExternalStore } from 'react'
import { studionet } from 'genlayer-js/chains'

/**
 * The networks GenHire targets.
 *
 * Studio only. Localnet is deliberately absent - the app never offers a wallet a
 * local dev chain.
 *
 * The registry is still a map, and everything below still selects by key, so
 * adding a network back is a one-entry change rather than a rewrite.
 */
export const NETWORKS = {
  studionet: {
    chain: studionet,
    label: 'Studio Network',
    short: 'Studio',
    // Studio is the free, gasless sandbox, so its deployment runs a short
    // appeal window - the whole lifecycle finishes in minutes there. The real
    // figure is always read from the contract, never assumed.
    sandbox: true,
    explorer: 'https://studio.genlayer.com',
    contractAddress: import.meta.env.VITE_CONTRACT_ADDRESS_STUDIONET as `0x${string}`,
  },
} as const

export type NetworkKey = keyof typeof NETWORKS

const STORAGE_KEY = 'genhire:network'
const DEFAULT_NETWORK: NetworkKey = 'studionet'

function isNetworkKey(value: string | null): value is NetworkKey {
  return value !== null && value in NETWORKS
}

function readStored(): NetworkKey {
  if (typeof window === 'undefined') return DEFAULT_NETWORK
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    return isNetworkKey(stored) ? stored : DEFAULT_NETWORK
  } catch {
    return DEFAULT_NETWORK
  }
}

let current: NetworkKey = readStored()
const listeners = new Set<() => void>()

export const getCurrentNetwork = (): NetworkKey => current
export const getActiveChain = () => NETWORKS[current].chain
export const isDeployed = (key: NetworkKey = current) => Boolean(NETWORKS[key].contractAddress)

export function getContractAddress(): `0x${string}` {
  const address = NETWORKS[current].contractAddress
  if (!address) {
    throw new Error(
      `GenHire is not deployed on ${NETWORKS[current].label} yet - set its address in frontend/.env.local`,
    )
  }
  return address
}

export function setCurrentNetwork(key: NetworkKey): void {
  if (key === current) return
  current = key
  try {
    window.localStorage.setItem(STORAGE_KEY, key)
  } catch {
    /* a viewer with site data blocked still gets a working switch, just not a sticky one */
  }
  listeners.forEach((listener) => listener())
}

function subscribe(callback: () => void): () => void {
  listeners.add(callback)
  return () => listeners.delete(callback)
}

/** Re-renders the caller whenever the selected network changes. */
export function useNetwork(): NetworkKey {
  return useSyncExternalStore(subscribe, getCurrentNetwork, () => DEFAULT_NETWORK)
}
