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

  console.log("1. client posts a funded brief");
  await send(
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
  const jobIds = await read("list_jobs");
  const jobId = Number(jobIds[jobIds.length - 1]);
  console.log(`   job #${jobId}\n`);

  console.log("2. freelancer proposes under budget, client accepts");
  // Deliberately below the posted budget. Proposing the exact amounts would make
  // the acceptance refund zero, and `_pay` returns early on zero - so the run
  // would sail past the first payout without ever exercising it. Coming in under
  // budget means acceptance itself moves GEN, which is the earliest point this
  // script can demonstrate the payout path at all.
  const P1 = 5n * GEN / 1000n;   // 0.005 GEN
  const P2 = 3n * GEN / 1000n;   // 0.003 GEN
  const expectedRefund = budget - (P1 + P2);

  await send(freelancer, "submit_proposal", [
    jobId,
    "I'll build the cart and payment step against your existing API first, then wire the confirmation email.",
    schedule(["Cart and payment UI", P1], ["Confirmation email", P2]),
  ]);

  const beforeAccept = await balance(client.address);
  await send(client, "accept_proposal", [jobId, 0]);
  const afterAccept = await balance(client.address);
  console.log(`   unspent budget refunded on acceptance: expected ${gen(expectedRefund)}`);
  console.log(`   client balance moved by ${gen(afterAccept - beforeAccept)} (gas deducted separately)`);
  console.log(`   escrow now ${gen(BigInt((await read("get_job", [jobId])).escrow))}\n`);

  console.log("3. the contract drafts the Statement of Work (validator consensus)");
  await send(client, "draft_sow", [jobId], 0n, { label: "draft_sow" });
  const sow = await read("get_sow", [jobId]);
  console.log(`   scope: ${String(sow.scope).slice(0, 200)}`);
  for (const [i, m] of (sow.milestones ?? []).entries()) {
    console.log(`   milestone ${i + 1} criteria:`);
    for (const c of m.criteria ?? []) console.log(`     - ${c}`);
  }
  console.log();

  console.log("4. both parties sign that exact text");
  const job = await read("get_job", [jobId]);
  await send(client, "sign_sow", [jobId, job.sow_hash]);
  await send(freelancer, "sign_sow", [jobId, job.sow_hash]);
  console.log(`   status: ${(await read("get_job", [jobId])).status}\n`);

  console.log("5. freelancer delivers milestone 1");
  await send(freelancer, "submit_milestone", [
    jobId,
    0,
    JSON.stringify([process.env.GENHIRE_EVIDENCE_URL ?? "https://example.com"]),
    "Cart and payment step are live at the linked URL.",
  ]);
  // The contract fetched and stored the evidence during that transaction; every
  // later ruling and appeal reads this snapshot rather than the live page.
  console.log();

  console.log("6. validators adjudicate it (validator consensus)");
  await send(client, "adjudicate_milestone", [jobId, 0], 0n, { label: "adjudicate_milestone" });
  const ruled = await read("get_job", [jobId]);
  const m0 = ruled.milestones[0];
  console.log(`   completion: ${m0.pct}%`);
  console.log(`   reasoning : ${String(m0.reasoning).slice(0, 300)}`);
  for (const c of m0.criteria_result ?? []) console.log(`     [${c.met ? "met" : "unmet"}] ${c.criterion}`);
  console.log();

  const window = Number(await read("get_appeal_window_seconds"));
  console.log(`7. waiting out the ${window}s appeal window, then settling`);
  const before = { client: await balance(client.address), freelancer: await balance(freelancer.address) };
  await sleep((window + 15) * 1000);
  await send(client, "settle_milestone", [jobId, 0], 0n, { label: "settle_milestone" });

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
