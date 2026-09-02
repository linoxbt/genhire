import { Link, Outlet } from 'react-router-dom'
import { NETWORKS, useNetwork, setCurrentNetwork, type NetworkKey, isDeployed } from '../lib/network'
import { useHeaderTone } from '../lib/useHeaderTone'
import { useWallet } from '../lib/wallet'
import { shortAddress } from '../lib/format'
import { Lockup } from './Logo'
import NavMenu from './NavMenu'
import Footer from './Footer'

/**
 * The network indicator.
 *
 * With a single supported network there is nothing to switch between, so this
 * states which chain the app is reading rather than offering a one-option
 * toggle. It becomes a real switcher again on its own if another network is
 * ever added back to the registry.
 */
function NetworkSwitcher({ dark }: { dark: boolean }) {
  const network = useNetwork()
  const keys = Object.keys(NETWORKS) as NetworkKey[]

  if (keys.length < 2) {
    return (
      <span
        title={isDeployed(network) ? NETWORKS[network].label : `${NETWORKS[network].label} — not deployed yet`}
        className={`hidden rounded-full border px-2.5 py-1 font-mono text-[0.6875rem] tracking-wider uppercase sm:inline-block ${
          dark ? 'border-paper/25 text-paper/60' : 'border-rule text-ink-faint'
        }`}
      >
        {NETWORKS[network].short}
      </span>
    )
  }

  return (
    <div
      className={`hidden items-center rounded-full border p-0.5 sm:flex ${
        dark ? 'border-paper/25' : 'border-rule'
      }`}
    >
      {keys.map((key) => {
        const active = network === key
        return (
          <button
            key={key}
            onClick={() => setCurrentNetwork(key)}
            title={isDeployed(key) ? NETWORKS[key].label : `${NETWORKS[key].label} — not deployed yet`}
            className={`rounded-full px-2.5 py-1 font-mono text-[0.6875rem] tracking-wider uppercase transition-colors ${
              active
                ? dark
                  ? 'bg-paper text-ink'
                  : 'bg-ink text-paper'
                : dark
                  ? 'text-paper/50 hover:text-paper'
                  : 'text-ink-faint hover:text-ink'
            }`}
          >
            {NETWORKS[key].short}
          </button>
        )
      })}
    </div>
  )
}

function WalletButton({ dark }: { dark: boolean }) {
  const wallet = useWallet()
  if (!wallet.enabled) return null
  if (wallet.wrongChain) {
    return (
      <button
        onClick={wallet.switchChain}
        title="Your wallet is on a different network than the one selected here"
        className="shrink-0 rounded-full border border-seal-500 bg-seal-500/10 px-3.5 py-1.5 font-mono text-[0.6875rem] tracking-wider text-seal-500 uppercase transition-colors hover:bg-seal-500/20"
      >
        Wrong network
      </button>
    )
  }
  return (
    <button
      onClick={wallet.connect}
      className={`shrink-0 rounded-full border px-3.5 py-1.5 font-mono text-[0.6875rem] tracking-wider uppercase transition-colors ${
        dark ? 'border-paper/30 text-paper hover:border-paper' : 'border-rule-strong text-ink hover:border-ink'
      }`}
    >
      {wallet.isConnected ? shortAddress(wallet.address) : 'Connect'}
    </button>
  )
}

/**
 * The app shell.
 *
 * There is no nav bar here at any breakpoint - every destination lives in the
 * menu (see NavMenu), which keeps one canonical list rather than a header and a
 * drawer that drift apart. The header floats transparently over any section
 * marked `data-tone="dark"` and lays down a paper bar everywhere else.
 */
export default function Shell() {
  const tone = useHeaderTone()
  const dark = tone === 'dark'
  const network = useNetwork()

  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header
        className={`inset-x-0 top-0 z-40 transition-colors duration-300 ${
          dark ? 'fixed bg-transparent' : 'sticky bg-paper/95 backdrop-blur'
        }`}
      >
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-5 sm:px-8">
          <Link to="/" className="min-w-0">
            <Lockup size={28} dark={dark} />
          </Link>
          <nav className="flex shrink-0 items-center gap-3">
            <NetworkSwitcher dark={dark} />
            <WalletButton dark={dark} />
            <NavMenu dark={dark} />
          </nav>
        </div>
        {/* Shown in both tones. Hiding it while the header floats over a dark
            hero suppressed it on exactly the page a new visitor arrives at. */}
        {!isDeployed(network) && (
          <div
            className={`border-t px-5 py-1.5 text-center text-xs ${
              dark ? 'border-paper/15 bg-ink/80 text-seal-400 backdrop-blur' : 'border-seal-200 bg-seal-50 text-seal-700'
            }`}
          >
            GenHire is not deployed on {NETWORKS[network].label} yet — switch networks to use the app.
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      <Footer />
    </div>
  )
}
