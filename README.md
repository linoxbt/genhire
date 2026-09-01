# GenHire

**An engagement marketplace where the contract drafts the agreement it enforces — and settles it proportionally.**

A client posts a brief and funds it. A freelancer proposes terms; either side can counter. When a
proposal is accepted, the GenLayer Intelligent Contract **drafts the binding Statement of Work
itself** — turning vague wording into specific, individually checkable acceptance criteria — and both
parties sign that exact text before any work starts. From then on, every question is ruled on by
validator consensus against the text the contract wrote: did this milestone meet its criteria, and is
this new request inside the agreed scope.

Payment settles **proportionally**. Adjudication returns a completion percentage, not a verdict, and
escrow splits on it.

| | |
|---|---|
| **Contract** | [`contracts/genhire.py`](contracts/genhire.py) — Python / GenVM, one contract, no backend |
| **Live network** | GenLayer Studio Network — see [Networks](#networks) |
| **Frontend** | Vite + React 19 + TypeScript, a static SPA talking straight to the chain |
| **Chain access** | [`genlayer-js`](https://github.com/genlayerlabs/genlayer-js) — no server, no indexer, no database |

---

## Why this needs GenLayer

An ordinary smart contract can hold money and release it on a condition it can *check*: a signature,
a balance, a block height. It cannot read a repository and decide whether the checkout flow it finds
there is what the brief asked for. That judgment has always had to come from outside the contract —
an oracle, a nominated arbitrator, a platform's support queue — and whoever provides it is a party
with power over the outcome.

A GenLayer Intelligent Contract runs its own non-deterministic step inside consensus. Independent
validators, often on different underlying models, each fetch the delivered work themselves and
re-derive the judgment; they must agree on the *substance* of the answer rather than on identical
bytes (the Equivalence Principle). No single model's opinion is trusted, and no address anywhere can
overrule the result.

That capability is what makes the three mechanics below possible at all.

## What is different here

**1. The contract drafts the terms.** Most escrow designs take acceptance criteria as an input: one
party writes them, the other agrees, and a judge is handed them later. That rewards whoever writes
more carefully, and it is where real disputes actually start — not in the delivery but in what was
agreed. GenHire inverts it. The brief and the accepted proposal go in; `draft_sow` produces the
scope, assumptions, exclusions and one criteria list per milestone. Both parties then sign that exact
text **by its hash**, so nobody is bound by a draft they were never shown, and neither party wrote
the standard they will be held to.

**2. Rulings are proportions.** `adjudicate_milestone` returns a completion percentage from 0 to 100
with a per-criterion breakdown. Escrow splits on it: the freelancer receives `amount × pct ÷ 100`,
the client is refunded the remainder including the rounding dust. Real work lands partly done far
more often than it lands cleanly failed; a yes/no verdict forces the adjudicator to round a
substantially-delivered milestone to either full payment or nothing. All-or-nothing still exists —
it is the 100 and 0 cases.

**3. Scope is a decidable question.** "That was always included" against "that is new work" ends more
engagements than bad delivery does. Because the signed Statement of Work is on chain, `rule_scope`
can answer it: `IN_SCOPE` means the freelancer owes it at the agreed price, `OUT_OF_SCOPE` means it
needs a funded change order — an amendment that adds escrow, re-drafts the whole agreement, and
requires both signatures again before it is in force.

## Lifecycle

```
drafting ──accept_proposal──▶ awaiting_sow ──draft_sow──▶ sow_drafted
                                                              │ sign_sow ×2
                                                              ▼
                                         active ⇄ rule_scope / open_change_order
                                            │ submit_milestone
                                            ▼
                                        submitted ──adjudicate_milestone──▶ ruled
                                            ▲ dispute_ruling (bonded, capped)  │
                                            └──────────────────────────────────┤
                                                    settle_milestone (after window)
                                                              ▼
                                                  next milestone … ▶ completed

  escapes: cancel_job (nothing accepted yet) · refund_expired (deadline passed)
```

1. **Post and fund.** `post_job` escrows the whole budget up front — a GenLayer contract cannot pull
   funds from a wallet later, so escrow is only ever as real as what arrived with the call.
2. **Negotiate.** Freelancers propose at or below the budget; either side can counter, and a counter
   is addressed back at whoever made the offer it answers. Accepting refunds the unspent remainder to
   the client immediately.
3. **Draft.** Permissionless — neither party can stall an agreed engagement.
4. **Sign.** Both parties submit the drafted text's hash. Work cannot begin until both have.
5. **Deliver.** In order, one milestone at a time, with evidence URLs the validators fetch themselves.
6. **Adjudicate.** Permissionless, so a client who dislikes where a ruling is heading cannot withhold
   it.
7. **Settle.** After the appeal window closes undisputed, anyone can settle.

### Disputes

A ruling does not move money. It opens an appeal window in which either party can bond 5% of the
milestone and force a re-adjudication, with their stated reason passed to the next round as context
so it is a genuine second look rather than a repeat. If the percentage moves the bond is refunded; if
it stands, it goes to the other party. Rounds are capped at 3 so settlement always terminates, and
any overpayment above the required bond is refunded on the spot, never put at risk.

### Where money can move

Funds leave the contract in exactly four places, none of them a judging call: `settle_milestone`,
`cancel_job`, `refund_expired`, and the bond resolution inside the re-adjudication that answers a
dispute. A ruling stays economically reversible for as long as it can still be contested, and every
terminal state is permissionlessly reachable — escrow can never be stranded by a counterparty who
walks away.

## Contract interface

| Method | Type | Description |
|---|---|---|
| `post_job(brief, milestones_json, deadline)` | write · payable | Escrows the attached value, which must equal the milestone total. Opens the job for proposals |
| `submit_proposal(job_id, approach, milestones_json)` | write | Offer to do the work, at or below the escrowed budget. The client cannot propose on their own job |
| `counter_proposal(job_id, parent_idx, approach, milestones_json)` | write | Counter an offer. Only the party an offer was addressed to may counter it |
| `accept_proposal(job_id, proposal_idx)` | write | Fixes the parties, price and schedule; refunds the unspent budget to the client at once |
| `draft_sow(job_id)` | write · permissionless | The contract drafts the Statement of Work under validator consensus |
| `sign_sow(job_id, sow_hash)` | write · either party | Signs the exact drafted text. Both signatures activate the job |
| `submit_milestone(job_id, idx, evidence_urls_json, notes)` | write · freelancer | Delivers a milestone. Milestones are delivered in order, before the deadline |
| `adjudicate_milestone(job_id, idx)` | write · permissionless | Validators fetch the evidence and rule a completion percentage with a per-criterion breakdown |
| `dispute_ruling(job_id, idx, reason)` | write · payable · either party | Bonds against a ruling and forces a re-adjudication. Capped at 3 rounds per milestone |
| `settle_milestone(job_id, idx)` | write · permissionless | After the appeal window, splits the milestone's escrow on its ruled percentage |
| `rule_scope(job_id, request_text)` | write · either party | Rules whether requested work already falls inside the signed agreement |
| `open_change_order(job_id, request_text, milestones_json, new_deadline)` | write · payable · client | Funds an amendment. Clears both signatures and returns the job for re-drafting; may extend the deadline, never shorten it |
| `cancel_job(job_id)` | write · client | Withdraws a brief nobody has been engaged on, refunding it in full |
| `refund_expired(job_id)` | write · permissionless | Returns whatever is still escrowed once the deadline passes |
| `submit_review(job_id, text)` | write · either party | One short, public, immutable review per party on a finished job |
| `get_job(job_id)` | view | The full record: parties, status, escrow, milestones, signatures, open dispute |
| `list_jobs()` / `list_jobs_for(address)` | view | Every job id, and those an address is party to |
| `get_proposals(job_id)` / `get_rulings(job_id)` | view | The negotiation history, and every ruling, dispute and amendment |
| `get_sow(job_id)` | view | The drafted agreement: scope, assumptions, exclusions, per-milestone criteria, hash and version |
| `get_appeal_window_seconds()` / `get_max_dispute_rounds()` / `get_required_bond(job_id, idx)` | view | The settlement parameters this deployment runs on |

The **appeal window is fixed at deployment** (default 48h, bounded 60s–30d) and has deliberately no
setter: an owner who could shorten it mid-engagement could strip the other side of its only chance to
contest a ruling. A sandbox deployment can therefore run a short window without that being a power
anyone holds over a live one.

## Networks

Contract addresses change on every redeploy — GenVM has no in-place upgrade. Verify any address with
`genlayer code <address>` before trusting it.

| Network | Chain | Address | Appeal window |
|---|---|---|---|
| Studio Network | 61999 | `0xF56ea607eD83bd4292cb334B9F9322a9b17dBEE7` | 48h (production default) |
| Studio Network | 61999 | `0x65BE4DE0A604AB9b298BAb2e8715b21b843406f0` | 300s (sandbox — the app points here) |
| Testnet Asimov | 4221 | not yet deployed | — |

Both Studio deployments were byte-verified against `contracts/genhire.py` after deploying.

## Testing

Three suites, because no single one can cover this contract.

```bash
python3 -m venv .venv && ./.venv/bin/pip install genlayer-py genlayer-test pytest
./.venv/bin/python -m pytest -q          # tests/direct + tests/unit — 297 tests

uvx --from genvm-linter genvm-lint check contracts/genhire.py
```

- **`tests/direct/`** — real gltest direct mode, so GenVM storage encoding and `u256`/`Address`
  semantics are genuinely exercised. Its reach stops at `draft_sow`; see the limitation below.
- **`tests/unit/`** — the same contract source run in-process against a stubbed GenVM
  (`tests/unit/glstub.py`) with the model's answer injected. Covers the whole state machine and the
  escrow arithmetic at every percentage from 0 to 100, asserting `paid + refunded == amount`.
- **`tests/integration/`** — the only suite that exercises the real LLM outcomes. Needs a funded key
  in a gitignored `gltest.config.yaml` (see `gltest.config.yaml.example`):
  ```bash
  gltest tests/integration/ -v -s --network studionet
  ```

**The direct-mode limitation, precisely:** gltest's mock WASI host implements `ExecPrompt` but not the
`ExecPromptTemplate` request that `gl.eq_principle.prompt_comparative` and `prompt_non_comparative`
issue internally. Both therefore resolve to `None` in direct mode **regardless of any registered
mock**, which makes every method downstream of the Statement of Work unreachable there. That gap is
why `tests/unit` exists — leaving settlement, the code that moves money, untested was not acceptable.

## Non-obvious things learned building this

1. **`getTransaction` reports status as the numeric enum ordinal** (`7` for FINALIZED), and leaves
   `status_name` undefined on that RPC path. Comparing the raw field against status *names* silently
   never matches, so a transaction that finalized in seconds looks like it hung forever. Both
   `scripts/smoke.mjs` and `frontend/src/lib/tx.ts` normalise either shape.
2. **ACCEPTED is not success.** A transaction reaches ACCEPTED once it lands in a block; the contract
   call inside it can still have reverted. Only the leader receipt's `execution_result` says which.
3. **`genlayer deploy` prints "Contract deployed successfully" even when the constructor errored** —
   that message reflects the transaction being accepted, nothing more. Always verify with
   `genlayer code <address>` and a view call.
4. **`genlayer write` hardcodes `value: 0n`** and cannot call a payable method under any combination
   of flags. Every payable path here is driven through `genlayer-js` from Node.
5. **Poll on a backoff.** Studionet enforces ~30 requests a minute *and* 5000 a day. A flat 4-second
   poll over a 10-minute budget is ~150 requests per write — enough to spend a day's quota in a single
   end-to-end run.
6. **`prompt_non_comparative` returns the leader's generated string**, not a judgment of the criteria.
   The task must pin the output shape down explicitly, and the contract must re-validate whatever
   comes back rather than trusting it.
7. **Never pass an inline lambda** as the `fn` argument to an eq_principle primitive — it trips a
   `genvm-lint` E025 false positive on the enclosing scope. Use a named nested function.
8. **Storage shape matters more than it should.** A `bigint`-bearing record combined with several
   top-level `TreeMap`s has broken this runner's storage encoder before. GenHire keeps one top-level
   `TreeMap`, no `DynArray`-valued maps and no `bigint` anywhere; nested records are JSON strings.
9. **One non-deterministic block per transaction.** Drafting, adjudication and scope rulings are
   necessarily three separate calls — this is why `draft_sow` is not folded into `accept_proposal`.

## Local development

```bash
cd frontend
npm install
cp .env.example .env.local     # set the contract address and a Reown project id
npm run dev
```

Without `VITE_REOWN_PROJECT_ID` the app runs read-only: the board, the document view and every
figure on it still load, but wallet connection is disabled.

## Deploying

```bash
genlayer network set studionet
genlayer deploy --contract contracts/genhire.py --args 172800   # appeal window, seconds
genlayer code <address>                                          # verify before trusting it
```

Then set the address in `frontend/.env.local` and in the Networks table above. `netlify.toml` is
included with an SPA redirect so `/job/3` does not 404 on a direct load.

## License

MIT
