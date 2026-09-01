/**
 * Every destination in the app, in one place.
 *
 * This is the *only* navigation source: there is no desktop nav bar, so the
 * menu and the footer both read from here and cannot drift apart.
 */
export const MENU_LINKS = [
  { to: '/jobs', label: 'Board', blurb: 'Every engagement on this network' },
  { to: '/post', label: 'Post a brief', blurb: 'Describe the work and fund it' },
  { to: '/dashboard', label: 'My engagements', blurb: 'Your side of every agreement' },
  { to: '/about', label: 'How it works', blurb: 'Adjudication without an adjudicator' },
] as const

export const REPO_URL = 'https://github.com/linoxbt/genhire'
