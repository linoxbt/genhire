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

async function read<T>(functionName: string, args: unknown[] = []): Promise<T> {
  return withRetry(async () => {
    const result = await readClient().readContract({
      address: getContractAddress(),
      functionName,
      args: args as never,
    })
    return result as T
  })
}

async function write(
  { account, provider }: WriteContext,
  functionName: string,
  args: unknown[] = [],
  value: bigint = 0n,
): Promise<`0x${string}`> {
  return writeClient(account, provider).writeContract({
    address: getContractAddress(),
    functionName,
    args: args as never,
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
export const getRequiredBond = (jobId: number, milestoneIdx: number) =>
  read<number>('get_required_bond', [jobId, milestoneIdx])

/** The board and dashboard both need every job, read a few at a time so the
 *  first load doesn't trip the RPC's rate limit. */
export async function getAllJobs(): Promise<Job[]> {
  const ids = await listJobs()
  const jobs = await mapWithConcurrency(ids, 4, (id) => getJob(id))
  return jobs.sort((a, b) => b.id - a.id)
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

export const submitMilestone = (
  ctx: WriteContext,
  jobId: number,
  milestoneIdx: number,
  evidenceUrls: string[],
  notes: string,
) => write(ctx, 'submit_milestone', [jobId, milestoneIdx, JSON.stringify(evidenceUrls), notes])

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
