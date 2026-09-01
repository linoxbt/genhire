/**
 * The GenHire mark — a seal impression cut into two unequal parts.
 *
 * The cut is the whole idea. GenHire settles a milestone on a completion
 * percentage rather than a verdict, so the mark is a seal (an executed
 * agreement) divided 70/30: the filled major segment is what was earned, the
 * accent minor segment is what was refunded. The same geometry is reprojected
 * to polar as the landing page's completion gauge, so the logo and the data
 * visualisation are literally the same shape.
 *
 * Geometry is fixed on a 48-unit viewBox: rim at r=19, the split disc at r=14,
 * cut at 70% across. The two segments are drawn against slightly different
 * chords (31.0 and 32.2) so a hairline of paper shows between them — that gap
 * is what makes it read as a *cut* rather than a pie slice.
 */

// Below this size the impressed inner rim stops resolving and merges with the
// outer rim into a single grey band, so it is dropped — an optical size, not a
// scaled-down copy.
const RIM_MIN_SIZE = 28

interface SealProps {
  size?: number
  /** Ink for the major segment and rim. */
  ink?: string
  /** The minor segment — the refunded share. */
  accent?: string
  className?: string
}

function SealShape({ size = 32, ink, accent, className = '' }: Required<Pick<SealProps, 'ink' | 'accent'>> & SealProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={`shrink-0 ${className}`}
      aria-hidden="true"
    >
      <circle cx="24" cy="24" r="19" fill="none" stroke={ink} strokeWidth="2.4" />
      {size >= RIM_MIN_SIZE && (
        <circle cx="24" cy="24" r="15.6" fill="none" stroke={ink} strokeWidth="1" opacity="0.4" />
      )}
      <path d="M31.0 11.876 A14 14 0 1 0 31.0 36.124 Z" fill={ink} />
      <path d="M32.2 12.653 A14 14 0 0 1 32.2 35.347 Z" fill={accent} />
    </svg>
  )
}

/** The mark on paper. */
export function Seal({ size = 32, className }: SealProps) {
  return <SealShape size={size} ink="#1c1a17" accent="#c2482a" className={className} />
}

/** The mark on ink — used in the menu overlay, the hero and the footer. */
export function DarkSeal({ size = 32, className }: SealProps) {
  return <SealShape size={size} ink="#faf8f4" accent="#d9694c" className={className} />
}

export function Wordmark({ dark = false, className = '' }: { dark?: boolean; className?: string }) {
  return (
    <span
      className={`font-serif font-semibold tracking-tight ${dark ? 'text-paper' : 'text-ink'} ${className}`}
    >
      GenHire
    </span>
  )
}

/** Mark + wordmark, the standard horizontal lockup. */
export function Lockup({
  size = 30,
  dark = false,
  className = '',
}: {
  size?: number
  dark?: boolean
  className?: string
}) {
  return (
    <span className={`flex items-center gap-2 sm:gap-2.5 ${className}`}>
      {dark ? <DarkSeal size={size} /> : <Seal size={size} />}
      <Wordmark dark={dark} className="text-lg sm:text-xl" />
    </span>
  )
}
