/**
 * Drives one complete GenHire engagement against a live network and prints the
 * on-chain balances either side of settlement.
 *
 * Written for genlayer-js rather than the `genlayer` CLI because the CLI's
 * `write` command hardcodes `value: 0n` and cannot call a payable method at
 * all - and every interesting step here (posting, disputing, amending) is
 * payable.
 *
 *   GENHIRE_ADDRESS=0x... GENHIRE_KEYSTORE_PASSWORD=... node scripts/smoke.mjs
 */
import { readFileSync } from "node:fs";
import { Wallet } from "ethers";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const CONTRACT = process.env.GENHIRE_ADDRESS;
const PASSWORD = process.env.GENHIRE_KEYSTORE_PASSWORD;
const KEYSTORES = "/root/.genlayer/keystores";
const CLIENT_KEYSTORE = process.env.GENHIRE_CLIENT_KEYSTORE ?? "verify-depositor";
const FREELANCER_KEYSTORE = process.env.GENHIRE_FREELANCER_KEYSTORE ?? "verify-counterparty";

if (!CONTRACT || !PASSWORD) {
  console.error("set GENHIRE_ADDRESS and GENHIRE_KEYSTORE_PASSWORD");
  process.exit(1);
}

const GEN = 10n ** 18n;
const gen = (wei) => `${(Number(wei) / 1e18).toFixed(6)} GEN`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function load(name) {
  const json = readFileSync(`${KEYSTORES}/${name}.json`, "utf8");
  const wallet = await Wallet.fromEncryptedJson(json, PASSWORD);
  return createAccount(wallet.privateKey);
}

const reader = createClient({ chain: studionet });

async function balance(address) {
  return rpc("getBalance", () => reader.getBalance({ address }));
}

/**
 * Any RPC call, retried through a rate limit.
 *
 * Studio's daily bucket refills as old requests age out, so once it is spent
 * the endpoint yields roughly one request every few tens of seconds rather than
 * refusing outright for a day. A run that dies on the first 429 cannot make
 * progress through that; one that waits for the server's own `retry_after` can,
 * slowly. Any other error is thrown immediately - a genuine failure should not
 * be retried into a long silence.
 */
async function rpc(label, fn, { attempts = 40 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const text = String(error?.details ?? error?.message ?? "");
      if (!/rate limit|429/i.test(text) || attempt >= attempts) throw error;
      const after = Number(error?.cause?.data?.retry_after_seconds ?? 0);
      const waitMs = Math.min(Math.max(after, 15), 120) * 1000;
      process.stdout.write(`  [rate limited on ${label}; waiting ${waitMs / 1000}s]\n`);
      await sleep(waitMs);
    }
  }
}

async function read(functionName, args = []) {
  return rpc(functionName, () => reader.readContract({ address: CONTRACT, functionName, args }));
}

/**
 * Send a write and wait for real finality.
 *
 * ACCEPTED only means the transaction landed in a block - the contract call
 * inside it can still have reverted - so this waits for FINALIZED and then
 * checks the execution result before reporting success.
 */
async function send(account, functionName, args = [], value = 0n, { label } = {}) {
  const client = createClient({ chain: studionet, account });
  const hash = await rpc(functionName, () =>
    client.writeContract({ address: CONTRACT, functionName, args, value }),
  );
  process.stdout.write(`  ${label ?? functionName} → ${hash.slice(0, 12)}… `);

  // Back off as the wait lengthens. A flat 4s poll over a 10-minute budget is
  // ~150 requests per write, which is enough to spend a whole day's RPC quota
  // in one run - and a validator round is never going to finish on the second
  // poll anyway.
  const deadline = Date.now() + 10 * 60 * 1000;
  let tx;
  let wait = 4000;
  while (Date.now() < deadline) {
    await sleep(wait);
    wait = Math.min(wait * 1.5, 20000);
    try {
      tx = await rpc(`${functionName} status`, () => reader.getTransaction({ hash }), { attempts: 8 });
    } catch {
      continue;
    }
    if (TERMINAL.has(statusName(tx))) break;
  }
  const status = statusName(tx);
  const result = tx?.consensus_data?.leader_receipt?.[0]?.execution_result ?? tx?.txExecutionResultName;
  if (status !== "FINALIZED") throw new Error(`${functionName} ended as ${status}`);
  if (result && String(result).includes("ERROR")) {
    const err = tx?.consensus_data?.leader_receipt?.[0]?.result;
    throw new Error(`${functionName} reverted: ${JSON.stringify(err)?.slice(0, 400)}`);
  }
  console.log(`${status}`);
  await sleep(2500); // pace against studionet's shared rate limit
  return tx;
}

/**
 * `getTransaction` reports status as the numeric enum ordinal, not the name -
 * and `status_name` is only populated on some RPC paths. Normalising both here
 * is the difference between seeing finality and polling until the budget runs
 * out on a transaction that finalized minutes ago.
 */
const STATUS_NAMES = [
  "UNINITIALIZED", "PENDING", "PROPOSING", "COMMITTING", "REVEALING", "ACCEPTED",
  "UNDETERMINED", "FINALIZED", "CANCELED", "APPEAL_REVEALING", "APPEAL_COMMITTING",
  "READY_TO_FINALIZE", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT",
];
const TERMINAL = new Set(["FINALIZED", "UNDETERMINED", "CANCELED", "VALIDATORS_TIMEOUT", "LEADER_TIMEOUT"]);

function statusName(tx) {
  const raw = tx?.status_name ?? tx?.status;
  if (typeof raw === "number") return STATUS_NAMES[raw] ?? `UNKNOWN(${raw})`;
  return typeof raw === "string" ? raw : "PENDING";
}

const schedule = (...parts) =>
  JSON.stringify(parts.map(([title, amount], i) => ({ title, amount: amount.toString() })));

async function main() {
  const client = await load(CLIENT_KEYSTORE);
  const freelancer = await load(FREELANCER_KEYSTORE);
  console.log(`contract   ${CONTRACT}`);
  console.log(`client     ${client.address}  ${gen(await balance(client.address))}`);
  console.log(`freelancer ${freelancer.address}  ${gen(await balance(freelancer.address))}`);
  console.log(`appeal window ${await read("get_appeal_window_seconds")}s\n`);

  const M1 = 6n * GEN / 1000n;   // 0.006 GEN
  const M2 = 4n * GEN / 1000n;   // 0.004 GEN
  const budget = M1 + M2;
  const deadline = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

  // Resume support. Three lifecycle runs have been lost to a spent RPC quota or
  // a session ending, each time discarding transactions that had already
  // succeeded. Under a spent daily bucket Studio yields roughly one request every
  // 15-30s, so a run that cannot pick up where it left off may never finish.
  // Pass GENHIRE_JOB_ID to rejoin an existing job; every step below re-reads
  // state and skips itself if its effect is already on chain.
  const RESUME = process.env.GENHIRE_JOB_ID ? Number(process.env.GENHIRE_JOB_ID) : null;
  const done = (label) => console.log(`  ${label}: already on chain, skipping`);

  console.log("1. client posts a funded brief");
  if (RESUME) done("post_job");
  else await send(
    client,
    "post_job",
    [
      "Build a checkout flow for a small storefront: a cart page, a payment step, " +
        "and an order confirmation email. Must work on mobile.",
      schedule(["Cart and payment UI", M1], ["Confirmation email", M2]),
      deadline,
    ],
    budget,
    { label: "post_job" },
  );
  let jobId = RESUME;
  if (jobId === null) {
    const jobIds = await read("list_jobs");
    jobId = Number(jobIds[jobIds.length - 1]);
  }
  console.log(`   job #${jobId}\n`);
  let state = await read("get_job", [jobId]);

  console.log("2. freelancer proposes under budget, client accepts");
  // Deliberately below the posted budget. Proposing the exact amounts would make
  // the acceptance refund zero, and `_pay` returns early on zero - so the run
  // would sail past the first payout without ever exercising it. Coming in under
  // budget means acceptance itself moves GEN, which is the earliest point this
  // script can demonstrate the payout path at all.
  const P1 = 5n * GEN / 1000n;   // 0.005 GEN
  const P2 = 3n * GEN / 1000n;   // 0.003 GEN
  const expectedRefund = budget - (P1 + P2);

  // `awaiting_proposals` is the only status from which a proposal is still due.
  if (state.status === "awaiting_proposals" && (state.proposals ?? []).length === 0) {
    await send(freelancer, "submit_proposal", [
      jobId,
      "I'll build the cart and payment step against your existing API first, then wire the confirmation email.",
      schedule(["Cart and payment UI", P1], ["Confirmation email", P2]),
    ]);
  } else done("submit_proposal");

  if (state.status === "awaiting_proposals") {
    const beforeAccept = await balance(client.address);
    await send(client, "accept_proposal", [jobId, 0]);
    const afterAccept = await balance(client.address);
    console.log(`   unspent budget refunded on acceptance: expected ${gen(expectedRefund)}`);
    console.log(`   client balance moved by ${gen(afterAccept - beforeAccept)} (gas deducted separately)`);
  } else done("accept_proposal");
  state = await read("get_job", [jobId]);
  console.log(`   escrow now ${gen(BigInt(state.escrow))}\n`);

  console.log("3. the contract drafts the Statement of Work (validator consensus)");
  if (Number(state.sow_version ?? 0) > 0) done("draft_sow");
  else await send(client, "draft_sow", [jobId], 0n, { label: "draft_sow" });
  const sow = await read("get_sow", [jobId]);
  console.log(`   scope: ${String(sow.scope).slice(0, 200)}`);
  for (const [i, m] of (sow.milestones ?? []).entries()) {
    console.log(`   milestone ${i + 1} criteria:`);
    for (const c of m.criteria ?? []) console.log(`     - ${c}`);
  }
  console.log();

  console.log("4. both parties sign that exact text");
  const job = await read("get_job", [jobId]);
  // A signature is recorded as the hash the party signed, so a non-empty field
  // means that side is already bound to this exact text.
  if (job.client_signed_hash) done("sign_sow (client)");
  else await send(client, "sign_sow", [jobId, job.sow_hash]);
  if (job.freelancer_signed_hash) done("sign_sow (freelancer)");
  else await send(freelancer, "sign_sow", [jobId, job.sow_hash]);
  state = await read("get_job", [jobId]);
  console.log(`   status: ${state.status}\n`);

  console.log("5. freelancer delivers milestone 1");
  if (state.milestones[0].status !== "pending") done("submit_milestone");
  else await send(freelancer, "submit_milestone", [
    jobId,
    0,
    JSON.stringify([process.env.GENHIRE_EVIDENCE_URL ?? "https://example.com"]),
    "Cart and payment step are live at the linked URL.",
  ]);
  // The contract fetched and stored the evidence during that transaction; every
  // later ruling and appeal reads this snapshot rather than the live page.
  console.log();

  console.log("6. validators adjudicate it (validator consensus)");
  // A verdict that parses but is off-schema rolls the transaction back, leaving
  // the milestone untouched - and adjudication is permissionless, so retrying is
  // safe and costs nothing but a round. Deliberately not handled in the contract:
  // a repair pass there would have masked the parsed-object bug this run exists
  // to prove is fixed.
  state = await read("get_job", [jobId]);
  if (state.milestones[0].status === "submitted") {
    for (let attempt = 1; ; attempt++) {
      try {
        await send(client, "adjudicate_milestone", [jobId, 0], 0n, { label: "adjudicate_milestone" });
        break;
      } catch (error) {
        if (!/LLM_ERROR/.test(String(error.message)) || attempt >= 3) throw error;
        console.log(`   attempt ${attempt}: model returned an unusable verdict, retrying`);
      }
    }
  } else done("adjudicate_milestone");
  const ruled = await read("get_job", [jobId]);
  const m0 = ruled.milestones[0];
  console.log(`   completion: ${m0.pct}%`);
  console.log(`   reasoning : ${String(m0.reasoning).slice(0, 300)}`);
  for (const c of m0.criteria_result ?? []) console.log(`     [${c.met ? "met" : "unmet"}] ${c.criterion}`);
  console.log();

  const window = Number(await read("get_appeal_window_seconds"));
  const already = ruled.milestones[0].status === "settled";
  // On a resume the ruling may be minutes old, so wait out only what is left of
  // the window rather than the whole of it again.
  const elapsed = Math.max(0, Math.floor(Date.now() / 1000) - Number(m0.ruled_at ?? 0));
  const remaining = already ? 0 : Math.max(0, window - elapsed) + 15;
  console.log(`7. waiting out the ${window}s appeal window, then settling`);
  if (remaining > 0) console.log(`   ${remaining}s left to wait (ruled ${elapsed}s ago)`);

  const before = { client: await balance(client.address), freelancer: await balance(freelancer.address) };
  if (already) {
    done("settle_milestone");
  } else {
    await sleep(remaining * 1000);
    await send(client, "settle_milestone", [jobId, 0], 0n, { label: "settle_milestone" });
  }

  const after = { client: await balance(client.address), freelancer: await balance(freelancer.address) };
  const settled = (await read("get_job", [jobId])).milestones[0];
  console.log(`\n   milestone amount : ${gen(P1)}`);
  console.log(`   ruled completion : ${settled.pct}%`);
  console.log(`   paid to freelancer: ${gen(BigInt(settled.paid))}`);
  console.log(`   refunded to client: ${gen(BigInt(settled.refunded))}`);
  console.log(`   paid + refunded == amount: ${BigInt(settled.paid) + BigInt(settled.refunded) === P1}`);
  console.log(`\n   freelancer balance ${gen(before.freelancer)} → ${gen(after.freelancer)} (delta ${gen(after.freelancer - before.freelancer)})`);
  console.log(`   client     balance ${gen(before.client)} → ${gen(after.client)} (delta ${gen(after.client - before.client)})`);
  console.log(`\n   job status: ${(await read("get_job", [jobId])).status}`);
  console.log(`   escrow left: ${gen(BigInt((await read("get_job", [jobId])).escrow))}`);
}

main().catch((e) => {
  console.error("\nFAILED:", e.message);
  process.exit(1);
});
