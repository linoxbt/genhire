import { useEffect, useRef } from 'react'

/**
 * Progressively blurs an element as it scrolls out of view.
 *
 * Where the browser supports scroll-driven animations, the `.scroll-depth-blur`
 * class in index.css does this natively and this hook does nothing at all. This
 * is only the fallback for browsers without `animation-timeline: view()`.
 */
export function useScrollDepth<T extends HTMLElement>(maxBlurPx = 9) {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof CSS !== 'undefined' && CSS.supports?.('animation-timeline', 'view()')) return
    // Writing `style` imperatively bypasses the global reduced-motion rule in
    // index.css, so it has to be checked again here.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    let ticking = false
    const update = () => {
      ticking = false
      const rect = node.getBoundingClientRect()
      const viewportHeight = window.innerHeight || 1
      const progress = 1 - rect.top / viewportHeight
      // Matches the CSS keyframe's hold: sharp until well past the heading.
      const clamped = Math.min(1, Math.max(0, (progress - 0.9) / 0.4))
      node.style.filter = clamped <= 0 ? '' : `blur(${(clamped * maxBlurPx).toFixed(1)}px)`
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
      node.style.filter = ''
    }
  }, [maxBlurPx])

  return ref
}
