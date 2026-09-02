import { useEffect, useRef } from 'react'

const EDGE_FRACTION = 0.12

/**
 * Drives a pinned scroll sequence: a tall wrapper containing a `sticky` viewport
 * with N absolutely-stacked panels, one revealed at a time as you scroll.
 *
 * Panel opacity and transform are written as **inline style, not React state**.
 * Putting scroll position into state would re-render the whole sequence on every
 * frame; this way scrolling touches nothing but two style properties.
 */
export function useScrollSequence<T extends HTMLElement>(count: number) {
  const wrapperRef = useRef<T | null>(null)
  const panelRefs = useRef<(HTMLElement | null)[]>([])

  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper || count === 0) return

    // Imperative style writes bypass the CSS reduced-motion blanket, so honour
    // it here by simply showing every panel and doing nothing further.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      panelRefs.current.forEach((panel) => {
        if (!panel) return
        panel.style.opacity = '1'
        panel.style.transform = 'none'
        panel.style.position = 'relative'
        panel.setAttribute('aria-hidden', 'false')
        panel.inert = false
      })
      return
    }

    let ticking = false
    const update = () => {
      ticking = false
      const rect = wrapper.getBoundingClientRect()
      const viewportHeight = window.innerHeight || 1
      const total = rect.height + viewportHeight
      const progress = Math.min(1, Math.max(0, (viewportHeight - rect.top) / total))
      const segment = 1 / count

      panelRefs.current.forEach((panel, i) => {
        if (!panel) return
        const start = i * segment
        const local = (progress - start) / segment
        let opacity = 0
        if (local >= 0 && local <= 1) {
          if (local < EDGE_FRACTION) opacity = local / EDGE_FRACTION
          else if (local > 1 - EDGE_FRACTION) opacity = (1 - local) / EDGE_FRACTION
          else opacity = 1
        }
        const offset = 24 * (1 - opacity)
        const scale = 0.92 + 0.08 * opacity
        panel.style.opacity = String(opacity)
        panel.style.transform = `translateY(${offset}px) scale(${scale})`
        // A panel faded to nothing is still read aloud and still in the
        // accessibility tree, so all N panels arrived as one wall of text.
        // Hide the ones that are not on screen.
        const hidden = opacity < 0.5
        panel.setAttribute('aria-hidden', hidden ? 'true' : 'false')
        panel.inert = hidden
      })
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [count])

  return { wrapperRef, panelRefs }
}
