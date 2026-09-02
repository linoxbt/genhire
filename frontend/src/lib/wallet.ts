import { useAppKit, useAppKitAccount, useAppKitNetwork, useAppKitProvider } from '@reown/appkit/react'
import type { EIP1193Provider } from 'viem'
import { walletEnabled } from './appkit'
import { getActiveChain } from './network'

export interface Wallet {
  address?: `0x${string}`
  isConnected: boolean
  enabled: boolean
  connect: () => void
  /** The context every write needs, or null when no wallet is connected. */
  ctx: { account: `0x${string}`; provider: EIP1193Provider } | null
  /**
   * True when the wallet is on a different chain than the one selected here.
   *
   * The header's network switch only changes which chain this app *reads and
   * builds transactions for*; it does not move the wallet. Signing while the
   * two disagree sends a transaction built for one chain to a provider on
   * another.
   */
  wrongChain: boolean
  /** Ask the wallet to move to the selected chain. */
  switchChain: () => void
}

function useConnectedWallet(): Wallet {
  const { open } = useAppKit()
  const { address, isConnected } = useAppKitAccount()
  const { walletProvider } = useAppKitProvider<EIP1193Provider>('eip155')
  const { chainId, switchNetwork, caipNetwork } = useAppKitNetwork()

  const account = address as `0x${string}` | undefined
  const wanted = getActiveChain()
  const connected = Boolean(isConnected && account)

  return {
    address: account,
    isConnected: connected,
    enabled: true,
    connect: () => open(),
    ctx: account && walletProvider ? { account, provider: walletProvider } : null,
    // Only meaningful once connected; an unconnected wallet is not on the
    // "wrong" chain, it is on none.
    wrongChain: connected && chainId !== undefined && Number(chainId) !== wanted.id,
    switchChain: () => {
      if (caipNetwork && Number(chainId) === wanted.id) return
      switchNetwork?.({
        id: wanted.id,
        caipNetworkId: `eip155:${wanted.id}`,
        chainNamespace: 'eip155',
        name: wanted.name,
        nativeCurrency: wanted.nativeCurrency,
        rpcUrls: wanted.rpcUrls,
      } as never)
    },
  }
}

const DISCONNECTED: Wallet = {
  address: undefined,
  isConnected: false,
  enabled: false,
  connect: () => {},
  ctx: null,
  wrongChain: false,
  switchChain: () => {},
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
