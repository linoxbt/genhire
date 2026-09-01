import { useAppKit, useAppKitAccount, useAppKitProvider } from '@reown/appkit/react'
import type { EIP1193Provider } from 'viem'
import { walletEnabled } from './appkit'

export interface Wallet {
  address?: `0x${string}`
  isConnected: boolean
  enabled: boolean
  connect: () => void
  /** The context every write needs, or null when no wallet is connected. */
  ctx: { account: `0x${string}`; provider: EIP1193Provider } | null
}

function useConnectedWallet(): Wallet {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<EIP1193Provider>('eip155')

  const account = address as `0x${string}` | undefined
  return {
    address: account,
    isConnected: Boolean(isConnected && account),
    enabled: true,
    connect: () => open(),
    ctx: account && walletProvider ? { account, provider: walletProvider } : null,
  }
}

const DISCONNECTED: Wallet = {
  address: undefined,
  isConnected: false,
  enabled: false,
  connect: () => {},
  ctx: null,
}

function useNoWallet(): Wallet {
  return DISCONNECTED
}

/**
 * The wallet, or a permanently-disconnected stand-in when no Reown project id
 * is configured.
 *
 * The implementation is chosen once, at module load, rather than branched
 * inside the hook. AppKit's hooks throw outright if `createAppKit` was never
 * called ("Please call createAppKit before using useAppKit"), and because the
 * header renders a wallet button on every route, that throw took down the
 * entire app - a blank page rather than a degraded one. Selecting the
 * implementation up front keeps the hook order stable for the lifetime of the
 * app while guaranteeing the AppKit hooks are only ever called when AppKit
 * actually exists.
 */
export const useWallet: () => Wallet = walletEnabled ? useConnectedWallet : useNoWallet
