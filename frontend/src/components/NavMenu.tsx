import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { MENU_LINKS, REPO_URL } from '../lib/navLinks'
import { NETWORKS, useNetwork, isDeployed } from '../lib/network'
import { useWallet } from '../lib/wallet'
import { shortAddress } from '../lib/format'
import { DarkSeal, Wordmark } from './Logo'

/**
 * The menu glyph.
 *
 * Not three equal bars: the middle bar runs near full width while the top and
 * bottom are shorter and centred, which gives it a tapered silhouette. The X is
 * a separate SVG cross-faded against it rather than the bars morphing - a
 * dissolve survives being interrupted mid-transition, a morph does not.
 */
function MenuGlyph({ open, dark }: { open: boolean; dark: boolean }) {
  const fill = dark ? 'fill-paper' : 'fill-ink'
  const stroke = dark ? 'stroke-paper' : 'stroke-ink'
  return (
    <span className="relative block h-[14px] w-[18px]" aria-hidden="true">
      <svg
        viewBox="0 0 22 16"
        className={`absolute inset-0 size-full transition-all duration-300 ${
          open ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
        }`}
      >
        <rect x="5.33" y="0" width="10.67" height="2.67" rx="1.33" className={fill} />
        <rect x="1.33" y="6.67" width="18.67" height="2.67" rx="1.33" className={fill} />
        <rect x="5.33" y="13.33" width="10.67" height="2.67" rx="1.33" className={fill} />
      </svg>
      <svg
        viewBox="0 0 16 16"
        className={`absolute inset-0 m-auto size-4 transition-all duration-300 ${
          open ? 'scale-100 opacity-100' : 'scale-75 opacity-0'
        }`}
      >
        <line x1="1" y1="1" x2="15" y2="15" strokeWidth="2" strokeLinecap="round" className={stroke} />
        <line x1="15" y1="1" x2="1" y2="15" strokeWidth="2" strokeLinecap="round" className={stroke} />
      </svg>
    </span>
  )
}

/**
 * The only navigation in the app, at every breakpoint.
 *
 * There is deliberately no desktop nav bar to duplicate this: one place holds
 * every destination, so nothing can be reachable from the header but missing
 * from the menu.
 */
export default function NavMenu({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const { pathname } = useLocation()
  const wallet = useWallet()
  const network = useNetwork()

  useEffect(() => {
    // document.body does not exist during a server render, and the portal
    // target has to be resolved after mount either way.
    setMounted(true)
  }, [])

  useEffect(() => {
    setOpen(false)
  }, [pathname])

  useEffect(() => {
    if (!open) return

    // `overflow: hidden` locks scrolling but leaves the scroll offset intact in
    // some browsers and drops it in others. Pinning the body to a negative top
    // removes the ambiguity: nothing can scroll underneath, and restoring
    // scrollTo on close puts the reader back exactly where they were rather
    // than at the top of the page.
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.left = ''
      document.body.style.right = ''
      // Instant, not smooth. The page sets `scroll-behavior: smooth` globally,
      // which turns this restore into a visible ~1s drift back to where the
      // reader already was - and leaves the position wrong for the duration.
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' as ScrollBehavior })
    }
  }, [open])

  const contractAddress = isDeployed() ? NETWORKS[network].contractAddress : ''

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        className={`flex size-10 shrink-0 items-center justify-center rounded-full border transition-colors ${
          dark ? 'border-paper/30 hover:border-paper' : 'border-rule-strong hover:border-ink'
        }`}
      >
        <MenuGlyph open={open} dark={dark} />
      </button>

      {mounted &&
        createPortal(
          // Portaled to <body> rather than rendered inline in the header. A
          // `backdrop-filter` ancestor establishes a containing block for fixed
          // descendants exactly as `transform` does - and the header has
          // backdrop-blur - so an inline overlay would be trapped inside the
          // header's own height instead of filling the viewport.
          <div
            className={`fixed inset-0 z-50 bg-ink/92 backdrop-blur-2xl transition-opacity duration-300 ${
              open ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
            }`}
            aria-hidden={!open}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close menu"
              tabIndex={open ? 0 : -1}
              className="absolute top-0 right-0 flex h-14 items-center px-5 sm:px-8"
            >
              <span className="flex size-10 items-center justify-center rounded-full border border-paper/30 transition-colors hover:border-paper">
                <MenuGlyph open dark />
              </span>
            </button>

            <div className="flex h-full flex-col items-center justify-center gap-10 px-6 sm:gap-14">
              <div
                className={`flex items-center gap-3 ${open ? 'animate-fade-rise' : ''}`}
                style={open ? { animationFillMode: 'backwards' } : undefined}
              >
                <DarkSeal size={36} />
                <Wordmark dark className="text-2xl" />
              </div>

              <nav className="flex flex-col items-center gap-1 sm:gap-2">
                {MENU_LINKS.map((item, index) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    tabIndex={open ? 0 : -1}
                    onClick={() => setOpen(false)}
                    className={`font-serif text-4xl text-paper transition-colors hover:text-seal-400 sm:text-6xl ${
                      open ? 'animate-fade-rise' : ''
                    }`}
                    style={
                      open
                        ? { animationDelay: `${(index + 1) * 60}ms`, animationFillMode: 'backwards' }
                        : undefined
                    }
                  >
                    {item.label}
                  </Link>
                ))}
              </nav>

              <div
                className={`flex w-full max-w-lg flex-wrap items-center justify-center gap-x-6 gap-y-2 border-t border-paper/15 pt-6 font-mono text-[0.6875rem] text-paper/50 ${
                  open ? 'animate-fade-rise' : ''
                }`}
                style={
                  open
                    ? {
                        animationDelay: `${(MENU_LINKS.length + 1) * 60}ms`,
                        animationFillMode: 'backwards',
                      }
                    : undefined
                }
              >
                {wallet.isConnected && (
                  <Link
                    to={`/profile/${wallet.address}`}
                    tabIndex={open ? 0 : -1}
                    onClick={() => setOpen(false)}
                    className="transition-colors hover:text-paper"
                  >
                    your record {shortAddress(wallet.address)}
                  </Link>
                )}
                <span>{NETWORKS[network].label}</span>
                {contractAddress && <span>contract {shortAddress(contractAddress)}</span>}
                <a
                  href={REPO_URL}
                  target="_blank"
                  rel="noreferrer noopener"
                  tabIndex={open ? 0 : -1}
                  className="transition-colors hover:text-paper"
                >
                  GitHub ↗
                </a>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
