import type { EIP1193Provider } from 'viem'
import { readClient, writeClient } from './client'
import { getContractAddress } from './network'
import { withRetry, mapWithConcurrency } from './retry'
import type { Job, Proposal, Ruling, StatementOfWork } from './types'

/**
 * Every call the app makes to the GenHire contract. There is no backend and no
 * indexer between this file and the chain: each function here is a live
 * contract call.
 */

type WriteContext = { account: `0x${string}`; provider: EIP1193Provider }

/** What genlayer-js accepts as a calldata argument. */
type Arg = string | number | boolean | bigint | Arg[]

async function read<T>(functionName: string, args: Arg[] = []): Promise<T> {
  return withRetry(async () => {
    const result = await readClient().readContract({
      address: getContractAddress(),
      functionName,
      // genlayer-js types this as its own CalldataEncodable union; `Arg` is the
      // subset this app actually sends, so the cast is narrow rather than the
      // blanket `as never` that previously erased argument checking entirely.
      args: args as Parameters<ReturnType<typeof readClient>['readContract']>[0]['args'],
    })
    return result as T
  })
}

async function write(
  { account, provider }: WriteContext,
  functionName: string,
  args: Arg[] = [],
  value: bigint = 0n,
): Promise<`0x${string}`> {
  return writeClient(account, provider).writeContract({
    address: getContractAddress(),
    functionName,
    args: args as Parameters<ReturnType<typeof writeClient>['writeContract']>[0]['args'],
    value,
  })
}

// -- reads -------------------------------------------------------------

export const listJobs = () => read<number[]>('list_jobs')
export const listJobsFor = (address: string) => read<number[]>('list_jobs_for', [address])
export const getJob = (jobId: number) => read<Job>('get_job', [jobId])
export const getProposals = (jobId: number) => read<Proposal[]>('get_proposals', [jobId])
export const getRulings = (jobId: number) => read<Ruling[]>('get_rulings', [jobId])
export const getSow = (jobId: number) => read<StatementOfWork>('get_sow', [jobId])
export const getAppealWindow = () => read<number>('get_appeal_window_seconds')
export const getMaxDisputeRounds = () => read<number>('get_max_dispute_rounds')
/** Wei, as a decimal string - a bond routinely exceeds Number.MAX_SAFE_INTEGER. */
export const getRequiredBond = (jobId: number, milestoneIdx: number) =>
  read<string>('get_required_bond', [jobId, milestoneIdx])

async function hydrate(ids: number[]): Promise<Job[]> {
  const jobs = await mapWithConcurrency(ids, 4, (id) => getJob(id))
  return jobs.sort((a, b) => b.id - a.id)
}

/** Every job on the network. Used by the board and the landing stats. */
export async function getAllJobs(): Promise<Job[]> {
  return hydrate(await listJobs())
}

/**
 * Only the jobs an address is party to.
 *
 * Filtering server-side matters: fetching every job and discarding most of them
 * cost one RPC read per job on the network to render a handful of rows, against
 * a shared per-minute bucket and a daily quota. `list_jobs_for` exists in the
 * contract for exactly this.
 */
export async function getJobsFor(address: string): Promise<Job[]> {
  return hydrate(await listJobsFor(address))
}

// -- writes ------------------------------------------------------------

export type MilestoneDraft = { title: string; amount: string }

/** The contract takes the schedule as a JSON string of {title, amount-in-wei}. */
export const encodeSchedule = (milestones: MilestoneDraft[]): string =>
  JSON.stringify(milestones.map(({ title, amount }) => ({ title: title.trim(), amount })))

export const postJob = (
  ctx: WriteContext,
  brief: string,
  milestones: MilestoneDraft[],
  deadline: number,
  total: bigint,
) => write(ctx, 'post_job', [brief, encodeSchedule(milestones), deadline], total)

export const submitProposal = (ctx: WriteContext, jobId: number, approach: string, milestones: MilestoneDraft[]) =>
  write(ctx, 'submit_proposal', [jobId, approach, encodeSchedule(milestones)])

export const counterProposal = (
  ctx: WriteContext,
  jobId: number,
  parentIdx: number,
  approach: string,
  milestones: MilestoneDraft[],
) => write(ctx, 'counter_proposal', [jobId, parentIdx, approach, encodeSchedule(milestones)])

export const acceptProposal = (ctx: WriteContext, jobId: number, proposalIdx: number) =>
  write(ctx, 'accept_proposal', [jobId, proposalIdx])

export const draftSow = (ctx: WriteContext, jobId: number) => write(ctx, 'draft_sow', [jobId])

export const signSow = (ctx: WriteContext, jobId: number, sowHash: string) =>
  write(ctx, 'sign_sow', [jobId, sowHash])

/**
 * Deliver a milestone, committing to the evidence content.
 *
 * `hashes` is one sha256 per URL, in the same order. Content-addressed
 * references (`ipfs://`, `ar://`) pass an empty string, because the reference
 * already is a hash of the bytes.
 */
export const submitMilestone = (
  ctx: WriteContext,
  jobId: number,
  milestoneIdx: number,
  evidenceUrls: string[],
  hashes: string[],
  notes: string,
) =>
  write(ctx, 'submit_milestone', [
    jobId,
    milestoneIdx,
    JSON.stringify(evidenceUrls),
    JSON.stringify(hashes),
    notes,
  ])

export const adjudicateMilestone = (ctx: WriteContext, jobId: number, milestoneIdx: number) =>
  write(ctx, 'adjudicate_milestone', [jobId, milestoneIdx])

export const disputeRuling = (
  ctx: WriteContext,
  jobId: number,
  milestoneIdx: number,
  reason: string,
  bond: bigint,
) => write(ctx, 'dispute_ruling', [jobId, milestoneIdx, reason], bond)

export const settleMilestone = (ctx: WriteContext, jobId: number, milestoneIdx: number) =>
  write(ctx, 'settle_milestone', [jobId, milestoneIdx])

export const ruleScope = (ctx: WriteContext, jobId: number, requestText: string) =>
  write(ctx, 'rule_scope', [jobId, requestText])

export const openChangeOrder = (
  ctx: WriteContext,
  jobId: number,
  requestText: string,
  milestones: MilestoneDraft[],
  newDeadline: number,
  total: bigint,
) => write(ctx, 'open_change_order', [jobId, requestText, encodeSchedule(milestones), newDeadline], total)

export const cancelJob = (ctx: WriteContext, jobId: number) => write(ctx, 'cancel_job', [jobId])
export const refundExpired = (ctx: WriteContext, jobId: number) => write(ctx, 'refund_expired', [jobId])
export const submitReview = (ctx: WriteContext, jobId: number, text: string) =>
  write(ctx, 'submit_review', [jobId, text])
