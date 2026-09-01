import { formatGen } from '../../lib/format'

/**
 * A milestone's settlement, drawn to scale.
 *
 * The filled run is what the freelancer earned; the hatched remainder is what
 * went back to the client. Hatching the remainder rather than filling it in a
 * second colour matters: a solid second colour reads as a rival quantity, a
 * hatch reads as the part that was not filled.
 */
export default function MeasureBar({
  pct,
  amountWei,
  label,
  size = 'default',
}: {
  pct: number
  amountWei?: string
  label?: string
  size?: 'default' | 'compact'
}) {
  const clamped = Math.max(0, Math.min(100, pct))
  const earned = amountWei ? (BigInt(amountWei) * BigInt(clamped)) / 100n : null
  const refunded = amountWei && earned !== null ? BigInt(amountWei) - earned : null
  const height = size === 'compact' ? 'h-14' : 'h-20 md:h-24'

  return (
    <div className="w-full">
      {label && (
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <span className="text-sm text-current">{label}</span>
          <span className="label tabnum">{clamped}% complete</span>
        </div>
      )}

      <div className={`relative w-full ${height}`}>
        {/* The scale itself. */}
        <div className="absolute top-1/2 right-0 left-0 h-px bg-current opacity-20" />

        <div className="absolute top-[32%] right-0 left-0 h-[36%] overflow-hidden">
          <div className="hatch-corridor absolute inset-y-0 right-0" style={{ left: `${clamped}%` }} />
          <div className="absolute inset-y-0 left-0 bg-current" style={{ width: `${clamped}%` }} />
        </div>

        {clamped > 0 && clamped < 100 && (
          <div
            className="wedge-marker absolute top-[12%] h-[76%] w-3 -translate-x-1/2 bg-seal-500"
            style={{ left: `${clamped}%` }}
          />
        )}

        <span className="label tabnum absolute top-0 left-0 opacity-60">0%</span>
        <span className="label tabnum absolute top-0 right-0 opacity-60">100%</span>
      </div>

      {earned !== null && refunded !== null && (
        <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 font-mono text-[0.6875rem] opacity-60">
          <span className="tabnum">to freelancer {formatGen(earned)}</span>
          <span className="tabnum">refunded {formatGen(refunded)}</span>
        </div>
      )}
    </div>
  )
}
