import { useEffect, useState } from 'react'
import { DarkSeal } from '../Logo'

const SEEN_KEY = 'genhire:splash-seen'

/**
 * A short intro on first arrival.
 *
 * Session-gated, so it costs a returning visitor nothing. The choreography is
 * four timers rather than one fade because it has two beats - the mark lands,
 * then the line arrives - and a single transition cannot express that.
 */
export default function Splash() {
  const [visible, setVisible] = useState(false)
  const [markIn, setMarkIn] = useState(false)
  const [lineIn, setLineIn] = useState(false)
  const [exiting, setExiting] = useState(false)

  useEffect(() => {
    let seen = true
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === '1'
    } catch {
      seen = true // storage blocked: skip the splash rather than replay it forever
    }
    if (seen) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      try {
        sessionStorage.setItem(SEEN_KEY, '1')
      } catch {
        /* ignore */
      }
      return
    }

    try {
      sessionStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* ignore */
    }

    setVisible(true)
    const timers = [
      window.setTimeout(() => setMarkIn(true), 40),
      window.setTimeout(() => setLineIn(true), 700),
      window.setTimeout(() => setExiting(true), 1900),
      window.setTimeout(() => setVisible(false), 2600),
    ]
    return () => timers.forEach(window.clearTimeout)
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden="true"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 bg-ink transition-opacity duration-700 ${
        exiting ? 'pointer-events-none opacity-0' : 'opacity-100'
      }`}
    >
      <div
        className="transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]"
        style={{ opacity: markIn ? 1 : 0, transform: markIn ? 'scale(1)' : 'scale(0.86)' }}
      >
        <DarkSeal size={140} />
      </div>
      <p
        className="max-w-sm px-6 text-center font-serif text-xl text-paper/80 italic transition-opacity duration-700"
        style={{ opacity: lineIn ? 1 : 0 }}
      >
        The contract writes the contract.
      </p>
    </div>
  )
}
