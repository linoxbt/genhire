const CENTER = 50
const OUTER_RADIUS = 42
const INNER_RADIUS = 33

/**
 * An arc expressed as a dash pattern.
 *
 * Drawing arcs as `stroke-dasharray`/`dashoffset` on a full circle avoids the
 * trigonometry and the large-arc-flag edge cases of a real arc path, and it
 * degenerates correctly at 0% and 100% where a path would produce a glitch.
 */
function arc(radius: number, fromPct: number, toPct: number) {
  const circumference = 2 * Math.PI * radius
  const from = Math.max(0, Math.min(100, fromPct))
  const to = Math.max(0, Math.min(100, toPct))
  const length = ((to - from) / 100) * circumference
  return {
    dasharray: `${length} ${circumference - length}`,
    dashoffset: -((from / 100) * circumference),
  }
}

/**
 * The mark, drawn as data.
 *
 * The logo is a seal cut into two unequal parts; this is the same split
 * reprojected to polar, with the cut placed at whatever percentage a milestone
 * was actually ruled at. Rotated -90° so zero sits at twelve o'clock.
 */
export default function SealGauge({ pct, size = 220 }: { pct: number; size?: number }) {
  const clamped = Math.max(0, Math.min(100, pct))
  const earned = arc(OUTER_RADIUS, 0, clamped)
  const refunded = arc(INNER_RADIUS, clamped, 100)
  const angle = -90 + (clamped / 100) * 360

  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" aria-hidden="true" className="shrink-0">
      {/* Ghost rings: the full scale, so a small percentage still reads as a
          share of something rather than as a lonely stub. */}
      <circle cx={CENTER} cy={CENTER} r={OUTER_RADIUS} stroke="currentColor" strokeWidth="1" opacity="0.18" />
      <circle cx={CENTER} cy={CENTER} r={INNER_RADIUS} stroke="currentColor" strokeWidth="1" opacity="0.12" />

      <circle
        cx={CENTER}
        cy={CENTER}
        r={OUTER_RADIUS}
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="butt"
        strokeDasharray={earned.dasharray}
        strokeDashoffset={earned.dashoffset}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
      />
      <circle
        cx={CENTER}
        cy={CENTER}
        r={INNER_RADIUS}
        className="stroke-seal-500"
        strokeWidth="2.5"
        strokeLinecap="butt"
        strokeDasharray={refunded.dasharray}
        strokeDashoffset={refunded.dashoffset}
        transform={`rotate(-90 ${CENTER} ${CENTER})`}
      />

      {/* The cut, marked on the scale. */}
      <line
        x1={CENTER}
        y1={CENTER - OUTER_RADIUS - 4}
        x2={CENTER}
        y2={CENTER - INNER_RADIUS + 4}
        className="stroke-seal-500"
        strokeWidth="2.5"
        strokeLinecap="round"
        transform={`rotate(${angle} ${CENTER} ${CENTER})`}
      />
    </svg>
  )
}
