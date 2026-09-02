/**
 * The contract's limits, mirrored for the UI.
 *
 * These are enforced in `contracts/genhire.py` regardless; duplicating them
 * here is purely so a user finds out before signing rather than by way of a
 * reverted transaction. Keep in step with the constants at the top of the
 * contract.
 */
export const LIMITS = {
  brief: 8000,
  approach: 6000,
  notes: 2000,
  reason: 2000,
  scopeRequest: 2000,
  review: 280,
  milestones: 8,
  evidenceUrls: 5,
} as const

const EVIDENCE_SCHEMES = ['http://', 'https://', 'ipfs://', 'ar://']

export const isAcceptableEvidenceUrl = (url: string): boolean =>
  EVIDENCE_SCHEMES.some((scheme) => url.startsWith(scheme))

/** Every problem with a milestone schedule, in the contract's own terms. */
export function scheduleProblems(
  rows: { title: string; gen: string }[],
  toWei: (gen: string) => bigint,
  { existing = 0, budget }: { existing?: number; budget?: bigint } = {},
): string[] {
  const problems: string[] = []
  if (rows.some((row) => !row.title.trim())) problems.push('Every milestone needs a title.')

  let total: bigint | null = 0n
  for (const row of rows) {
    let amount: bigint
    try {
      amount = row.gen ? toWei(row.gen) : 0n
    } catch {
      total = null
      break
    }
    // The contract rejects a zero-value milestone outright, so checking only
    // the total lets a blank row through and reverts the whole transaction.
    if (amount === 0n) {
      problems.push('Every milestone needs an amount greater than zero.')
      break
    }
    if (total !== null) total += amount
  }

  if (total === null) problems.push('One of the amounts is not a number.')
  else if (total === 0n) problems.push('The total must be greater than zero.')
  else if (budget !== undefined && total > budget) {
    problems.push('The total is more than the budget escrowed on this job.')
  }

  if (existing + rows.length > LIMITS.milestones) {
    problems.push(
      existing > 0
        ? `A job may hold at most ${LIMITS.milestones} milestones in total, and this one already has ${existing}.`
        : `At most ${LIMITS.milestones} milestones.`,
    )
  }
  return problems
}
