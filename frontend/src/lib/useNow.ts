import { useEffect, useState } from 'react'

/**
 * A clock that ticks, so time-derived UI actually changes.
 *
 * Deadlines and appeal windows were computed once at render, so the "Settle"
 * button never appeared and "Dispute" never disappeared while the page stayed
 * open. On Studio the appeal window is 300s, which made that the normal case
 * rather than an edge case.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs)
    return () => window.clearInterval(id)
  }, [intervalMs])
  return now
}
