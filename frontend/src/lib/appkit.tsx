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

const networks = [
  toCaipNetwork(NETWORKS.studionet.chain, NETWORKS.studionet.label),
  toCaipNetwork(NETWORKS.testnetAsimov.chain, NETWORKS.testnetAsimov.label),
] as [ReturnType<typeof toCaipNetwork>, ...ReturnType<typeof toCaipNetwork>[]]

const wagmiAdapter = new WagmiAdapter({ networks, projectId: projectId ?? 'genhire-unset' })

if (projectId) {
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

export const walletEnabled = Boolean(projectId)

const queryClient = new QueryClient()

export function WalletProviders({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  )
}
