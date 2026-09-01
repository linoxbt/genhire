import { Link, Outlet } from 'react-router-dom'
import { NETWORKS, useNetwork, setCurrentNetwork, type NetworkKey, isDeployed } from '../lib/network'
import { useHeaderTone } from '../lib/useHeaderTone'
import { useWallet } from '../lib/wallet'
import { shortAddress } from '../lib/format'
import { Lockup } from './Logo'
import NavMenu from './NavMenu'
import Footer from './Footer'

function NetworkSwitcher({ dark }: { dark: boolean }) {
  const network = useNetwork()
  return (
    <div
      className={`hidden items-center rounded-full border p-0.5 sm:flex ${
        dark ? 'border-paper/25' : 'border-rule'
      }`}
    >
      {(Object.keys(NETWORKS) as NetworkKey[]).map((key) => {
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
        {!isDeployed(network) && !dark && (
          <div className="border-t border-seal-200 bg-seal-50 px-5 py-1.5 text-center text-xs text-seal-700">
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
