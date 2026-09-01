import { useEffect, useRef, useState } from 'react'

/**
 * Fires once when the element first enters the viewport, then disconnects.
 *
 * One-shot on purpose: a reveal that replays every time you scroll back past
 * it stops reading as a reveal and starts reading as a glitch.
 */
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true) // no observer: show the content rather than hide it forever
      return
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])

  return { ref, inView }
}
