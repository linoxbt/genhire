import { Link } from 'react-router-dom'
import { MENU_LINKS, REPO_URL } from '../lib/navLinks'
import { NETWORKS, useNetwork, isDeployed } from '../lib/network'
import { shortAddress } from '../lib/format'
import { DarkSeal, Wordmark } from './Logo'

/** The protocol, stated as a spec sheet rather than a paragraph. */
const STACK: [string, string][] = [
  ['Contract', 'GenVM / Python'],
  ['Consensus', 'Optimistic Democracy'],
  ['Adjudication', 'Equivalence Principle'],
  ['Settlement', 'Proportional'],
  ['Backend', 'None'],
]

export default function Footer() {
  const network = useNetwork()
  const address = isDeployed() ? NETWORKS[network].contractAddress : ''

  return (
    <footer data-tone="dark" className="relative mt-auto overflow-hidden bg-ink text-paper">
      {/* An oversized mark bleeding off-canvas, turning slowly. Decorative
          only - it carries no information, so it is aria-hidden and pointer-none. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-1/4 -bottom-1/3 opacity-[0.06]"
      >
        <div className="animate-slow-spin">
          <DarkSeal size={560} />
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <DarkSeal size={32} />
              <Wordmark dark className="text-xl" />
            </div>
            <p className="mt-4 max-w-sm text-sm leading-relaxed text-paper/60">
              An engagement marketplace where the Intelligent Contract drafts the agreement it
              enforces, rules on delivery against the text it wrote, and settles escrow
              proportionally.
            </p>
          </div>

          <div>
            <div className="label mb-3 text-paper/40">Product</div>
            <ul className="space-y-2">
              {MENU_LINKS.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className="text-sm text-paper/70 transition-colors hover:text-paper">
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="label mb-3 text-paper/40">Source</div>
            <ul className="space-y-2">
              <li>
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-paper/70 transition-colors hover:text-paper"
                >
                  Repository ↗
                </a>
              </li>
              <li>
                <a
                  href="https://docs.genlayer.com"
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-sm text-paper/70 transition-colors hover:text-paper"
                >
                  GenLayer docs ↗
                </a>
              </li>
              {address && (
                <li className="font-mono text-[0.6875rem] text-paper/40">
                  contract {shortAddress(address)}
                </li>
              )}
            </ul>
          </div>
        </div>

        <div className="mt-12 flex flex-wrap gap-x-8 gap-y-3 border-t border-paper/15 pt-8 font-mono text-[0.6875rem] text-paper/50">
          {STACK.map(([label, value]) => (
            <span key={label}>
              <span className="text-paper/30">{label}</span> {value}
            </span>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-baseline justify-between gap-4 border-t border-paper/15 pt-8">
          <p className="max-w-md font-serif text-lg text-paper/80 italic">
            “Neither party wrote the standard they are held to.”
          </p>
          <p className="font-mono text-[0.6875rem] text-paper/40">
            GenHire · GenLayer Intelligent Contract · {NETWORKS[network].label}
          </p>
        </div>
      </div>
    </footer>
  )
}
