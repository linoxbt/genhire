/** Shapes returned by the GenHire contract's view methods.
 *
 * Every wei amount crosses the boundary as a decimal string, never a number -
 * a GEN amount does not survive a float. Percentages and timestamps are plain
 * integers.
 */
export type JobStatus =
  | 'drafting'
  | 'awaiting_sow'
  | 'sow_drafted'
  | 'active'
  | 'completed'
  | 'cancelled'
  | 'expired'

export type MilestoneStatus = 'pending' | 'submitted' | 'ruled' | 'settled'

export interface CriterionResult {
  criterion: string
  met: boolean
  note: string
}

export interface Milestone {
  title: string
  amount: string
  criteria: string[]
  status: MilestoneStatus
  pct: number
  paid: string
  refunded: string
  reasoning: string
  criteria_result: CriterionResult[]
  evidence: string[]
  notes: string
  submitted_at: number
  ruled_at: number
  settled_at: number
  rounds: number
}

export interface Review {
  reviewer: string
  subject: string
  text: string
  at: number
}

export interface Job {
  id: number
  client: string
  freelancer: string
  brief: string
  status: JobStatus
  created_at: number
  deadline: number
  escrow: string
  budget: string
  agreed_price: string
  milestones: Milestone[]
  sow_hash: string
  sow_version: number
  client_signed: boolean
  freelancer_signed: boolean
  accepted_proposal_idx: number
  proposal_count: number
  ruling_count: number
  dispute_milestone: number
  dispute_bond: string
  dispute_round: number
  disputer: string
  reviews: Review[]
}

export interface Proposal {
  idx: number
  from: string
  to: string
  approach: string
  price: string
  milestones: { title: string; amount: string }[]
  parent: number
  kind: 'proposal' | 'counter'
  created_at: number
}

export interface StatementOfWork {
  version: number
  hash: string
  scope: string
  assumptions: string[]
  exclusions: string[]
  milestones: { criteria: string[] }[]
}

export type Ruling =
  | { kind: 'milestone'; milestone: number; pct: number; criteria: CriterionResult[]; reasoning: string; round: number; at: number }
  | { kind: 'dispute'; milestone: number; by: string; reason: string; bond: string; contested_pct: number; at: number }
  | { kind: 'scope'; request: string; by: string; ruling: 'IN_SCOPE' | 'OUT_OF_SCOPE'; reasoning: string; sow_version: number; at: number }
  | {
      kind: 'change_order'
      request: string
      added: string
      deadline: number
      milestones: { title: string; amount: string }[]
      sow_version: number
      at: number
    }

export const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
