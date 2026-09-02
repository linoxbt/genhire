<div align="center">

# GenHire

**An engagement marketplace where the contract drafts the agreement it enforces — and settles it proportionally.**

Built on [GenLayer](https://genlayer.com) Intelligent Contracts · live on Studio Network

**[genhire.netlify.app](https://genhire.netlify.app)**

[What it is](#what-it-is) · [Why GenLayer](#why-this-needs-genlayer) · [Lifecycle](#lifecycle) ·
[Contract reference](#contract-reference) · [Testing](#testing) · [Running it](#running-it)

</div>

---

## Table of contents

- [What it is](#what-it-is)
- [The three mechanics](#the-three-mechanics)
- [Why this needs GenLayer](#why-this-needs-genlayer)
- [Lifecycle](#lifecycle)
  - [Negotiation](#1-negotiation)
  - [Drafting and signature](#2-drafting-and-signature)
  - [Delivery and adjudication](#3-delivery-and-adjudication)
  - [Disputes](#4-disputes)
  - [Settlement](#5-settlement)
  - [Scope rulings and change orders](#6-scope-rulings-and-change-orders)
  - [Escape hatches](#7-escape-hatches)
- [Contract reference](#contract-reference)
  - [Writes](#writes)
  - [Views](#views)
  - [Data shapes](#data-shapes)
  - [Limits](#limits)
- [Architecture](#architecture)
  - [Storage layout](#storage-layout)
  - [The three non-deterministic calls](#the-three-non-deterministic-calls)
  - [Money invariants](#money-invariants)
- [Frontend](#frontend)
- [Testing](#testing)
- [Networks](#networks)
- [Running it](#running-it)
- [Deploying](#deploying)
- [Troubleshooting and hard-won notes](#troubleshooting-and-hard-won-notes)
- [Project status](#project-status)
- [Repository layout](#repository-layout)
- [License](#license)

---

## What it is

A client posts a brief and funds it. A freelancer proposes terms; either side can counter. When a
proposal is accepted, the Intelligent Contract **drafts the binding Statement of Work itself** —
turning vague wording into specific, individually checkable acceptance criteria — and both parties
sign that exact text, by its hash, before any work starts.

From then on, every question is answered by validator consensus against the text the contract wrote:
*did this milestone meet its criteria*, and *is this new request inside the agreed scope*.

Payment settles **proportionally**. Adjudication returns a completion percentage with a per-criterion
breakdown, and escrow splits on it.

| | |
|---|---|
| **Live app** | [genhire.netlify.app](https://genhire.netlify.app) |
| **Contract** | [`contracts/genhire.py`](contracts/genhire.py) — Python / GenVM. One contract, 25 methods, no backend |
| **Network** | GenLayer Studio Network — see [Networks](#networks) |
| **Frontend** | Vite + React 19 + TypeScript + Tailwind v4, a static SPA |
| **Chain access** | [`genlayer-js`](https://github.com/genlayerlabs/genlayer-js) — no server, no indexer, no database, no mock data |
| **Tests** | 324 deterministic (17 direct + 307 in-process), plus 4 live-network tests and `genvm-lint` |

---

## The three mechanics

Ordinary escrow — on any chain — can already lock money and release it when someone says so. These
three are what an Intelligent Contract makes possible, and they are the reason this project exists.

### 1. The contract drafts the terms

Most escrow designs take the acceptance criteria as an *input*: one party writes them, the other
agrees, and a judge is handed them later. That structurally rewards whoever writes more carefully,
and it misplaces where disputes actually start — not in the delivery, but in what was agreed.

GenHire inverts it. The brief and the accepted proposal go in; `draft_sow` produces the scope, the
assumptions, the exclusions, and one criteria list per milestone. Both parties then sign that exact
text **by its hash**, so nobody can be bound by a draft they were never shown, and **neither party
wrote the standard they will be held to**.

### 2. Rulings are proportions, not verdicts

`adjudicate_milestone` returns a completion percentage from 0 to 100 with a per-criterion breakdown.
Escrow splits on it: the freelancer receives `amount × pct ÷ 100`, the client is refunded the
remainder, rounding dust included.

Real work lands partly done far more often than it lands cleanly failed. A yes/no verdict forces the
adjudicator to round a substantially-delivered milestone to either full payment or nothing, and both
answers are wrong. All-or-nothing still exists here — it is the 100 and 0 cases.

### 3. Scope is a decidable question

*"That was always included"* against *"that is new work"* ends more engagements than bad delivery
does. Because the signed Statement of Work is on chain, `rule_scope` can answer it:

- **`IN_SCOPE`** — already covered; the freelancer owes it at the agreed price.
- **`OUT_OF_SCOPE`** — new work, requiring a funded change order: an amendment that adds escrow,
  re-drafts the whole agreement, and needs both signatures again before it is in force.

---

## Why this needs GenLayer

An ordinary smart contract can hold money and release it on a condition it can *check*: a signature,
a balance, a block height. It cannot read a repository and decide whether the checkout flow it finds
there is what the brief asked for.

That judgment has always had to come from outside the contract — an oracle, a nominated arbitrator, a
platform's support queue — and whoever provides it becomes a party with power over the outcome. Every
"decentralised freelance marketplace" reduces, at the point of disagreement, to trusting somebody.

A GenLayer Intelligent Contract runs its own non-deterministic step *inside* consensus. Independent
validators, often on different underlying models, each fetch the delivered work themselves and
re-derive the judgment; they must agree on the **substance** of the answer rather than on identical
bytes — GenLayer's Equivalence Principle. No single model's opinion is trusted, and no address
anywhere can overrule the result.

**A worked example, from the live deployment.** This brief:

> *"Build a checkout flow for a small storefront: a cart page, a payment step, and an order
> confirmation email. Must work on mobile and use our existing payments API."*

produced this, written by the contract under validator consensus, with neither party involved:

> **Milestone 1 — Cart and payment UI**
> - The cart page UI is accessible at the URL provided by the client and displays a list of items with name, quantity, unit price, and total amount.
> - The cart page UI is responsive and renders correctly on screen widths from 320 px to 768 px without horizontal scrolling.
> - The payment step UI presents input fields for all required payment information as defined in the client's API specification.
> - A test payment request submitted through the payment UI to the client's sandbox API endpoint returns a success response.
> - After a successful test payment, the UI shows a "Payment Successful" confirmation screen and does not display any error messages.
>
> **Milestone 2 — Confirmation email**
> - An order confirmation email is automatically generated and sent within five minutes of a successful payment transaction.
> - The email contains the order number, a list of purchased items with quantities and prices, the total amount, and the client's branding as supplied.
> - The email is sent to the email address entered during the payment step and is received in the recipient's inbox, verified by a test email.
> - The email complies with standard MIME/HTML email formats and renders correctly in Gmail, Outlook, and mobile mail clients.
> - The email sending mechanism uses the client-provided SMTP or email-service credentials; no additional email service is introduced.

That is the whole product thesis in one transaction: a two-sentence brief became ten criteria that
can actually be checked against a delivered artefact.

---

## Lifecycle

```
  drafting ──accept_proposal──▶ awaiting_sow ──draft_sow──▶ sow_drafted
                                                                 │ sign_sow ×2
                                                                 ▼
                                            active ⇄ rule_scope / open_change_order
                                               │ submit_milestone
                                               ▼
                                           submitted ──adjudicate_milestone──▶ ruled
                                               ▲                                 │
                                               └── dispute_ruling (bonded, ≤3) ───┤
                                                                                 │
                                              settle_milestone (window closed) ◀──┘
                                                                 │
                                                    next milestone … ▶ completed

  escapes:  cancel_job (nothing accepted yet)  ·  refund_expired (deadline passed)
```

### 1. Negotiation

`post_job` escrows the **whole budget up front** — a GenLayer contract cannot pull funds from a
wallet later, so escrow is only ever as real as what arrived with the call. The attached value must
equal the milestone total exactly.

Freelancers `submit_proposal` at or below that budget, with their own milestone split. Either side
can `counter_proposal`; a counter is addressed back at whoever made the offer it answers, so at any
moment exactly one party is entitled to close the negotiation. The client cannot propose on their own
job.

`accept_proposal` fixes the parties, the price and the schedule — and **refunds the unspent budget to
the client immediately**, rather than leaving it escrowed against work nobody agreed to.

### 2. Drafting and signature

`draft_sow` is **permissionless**: neither party should be able to stall an engagement whose terms
are already agreed. It runs the drafting round and moves the job to `sow_drafted`.

`sign_sow(job_id, sow_hash)` takes the hash as a *parameter* rather than reading it from storage.
That is deliberate — a party signs the bytes they were shown, so a signature can never land against
text they never saw. Both signatures move the job to `active`; work cannot begin before that.

### 3. Delivery and adjudication

`submit_milestone` delivers one milestone, **in order** (a milestone cannot be delivered until every
earlier one has settled), before the deadline, with up to 5 evidence URLs. Accepted schemes are
`https://`, `http://`, `ipfs://` and `ar://`. Delivery is itself a consensus round: validators fetch
each URL during the transaction and **store the text on the milestone**, so what is judged is what
was delivered.

`adjudicate_milestone` is **permissionless too**, so a client who dislikes where a ruling is heading
cannot simply withhold it. It reads the stored snapshot rather than re-fetching, and returns a
completion percentage, a per-criterion breakdown, and reasoning. A first ruling and every appeal
therefore judge byte-identical evidence: a page that changes after delivery cannot move the split.

### 4. Disputes

A ruling **does not move money**. It opens an appeal window instead.

During that window either party can `dispute_ruling`, bonding **5% of the milestone** (floored at
1 wei so a dispute is never free on a small milestone) and forcing a re-adjudication. Their stated
reason is passed into the next round as context, so it is a genuine second look rather than a repeat
of the first.

- The percentage **moves** → the disputer was right; the bond is refunded to them.
- The percentage **stands** → the dispute cost the other party time; the bond goes to them.

Rounds are capped at **3 per milestone** so settlement always terminates, and any value sent above
the required bond is refunded on the spot — never put at risk.

If a ruling paid out the moment it landed, a dispute raised afterwards could only *record*
disagreement; the money would already be gone. Holding the deposit until the window closes is what
makes the dispute mechanism economically real rather than decorative.

### 5. Settlement

Once the appeal window closes undisputed, **anyone** can call `settle_milestone`:

```python
earned  = amount * pct // 100     # integer floor, to the freelancer
refunded = amount - earned        # everything left, dust included, to the client
```

`earned + refunded == amount` at every percentage — asserted for all 101 of them in the test suite.
When the last milestone settles, the job becomes `completed`.

### 6. Scope rulings and change orders

`rule_scope(job_id, request_text)` asks the contract whether newly-requested work already falls inside
the signed agreement. It moves no money and is recorded permanently on the job.

`open_change_order` funds an amendment. It appends the new milestones, adds their funding to escrow,
**clears both signatures**, and returns the job to `awaiting_sow` so the contract re-drafts the entire
Statement of Work including the new work — an amendment nobody re-signed is not an agreement. Two
guards:

- Every existing milestone must be `pending` or `settled`. Amending while a delivery is being judged
  would change the criteria underneath it.
- The amendment carries its own deadline, which may **extend** the job's but never shorten it.
  Without this, amending a job whose deadline had passed would be unworkable — the freelancer could
  never deliver.

A **completed** job can be amended too: follow-on work for the same freelancer under the same signed
relationship is the ordinary case, and re-drafting from the existing scope preserves the continuity.

### 7. Escape hatches

- `cancel_job` — the client withdraws a brief nobody has been engaged on; full refund, instantly.
- `refund_expired` — **permissionless**. Once the deadline passes, whatever is still escrowed returns
  to the client. It deliberately refuses while any milestone is `submitted` or `ruled`: a delivery
  already in front of the adjudicator settles on its answer, not on the clock.

Every terminal state is permissionlessly reachable. Escrow can never be stranded by a counterparty who
simply walks away.

---

## Contract reference

Class `GenHire`, constructor `__init__(appeal_window_seconds: int = 172800)`.

The **appeal window is fixed at deployment** (default 48h, bounded 60s–30 days) and has deliberately
**no setter**. An owner who could shorten the window mid-engagement could strip the losing side of its
only chance to contest a ruling; making it immutable removes that power entirely, while still letting
a sandbox deployment run a full lifecycle in minutes.

### Writes

| Method | Access | Notes |
|---|---|---|
| `post_job(brief, milestones_json, deadline) -> int` | payable · anyone | Attached value must equal the milestone total. Returns the job id |
| `submit_proposal(job_id, approach, milestones_json) -> int` | not the client | Total must be ≤ escrow. Returns the proposal index |
| `counter_proposal(job_id, parent_idx, approach, milestones_json) -> int` | the offer's addressee | Counters an existing offer, addressed back at its author |
| `accept_proposal(job_id, proposal_idx)` | the offer's addressee | Fixes parties/price/schedule; refunds the unspent budget |
| `draft_sow(job_id)` | **permissionless** | Runs the drafting round. Also used to re-draft after an amendment |
| `sign_sow(job_id, sow_hash)` | either party | Hash must match the draft on file. Both signatures activate the job |
| `submit_milestone(job_id, milestone_idx, evidence_urls_json, notes)` | freelancer | In order, before the deadline, ≤5 URLs. Fetches and stores the evidence text, so an appeal judges the same bytes |
| `adjudicate_milestone(job_id, milestone_idx)` | **permissionless** | Rules a completion percentage; also resolves an open dispute's bond |
| `dispute_ruling(job_id, milestone_idx, reason)` | payable · either party | Bond ≥ 5% of the milestone, within the appeal window. A milestone gets 3 adjudication rounds in total — the first ruling plus two appeals |
| `settle_milestone(job_id, milestone_idx)` | **permissionless** | After the window closes undisputed. Splits the escrow |
| `rule_scope(job_id, request_text)` | either party | `IN_SCOPE` / `OUT_OF_SCOPE`, recorded on the job. Moves no money |
| `open_change_order(job_id, request_text, milestones_json, new_deadline)` | payable · client | Value must equal the added total. Clears signatures, re-opens drafting |
| `cancel_job(job_id)` | client | Only while `drafting`. Full refund |
| `refund_expired(job_id)` | **permissionless** | After the deadline, if nothing is mid-adjudication |
| `submit_review(job_id, text)` | either party | Once each, on a `completed` or `expired` job. ≤280 chars |

### Views

| Method | Returns |
|---|---|
| `get_job(job_id)` | The full record — parties, status, escrow/budget/agreed price, milestones, signature flags, open dispute, reviews |
| `list_jobs()` | Every job id |
| `list_jobs_for(party: Address)` | Job ids that address is client or freelancer on |
| `get_proposals(job_id)` | The whole negotiation history, including counters and their parents |
| `get_rulings(job_id)` | Every milestone ruling, dispute, scope ruling and amendment, in order |
| `get_sow(job_id)` | The drafted agreement: `scope`, `assumptions`, `exclusions`, per-milestone `criteria`, `hash`, `version` |
| `get_appeal_window_seconds()` | This deployment's window |
| `get_max_dispute_rounds()` | `3` |
| `get_required_bond(job_id, milestone_idx)` | The exact wei a dispute on that milestone needs right now |

Views return **plain dicts with `int(...)`-cast `u256` fields**, never dataclasses — the schema
introspector cannot recurse into a dataclass carrying `u256`. Wei amounts are returned as **decimal
strings** so a large value can never be rounded through a float on the way out.

### Data shapes

`milestones_json`, supplied by callers to `post_job` / `submit_proposal` / `counter_proposal` /
`open_change_order` — titles and amounts only:

```json
[
  { "title": "Cart and payment UI", "amount": "6000000000000000" },
  { "title": "Confirmation email",  "amount": "4000000000000000" }
]
```

Acceptance criteria are **not** accepted here, and are stripped if supplied: a caller must not be able
to pre-write the standard they will be judged against. The contract fills them in during `draft_sow`.

A milestone as returned by `get_job`:

```json
{
  "title": "Cart and payment UI",
  "amount": "6000000000000000",
  "criteria": ["The cart page UI is accessible at …", "…"],
  "status": "settled",                 // pending | submitted | ruled | settled
  "pct": 75,
  "paid": "4500000000000000",
  "refunded": "1500000000000000",
  "reasoning": "Four of five criteria met; …",
  "criteria_result": [{ "criterion": "…", "met": true, "note": "…" }],
  "evidence": ["https://…"],
  "notes": "Delivered at the linked URL.",
  "submitted_at": 1767225600, "ruled_at": 1767226000, "settled_at": 1767398800,
  "rounds": 1
}
```

`get_rulings` returns a mixed, append-only log discriminated by `kind`: `milestone`, `dispute`,
`scope`, `change_order`.

### Limits

| | |
|---|---|
| Milestones per job | 8 (including those added by amendments) |
| Criteria per milestone | 8 |
| Proposals per job | 25 |
| Ruling-log entries per job | 100 |
| Evidence URLs per milestone | 5 (4 000 chars each, 16 000 total, fetched live) |
| Brief / approach / SoW | 8 000 / 6 000 / 12 000 chars |
| Reason, notes, scope request | 2 000 chars · Review 280 chars |
| Dispute bond | 5% of the milestone, minimum 1 wei · 3 adjudication rounds (one ruling + two appeals) |

---

## Architecture

One contract. No job NFT, no separate escrow contract, no bridge adapter, no oracle, no backend, no
indexer. The original brief for this project assumed an EVM design with a GenLayer bridge and a
callback to release funds; none of it is necessary, and removing it also removes that design's worst
failure mode — a callback that never arrives, leaving escrow locked with the decision recorded
elsewhere.

### Storage layout

Deliberately conservative. A `bigint`-bearing storage record combined with several top-level
`TreeMap` fields has previously broken this pinned runner's storage encoder (`AttributeError: 'int'
object has no attribute 'encode'`) — discovered on a different contract, *after* deployment, where it
stranded a working escrow feature. That is the worst possible place to rediscover it.

| Rule | Applied |
|---|---|
| No `bigint` anywhere | All money, counters and timestamps are `u256` |
| One top-level `TreeMap` | `jobs`, plus `next_id` and a `job_ids` array |
| No `DynArray`-valued `TreeMap` | The failing shape combined a map-of-arrays with `bigint`; both avoided |
| Nested records are JSON strings | `proposals_json`, `rulings_json`, `reviews_json` are `DynArray[str]` on the `Job` record; `milestones_json` is a single `str` |

The cost is real — reading a proposal means a `json.loads`, and the milestone array is rewritten
wholesale on every state change rather than patched in place. That is an acceptable price for a
contract whose entire job is holding other people's money.

### The three non-deterministic calls

GenVM permits **exactly one non-deterministic block per transaction**. Every LLM-dependent step
therefore has to be its own call — this is why `draft_sow` is not folded into `accept_proposal`, and
why adjudication cannot happen inside `submit_milestone`.

| Method | Primitive | Why that one |
|---|---|---|
| `draft_sow` | `gl.eq_principle.prompt_non_comparative` | Drafting is generative — there is no second answer to compare against, so validators integrity-check the leader's draft against the same source and criteria |
| `adjudicate_milestone` | `gl.eq_principle.prompt_comparative` over `gl.nondet.web.render` | A judgment that must be independently re-derived. Per-criterion booleans must match exactly; percentages must agree within 10 points **and** fall on the same side of both 0 and 100 |
| `rule_scope` | `gl.eq_principle.prompt_comparative` | Same reasoning; the ruling string must match exactly |

**`prompt_non_comparative` returns the leader's own generated string**, integrity-checked by
validators — *not* a boolean judgment of the `criteria` argument, however naturally it reads that
way. So the `task` argument pins the output shape down explicitly, and `_parse_sow` re-validates
everything that comes back: a draft that covers the wrong number of milestones, or leaves one without
criteria, is **rejected outright** rather than partially applied.

Both `fn` arguments are **named nested functions**, never inline lambdas — passing a lambda to an
eq_principle primitive trips a `genvm-lint` E025 false positive on the enclosing scope.

**Prompt injection.** The brief, the proposal, the delivery notes and the fetched evidence are all
written by a party with something to gain. Every prompt labels them explicitly as untrusted material
to verify rather than instructions to follow.

**Failing closed.** Parsing is lenient about form and strict about meaning: code fences and trailing
commas are stripped, key aliases accepted, percentages *clamped* to 0–100. But an unrecognised scope
ruling (`MAYBE`, `PARTIALLY`, empty) **raises** rather than defaulting — that answer decides whether
the freelancer owes work for free. Every deterministic reject carries an `[EXPECTED]` / `[EXTERNAL]` /
`[LLM_ERROR]` prefix so validators comparing rejects compare equal strings.

### Money invariants

- Funds leave the contract in exactly **four** places, none of them a judging call:
  `settle_milestone`, `cancel_job`, `refund_expired`, and the bond resolution inside the
  re-adjudication that answers a dispute.
- `earned + refunded == amount`, at every percentage.
- Escrow decreases by exactly the settled milestone's amount.
- Overpaid dispute bonds are refunded immediately; only the required bond is ever at risk.
- Every terminal state is permissionlessly reachable.

---

## Frontend

A static SPA — **every figure on screen is a live contract read**. No backend, no indexer, no
database, no mock data anywhere.

**Design: "the living engagement letter."** The interface *is* the instrument, not a dashboard
wrapping one. A typeset document whose clauses fill in as the deal progresses: the brief, then
proposals with **counter-offers rendered as a word-level redline** against the offer they answer,
then the contract-drafted Statement of Work with a signature block both parties sign, then milestone
cards whose rulings stamp a completion measure across the criterion list, then amendments appended as
numbered clauses. Serif (Newsreader) for document prose, mono (JetBrains Mono) for every on-chain fact
— addresses, hashes, GEN amounts — so a reader can always tell prose from state.

| Route | Page |
|---|---|
| `/` | Landing, with live protocol stats |
| `/jobs` | The board, filterable by stage |
| `/post` | Brief + milestone builder |
| `/job/:id` | **The document view** — the heart of the app; every action is taken in place |
| `/dashboard` | Your engagements, with a "waiting on you" queue |
| `/profile/:address` | An address's record, derived only from settled milestones |
| `/about` | How adjudication actually works |

Key modules in `frontend/src/lib/`:

| File | Role |
|---|---|
| `genhire.ts` | Every contract read and write, one function each |
| `tx.ts` | Transaction lifecycle — waits for real finality, distinguishes revert from no-verdict |
| `useTx.ts` | The hook every action page uses: sign → wait → report |
| `retry.ts` | Rate-limit-only backoff, plus paced fan-out reads |
| `format.ts` | `formatGen`, `toWei` (never float maths on money), relative times, the redline diff |
| `appkit.tsx` / `wallet.ts` | Reown AppKit + wagmi, with the CAIP fields both GenLayer chains need |

---

## Testing

Three suites, because **no single one is sufficient** — and the reason is worth understanding before
trusting the numbers.

```bash
python3 -m venv .venv && ./.venv/bin/pip install genlayer-py genlayer-test pytest
./.venv/bin/python -m pytest -q                              # 324 tests, ~8s

uvx --from genvm-linter genvm-lint check contracts/genhire.py
```

| Suite | Count | Runs against | Covers | Does **not** cover |
|---|---|---|---|---|
| `tests/direct/` | 17 | gltest direct mode — real GenVM semantics | Storage encoding, `u256`/`Address` behaviour, the schema, everything up to `draft_sow` | Anything downstream of the Statement of Work |
| `tests/unit/` | 307 | `tests/unit/glstub.py`, in-process, verdict injected | The full state machine, every guard, all escrow and bond arithmetic | Storage encoding, gas, validator consensus |
| `tests/integration/` | 4 | A live network | The actual LLM-decided outcomes | — (needs a funded key; not run in CI) |

### The direct-mode limitation, precisely

gltest's mock WASI host implements `ExecPrompt` and `WebRender`, but has **no handler for the
`ExecPromptTemplate` request** that `gl.eq_principle.prompt_comparative` and `prompt_non_comparative`
issue internally. Both therefore resolve to `None` in direct mode **regardless of any registered
mock** — confirmed by probe against this contract, not inferred:

```
DRAFT FAILED -> UserError('[LLM_ERROR] Statement of Work response contained no JSON: None')
```

Since `draft_sow` gates every later state, that makes signing, delivery, adjudication, disputes,
settlement and change orders **all unreachable in direct mode**. Left there, the escrow arithmetic —
the code that moves money — would have had no test at all.

`tests/unit/` closes that gap by importing **the real contract source, unmodified**, against a stubbed
`genlayer` namespace with the model's answer injected. It is not a reimplementation. One deliberate
divergence: the stub's `u256` range-checks at construction. The real `u256` is a `NewType` that
checks nothing at runtime — the bounds are enforced later by the storage encoder, which raises
`OverflowError` at write time. Checking earlier catches the same bug with a clearer stack; what it
must never do is check *less*, so both bounds are enforced. The stub also models a real balance and
refuses any payout larger than the contract holds.

What it proves is what the contract does **with** a verdict — never that validators would agree on
one. That claim belongs to `tests/integration/` alone.

```bash
cp gltest.config.yaml.example gltest.config.yaml   # add a funded key (gitignored)
gltest tests/integration/ -v -s --network studionet
```

---

## Networks

Contract addresses change on **every** redeploy — GenVM has no in-place upgrade. Verify any address
with `genlayer code <address>` before trusting it.

| Network | Chain | Address | Appeal window |
|---|---|---|---|
| Studio Network | 61999 | `0x945B25004081DaD5181B495c48722d96cBf307Bd` | 300s |

GenHire targets **Studio only**: gasless, with a built-in faucet (the 💧 button at
[studio.genlayer.com](https://studio.genlayer.com)), and it takes the contract source unmodified — so
`genlayer code` byte-verification against this repository holds.

One trap worth knowing if you deploy a large contract on any GenLayer chain: `deployContract` in
`genlayer-js` **silently drops a `gas` option**, and when `estimateTransactionGas` fails it falls
back to a flat 200,000 gas — well below the ~1.17M a 73 kB contract needs in intrinsic calldata cost
alone. The resulting error reads "intrinsic gas too low", which points at gas when the real cause is
usually size.

---

## Running it

```bash
cd frontend
npm install
cp .env.example .env.local
npm run dev
```

`.env.local`:

```bash
VITE_CONTRACT_ADDRESS_STUDIONET="0x945B25004081DaD5181B495c48722d96cBf307Bd"
VITE_REOWN_PROJECT_ID=""      # free from https://cloud.reown.com
```

Without `VITE_REOWN_PROJECT_ID` the app runs **read-only**: the board, the document view and every
figure on it still load from the chain; only wallet connection is disabled. That path is a real one,
not an afterthought — `useWallet` swaps in a permanently-disconnected implementation at module load
rather than branching inside the hook, because AppKit's hooks throw outright if `createAppKit` was
never called, and the header renders a wallet button on every route.

### Driving the contract from Node

`scripts/smoke.mjs` runs a whole engagement end to end against a live network and prints the on-chain
balances either side of settlement:

```bash
GENHIRE_ADDRESS=0x945B… GENHIRE_KEYSTORE_PASSWORD=… node scripts/smoke.mjs
```

It uses `genlayer-js` rather than the CLI because **`genlayer write` hardcodes `value: 0n`** and
cannot call a payable method under any combination of flags — and posting, disputing and amending are
all payable. `genlayer-js` and `ethers` are symlinked from the global CLI's bundled `node_modules`.

---

## Deploying

```bash
genlayer network set studionet
genlayer deploy --contract contracts/genhire.py --args 172800   # appeal window, seconds
genlayer code <address>                                          # ALWAYS verify
genlayer call <address> get_appeal_window_seconds                # and check the constructor ran
```

Then set the address in `frontend/.env.local` and in the [Networks](#networks) table.

### Frontend

The app is deployed at **[genhire.netlify.app](https://genhire.netlify.app)**.

[`netlify.toml`](netlify.toml) drives the build: base `frontend`, publish `frontend/dist` (resolved
from the repository root, **not** from `base` — a bare `dist` sends the deploy looking in the wrong
place), Node 22, an SPA
redirect so `/job/3` does not 404 on a direct load or refresh, immutable caching on Vite's
fingerprinted `/assets/*` with `must-revalidate` on the HTML entry, and a small set of security
headers (`nosniff`, `DENY` framing, a strict referrer policy) — a page that connects a wallet is
worth making un-frameable.

The contract address and Reown project id are **site environment variables**, not committed:

```bash
netlify env:set VITE_CONTRACT_ADDRESS_STUDIONET 0x…
netlify env:set VITE_REOWN_PROJECT_ID <id from cloud.reown.com>
netlify deploy --prod
```

Without `VITE_REOWN_PROJECT_ID` the deployed app is **read-only** — every page and every figure
loads from the chain, but wallet connection is disabled, so no engagement can be posted or signed
from it.

---

## Troubleshooting and hard-won notes

Things that cost real time here, kept because they generalise to any GenLayer project.

**1. `getTransaction` returns status as the numeric enum ordinal** (`7` = FINALIZED) and leaves
`status_name` undefined on that RPC path. Comparing the raw field against status *names* silently
never matches, so a transaction that finalized in seconds appears to hang forever. Confusingly, the
`sim_getTransactionsForAddress` path returns the **string** — which is what makes this so easy to get
wrong. Normalise both shapes.

**2. ACCEPTED is not success.** A transaction reaches ACCEPTED once it lands in a block; the contract
call inside it can still have reverted. Only `consensus_data.leader_receipt[0].execution_result`
(`"SUCCESS"`) says which.

**3. `genlayer deploy` prints "Contract deployed successfully" even when the constructor errored** —
that message reflects the transaction being accepted, nothing more. Always follow it with
`genlayer code <address>` and a view call.

**4. `genlayer write` cannot send value at all.** See above; drive payable methods from `genlayer-js`.

**5. Poll on a backoff.** Studio enforces ~30 requests a minute **and 5 000 a day**. A flat 4-second
poll over a 10-minute budget is ~150 requests *per write* — enough to spend a whole day's quota in a
single end-to-end run. Both the script and the frontend back off 4s → 20s.

**6. `prompt_non_comparative` returns the leader's generated string**, not a judgment. Pin the output
shape in the `task`, and re-validate everything on the contract side.

**7. Never pass an inline lambda** as the `fn` argument to an eq_principle primitive — `genvm-lint`
E025 false-positives on the enclosing scope. Use a named nested function.

**8. Storage shape matters more than it should.** See [Storage layout](#storage-layout).

**9. One non-deterministic block per transaction.** Three LLM steps means three calls, necessarily.

**10. Type address-shaped parameters as `Address`, not `str`.** The CLI's `--args` parser
auto-detects any bare 40-hex string as an address; if the schema says `str`, the calldata type will
not match and the call fails during decode — **silently**, before any Python runs, while still
reporting success.

---

## Project status

**Working and verified**

- Contract complete — 25 methods, `genvm-lint` clean.
- 339 tests passing; frontend typechecks and builds.
- **The whole lifecycle is proven on chain**: post → propose → accept → **draft_sow** → both
  signatures → deliver → adjudicate → settle, under real validator consensus. The drafted criteria
  are quoted [above](#why-this-needs-genlayer).
- **Settlement moves real GEN.** A milestone ruled at 0 per cent against placeholder evidence paid
  the freelancer nothing and returned 0.005 GEN to the client, with `paid + refunded == amount`
  holding and the escrow drawn down to match. The ruling itself was substantive: six criteria, each
  marked unmet with reasoning citing the actual page.

**Not yet proven on chain**

- `tests/integration/` is written but unrun — it needs a raw private key in a gitignored config.

**Deployed**

- Contract live on Studio at `0x945B25004081DaD5181B495c48722d96cBf307Bd`, byte-verified against
  `contracts/genhire.py` with `genlayer code`.
- Frontend live at [genhire.netlify.app](https://genhire.netlify.app), pointed at that contract.

---

## Repository layout

```
genhire/
├── contracts/genhire.py            the entire protocol
├── tests/
│   ├── direct/                     gltest direct mode — real GenVM semantics
│   ├── unit/                       in-process, verdict injected — the state machine and the money
│   └── integration/                live network — the real LLM outcomes
├── scripts/smoke.mjs               end-to-end run against a live network
├── frontend/
│   └── src/{lib,components,pages}  the SPA — lib/genhire.ts is the whole chain surface
├── docs/ARCHITECTURE.md            why it is shaped this way
├── netlify.toml · pytest.ini · gltest.config.yaml.example
└── README.md
```

[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) goes deeper on the design rationale: the storage
workaround, the choice of equivalence primitives, the settlement invariants, and the testing strategy.

---

## License

MIT — see [LICENSE](LICENSE).
