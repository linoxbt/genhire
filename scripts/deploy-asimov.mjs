/**
 * Deploy GenHire to Testnet Asimov.
 *
 * The `genlayer` CLI cannot do this for a contract this size: genlayer-js only
 * sets an explicit gas limit if you give it one, otherwise it estimates and, on
 * a failed estimate, falls back to FALLBACK_GAS = 1_000_000. This contract is
 * ~73 kB, so its *intrinsic* calldata cost alone is ~1.17M gas — the fallback is
 * below the floor and the node rejects it with "intrinsic gas too low" before
 * execution is even considered. Passing `gas` explicitly is the fix.
 */
import { readFileSync } from "node:fs";
import { Wallet } from "ethers";
import { createClient, createAccount } from "genlayer-js";
import { testnetAsimov } from "genlayer-js/chains";

const PASSWORD = process.env.GENHIRE_KEYSTORE_PASSWORD;
const KEYSTORE = process.env.GENHIRE_DEPLOYER_KEYSTORE ?? "verify-depositor";
const WINDOW = Number(process.env.GENHIRE_APPEAL_WINDOW ?? 300);
if (!PASSWORD) { console.error("set GENHIRE_KEYSTORE_PASSWORD"); process.exit(1); }

const code = readFileSync(process.env.GENHIRE_CONTRACT ?? "contracts/genhire.py", "utf8");
const wallet = await Wallet.fromEncryptedJson(
  readFileSync(`/root/.genlayer/keystores/${KEYSTORE}.json`, "utf8"), PASSWORD);
const account = createAccount(wallet.privateKey);
const client = createClient({ chain: testnetAsimov, account });

// genlayer-js sizes a deploy by calling `estimateTransactionGas` against the
// consensus contract and, when that reverts, silently falls back to 200_000.
// A contract this size costs ~1.17M gas in intrinsic calldata alone, so the
// fallback is below the floor and the node rejects the transaction outright
// with "intrinsic gas too low" before execution is considered. `deployContract`
// does not forward a `gas` option, so the supported seam is this method: keep
// the real estimate when it works, and substitute an intrinsic-cost floor when
// it does not, rather than a constant that has no relationship to the payload.
const estimateOriginal = client.estimateTransactionGas.bind(client);
client.estimateTransactionGas = async (params) => {
  try {
    return await estimateOriginal(params);
  } catch {
    const calldataBytes = ((params?.data?.length ?? 2) - 2) / 2;
    const floor = BigInt(Math.ceil(21_000 + calldataBytes * 16 * 1.5 + 800_000));
    console.log(`  estimate reverted; using intrinsic floor ${floor.toLocaleString()} gas`);
    return floor;
  }
};

// Intrinsic cost is 16 gas per non-zero calldata byte; double it for headroom
// plus the deploy itself.
console.log(`deployer ${account.address}`);
console.log(`code ${code.length} bytes · appeal window ${WINDOW}s`);

const hash = await client.deployContract({ code, args: [WINDOW] });
console.log(`deploy tx ${hash}`);

const NAMES = ["UNINITIALIZED","PENDING","PROPOSING","COMMITTING","REVEALING","ACCEPTED",
  "UNDETERMINED","FINALIZED","CANCELED","APPEAL_REVEALING","APPEAL_COMMITTING",
  "READY_TO_FINALIZE","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"];
const name = (tx) => { const r = tx?.status_name ?? tx?.status;
  return typeof r === "number" ? (NAMES[r] ?? `UNKNOWN(${r})`) : (r ?? "PENDING"); };

let wait = 4000, tx;
const deadline = Date.now() + 10 * 60 * 1000;
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, wait));
  wait = Math.min(wait * 1.5, 20000);
  try { tx = await client.getTransaction({ hash }); } catch { continue; }
  const s = name(tx);
  process.stdout.write(`  ${s}\n`);
  if (["FINALIZED","UNDETERMINED","CANCELED","VALIDATORS_TIMEOUT","LEADER_TIMEOUT"].includes(s)) break;
}
if (name(tx) !== "FINALIZED") { console.error("deploy did not finalize"); process.exit(1); }
const receipt = tx?.consensus_data?.leader_receipt?.[0];
if (receipt?.execution_result && receipt.execution_result !== "SUCCESS") {
  console.error("constructor failed:", receipt.execution_result); process.exit(1);
}
console.log(`\nCONTRACT ${tx.to_address ?? tx.data?.contract_address ?? "(see receipt)"}`);
console.log(JSON.stringify({ to: tx.to_address, addr: tx?.data?.contract_address }, null, 2));
