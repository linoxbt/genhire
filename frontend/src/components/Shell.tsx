import { NavLink, Link, Outlet } from 'react-router-dom'
import { NETWORKS, useNetwork, setCurrentNetwork, type NetworkKey, isDeployed } from '../lib/network'
import { useWallet } from '../lib/wallet'
import { shortAddress } from '../lib/format'
import { Button } from './ui'

const NAV = [
  { to: '/jobs', label: 'Board' },
  { to: '/post', label: 'Post a brief' },
  { to: '/dashboard', label: 'My engagements' },
  { to: '/about', label: 'How it works' },
]

function NetworkSwitcher() {
  const network = useNetwork()
  return (
    <div className="flex items-center rounded-sm border border-rule bg-leaf p-0.5">
      {(Object.keys(NETWORKS) as NetworkKey[]).map((key) => (
        <button
          key={key}
          onClick={() => setCurrentNetwork(key)}
          title={isDeployed(key) ? NETWORKS[key].label : `${NETWORKS[key].label} — not deployed yet`}
          className={`rounded-[2px] px-2.5 py-1 font-mono text-[0.6875rem] uppercase tracking-wider transition-colors ${
            network === key ? 'bg-ink text-paper' : 'text-ink-faint hover:text-ink'
          }`}
        >
          {NETWORKS[key].short}
          {!isDeployed(key) && <span className="ml-1 opacity-60">·</span>}
        </button>
      ))}
    </div>
  )
}

function WalletButton() {
  const wallet = useWallet()
  if (!wallet.enabled) {
    return (
      <span className="font-mono text-[0.6875rem] uppercase tracking-wider text-ink-faint" title="Set VITE_REOWN_PROJECT_ID to enable wallet connection">
        read-only
      </span>
    )
  }
  return (
    <Button variant={wallet.isConnected ? 'outline' : 'primary'} onClick={wallet.connect} className="py-1.5">
      {wallet.isConnected ? <span className="font-mono text-xs">{shortAddress(wallet.address)}</span> : 'Connect wallet'}
    </Button>
  )
}

export default function Shell() {
  const network = useNetwork()
  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-rule bg-paper/92 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-5">
          <Link to="/" className="flex items-baseline gap-2">
            <span className="font-serif text-xl font-semibold tracking-tight text-ink">GenHire</span>
            <span className="hidden font-mono text-[0.625rem] uppercase tracking-[0.18em] text-seal-500 sm:inline">
              engagements
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `rounded-sm px-3 py-1.5 text-sm transition-colors ${
                    isActive ? 'bg-vellum font-medium text-ink' : 'text-ink-soft hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <NetworkSwitcher />
            <WalletButton />
          </div>
        </div>
        {!isDeployed(network) && (
          <div className="border-t border-seal-200 bg-seal-50 px-5 py-1.5 text-center text-xs text-seal-700">
            GenHire is not deployed on {NETWORKS[network].label} yet — switch networks to use the app.
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10">
        <Outlet />
      </main>

      <footer className="mt-16 border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-5 py-8 text-xs text-ink-faint sm:flex-row sm:items-center sm:justify-between">
          <p>
            Every figure on this site is a live call to a GenLayer Intelligent Contract. There is no backend and no
            database.
          </p>
          <nav className="flex gap-4 md:hidden">
            {NAV.map((item) => (
              <Link key={item.to} to={item.to} className="hover:text-ink">
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  )
}
