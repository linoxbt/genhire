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

export function useWallet(): Wallet {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<EIP1193Provider>('eip155')

  const account = address as `0x${string}` | undefined
  return {
    address: account,
    isConnected: Boolean(isConnected && account),
    enabled: walletEnabled,
    connect: () => open(),
    ctx: account && walletProvider ? { account, provider: walletProvider } : null,
  }
}
