// Deliver, adjudicate and settle milestone 2, to observe a payment to the
// freelancer specifically. Milestone 1 settled at 0% because the evidence was
// example.com; this uses a real email template so the ruling has something to
// credit.
import { readFileSync } from "node:fs";
import { Wallet } from "ethers";
import { createClient, createAccount } from "genlayer-js";
import { studionet } from "genlayer-js/chains";

const CONTRACT = process.env.GENHIRE_ADDRESS;
const PASSWORD = process.env.GENHIRE_KEYSTORE_PASSWORD;
const JOB = Number(process.env.JOB_ID ?? 1);
const IDX = 1;
const URL = "https://raw.githubusercontent.com/leemunroe/responsive-html-email-template/master/email.html";
const gen = (w) => `${(Number(w) / 1e18).toFixed(6)} GEN`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ["PENDING","CANCELED","PROPOSED","COMMITTING","REVEALING","ACCEPTED","UNDETERMINED","FINALIZED","LEADER_TIMEOUT","VALIDATORS_TIMEOUT"];
const statusName = (t) => t?.status_name ?? (typeof t?.status === "number" ? NAMES[t.status] : String(t?.status ?? ""));
const TERMINAL = new Set(["FINALIZED","CANCELED","UNDETERMINED","LEADER_TIMEOUT","VALIDATORS_TIMEOUT"]);

const reader = createClient({ chain: studionet });
async function rpc(fn, attempts = 60) {
  for (let a = 1; ; a++) {
    try { return await fn(); } catch (e) {
      const t = String(e?.details ?? e?.message ?? "");
      if (!/rate limit|429/i.test(t) || a >= attempts) throw e;
      process.stdout.write("."); await sleep(20000);
    }
  }
}
const read = (fn, args = []) => rpc(() => reader.readContract({ address: CONTRACT, functionName: fn, args }));
async function load(n) { return createAccount((await Wallet.fromEncryptedJson(readFileSync(`/root/.genlayer/keystores/${n}.json`,"utf8"), PASSWORD)).privateKey); }

async function send(account, functionName, args = [], value = 0n) {
  const client = createClient({ chain: studionet, account });
  const hash = await rpc(() => client.writeContract({ address: CONTRACT, functionName, args, value }));
  process.stdout.write(`  ${functionName} → ${hash.slice(0,12)}… `);
  const deadline = Date.now() + 10*60*1000; let tx, wait = 4000;
  while (Date.now() < deadline) {
    await sleep(wait); wait = Math.min(wait*1.5, 20000);
    try { tx = await rpc(() => reader.getTransaction({ hash }), 8); } catch { continue; }
    if (TERMINAL.has(statusName(tx))) break;
  }
  const st = statusName(tx);
  const receipt = tx?.consensus_data?.leader_receipt?.[0];
  const res = receipt?.execution_result ?? tx?.txExecutionResultName;
  if (st !== "FINALIZED") throw new Error(`${functionName} ended as ${st}`);
  if (res && String(res).includes("ERROR")) throw new Error(`${functionName} reverted: ${JSON.stringify(receipt?.result)?.slice(0,300)}`);
  console.log(st); await sleep(2500); return tx;
}

const client = await load("verify-depositor");
const freelancer = await load("verify-counterparty");
let job = await read("get_job", [JOB]);
console.log(`job #${JOB} status ${job.status} | milestone 2 status ${job.milestones[IDX].status} | amount ${gen(BigInt(job.milestones[IDX].amount))}`);

if (job.milestones[IDX].status === "pending") {
  console.log("\ndeliver milestone 2 (real email template as evidence)");
  await send(freelancer, "submit_milestone", [JOB, IDX, JSON.stringify([URL]),
    "Order confirmation email template, HTML formatted, tested across clients."]);
}

job = await read("get_job", [JOB]);
if (job.milestones[IDX].status === "submitted") {
  console.log("\nadjudicate");
  for (let a = 1; ; a++) {
    try { await send(client, "adjudicate_milestone", [JOB, IDX]); break; }
    catch (e) { if (!/LLM_ERROR/.test(String(e.message)) || a >= 3) throw e; console.log(`   retry ${a}`); }
  }
}

job = await read("get_job", [JOB]);
const m = job.milestones[IDX];
console.log(`\n   completion: ${m.pct}%`);
console.log(`   reasoning : ${String(m.reasoning).slice(0,300)}`);

if (m.status !== "settled") {
  const win = Number(await read("get_appeal_window_seconds"));
  const elapsed = Math.max(0, Math.floor(Date.now()/1000) - Number(m.ruled_at ?? 0));
  const left = Math.max(0, win - elapsed) + 15;
  console.log(`\nsettling in ${left}s`);
  await sleep(left * 1000);
  const before = { c: await rpc(() => reader.getBalance({address: client.address})), f: await rpc(() => reader.getBalance({address: freelancer.address})) };
  await send(client, "settle_milestone", [JOB, IDX]);
  const after = { c: await rpc(() => reader.getBalance({address: client.address})), f: await rpc(() => reader.getBalance({address: freelancer.address})) };
  const s = (await read("get_job", [JOB])).milestones[IDX];
  console.log(`\n   ruled completion : ${s.pct}%`);
  console.log(`   paid to freelancer: ${gen(BigInt(s.paid))}`);
  console.log(`   refunded to client: ${gen(BigInt(s.refunded))}`);
  console.log(`   paid + refunded == amount: ${BigInt(s.paid)+BigInt(s.refunded) === BigInt(m.amount)}`);
  console.log(`   freelancer ${gen(before.f)} → ${gen(after.f)}  delta ${gen(after.f - before.f)}`);
  console.log(`   client     ${gen(before.c)} → ${gen(after.c)}  delta ${gen(after.c - before.c)}`);
  console.log(`\n   FREELANCER PAID: ${after.f > before.f}`);
}
