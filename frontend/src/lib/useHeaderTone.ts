import { useLayoutEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Reports whether a dark section currently sits under the header band, so the
 * header can float transparently over it instead of laying a paper bar across
 * it. Any section opts in with `data-tone="dark"`.
 */
export function useHeaderTone(): 'light' | 'dark' {
  const [tone, setTone] = useState<'light' | 'dark'>('light')
  const { pathname } = useLocation()

  // Keyed on the route: the shell outlives navigation, so the observer has to
  // be rebuilt when the page under it changes and brings different (or no)
  // dark sections. Without a dependency array this would re-observe on every
  // render, and since the effect itself calls setTone, that is a loop.
  useLayoutEffect(() => {
    const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-tone="dark"]'))
    if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') {
      setTone('light')
      return
    }

    // The observer only fires on a *change*, so a page whose first section is
    // already dark would paint one frame of light header before correcting.
    // Reading the DOM synchronously here gets the first paint right.
    const main = document.querySelector('main')
    if (main?.firstElementChild?.getAttribute('data-tone') === 'dark') setTone('dark')

    const observer = new IntersectionObserver(
      (entries) => setTone(entries.some((entry) => entry.isIntersecting) ? 'dark' : 'light'),
      // A thin band pinned to the header's own height: a dark section counts
      // only once it is actually behind the header, not merely on screen.
      { rootMargin: '-1px 0px -95% 0px', threshold: 0 },
    )
    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [pathname])

  return tone
}
