import { createAppKit } from '@reown/appkit/react'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { defineChain } from '@reown/appkit/networks'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { WagmiProvider } from 'wagmi'
import type { ReactNode } from 'react'
import { NETWORKS } from './network'

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID as string | undefined

/**
 * AppKit needs the CAIP fields spelled out for a chain it doesn't ship - without
 * `caipNetworkId` and `chainNamespace` it reports the network as unconfigured
 * and refuses to switch to it.
 */
function toCaipNetwork(chain: (typeof NETWORKS)[keyof typeof NETWORKS]['chain'], label: string) {
  return defineChain({
    id: chain.id,
    caipNetworkId: `eip155:${chain.id}`,
    chainNamespace: 'eip155',
    name: label,
    nativeCurrency: chain.nativeCurrency,
    rpcUrls: chain.rpcUrls,
  })
}

// Derived from the registry rather than listed again, so the two cannot drift.
const networks = (Object.values(NETWORKS) as { chain: Parameters<typeof toCaipNetwork>[0]; label: string }[]).map(
  (entry) => toCaipNetwork(entry.chain, entry.label),
) as [ReturnType<typeof toCaipNetwork>, ...ReturnType<typeof toCaipNetwork>[]]

export const walletEnabled = Boolean(projectId)

const wagmiAdapter = walletEnabled
  ? new WagmiAdapter({ networks, projectId: projectId as string })
  : null

if (wagmiAdapter && projectId) {
  createAppKit({
    adapters: [wagmiAdapter],
    networks,
    projectId,
    metadata: {
      name: 'GenHire',
      description: 'An engagement marketplace where the contract drafts the agreement it enforces.',
      url: typeof window === 'undefined' ? 'https://genhire.app' : window.location.origin,
      icons: [],
    },
    themeMode: 'light',
    themeVariables: {
      '--w3m-accent': '#c2482a',
      '--w3m-font-family': 'Inter, system-ui, sans-serif',
    },
    features: { analytics: false, email: false, socials: [] },
  })
}

const queryClient = new QueryClient()

/**
 * Wraps the app in the wallet stack - but only when there is a wallet stack to
 * wrap it in. With no project id, `createAppKit` above never ran, so mounting
 * WagmiProvider around an adapter built from a placeholder id buys nothing and
 * risks failing at render. Reads need none of this: the whole app browses fine
 * without a wallet.
 */
export function WalletProviders({ children }: { children: ReactNode }) {
  if (!walletEnabled) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  }
  return (
    <WagmiProvider config={wagmiAdapter!.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
