# GenHire — architecture and design rationale

This document records *why* the contract is shaped the way it is. The README covers what it does; this
covers the decisions that are not obvious from reading the code, and the constraints that forced them.

---

## 1. One contract, no bridge, no backend

The original brief for this project assumed an EVM design: an ERC-721 holding the job terms, a
separate escrow contract, and an adapter that forwarded disputes to GenLayer and waited for a
callback to release funds.

None of that is needed. A GenLayer Intelligent Contract:

- receives native GEN directly (`@gl.public.write.payable` + `gl.message.value`),
- sends it directly (`gl.get_contract_at(addr).emit_transfer(value=..., on="finalized")`),
- and runs the LLM adjudication *inside itself*, under validator consensus.

So there is no job NFT, no escrow contract, no bridge adapter, no oracle and no off-chain service.
`contracts/genhire.py` is the entire protocol. Removing the bridge also removes the class of failure
the bridge design is most exposed to: a callback that never arrives, leaving escrow locked with a
decision recorded on another chain.

## 2. The storage shape is a workaround, and deliberately conservative

A `bigint`-bearing storage record combined with several top-level `TreeMap` fields has previously
broken this pinned runner's storage encoder (`AttributeError: 'int' object has no attribute
'encode'`) — discovered on a different contract, after deployment, where it stranded a working escrow
feature. That is the worst possible place to rediscover it.

GenHire therefore constrains itself well inside the known-good region:

| Rule | Why |
|---|---|
| **No `bigint` anywhere** | All money, counters and timestamps are `u256` |
| **One top-level `TreeMap`** (`jobs`) | Far below the count that has caused trouble |
| **No `DynArray`-valued `TreeMap`** | The failing shape combined a map-of-arrays with `bigint`; both are avoided rather than one |
| **Nested records are JSON strings** | Proposals, rulings and reviews are `DynArray[str]` fields on the `Job` record, not nested dataclasses |

The cost is real: reading a proposal means a `json.loads`, and `milestones_json` is rewritten
wholesale on every state change rather than patched in place. That is an acceptable price for a
contract whose entire job is holding other people's money.

Amounts cross the JSON boundary as **decimal strings**, never numbers, so a large wei value can never
be silently rounded through a float on the way in or out.

## 3. Why drafting, adjudication and scope rulings are three transactions

GenVM permits **exactly one non-deterministic block per transaction** — a second one reachable from
inside a block already in progress is rejected. Every LLM-dependent step therefore has to be its own
call:

| Method | Primitive | Why that primitive |
|---|---|---|
| `draft_sow` | `gl.eq_principle.prompt_non_comparative` | Drafting is generative: there is no second answer to compare against, so validators integrity-check the leader's draft against the same source and criteria |
| `adjudicate_milestone` | `gl.eq_principle.prompt_comparative` | A judgment that must be independently re-derived, not merely checked. The principle requires per-criterion booleans to match exactly and the percentage to agree within 10 points and fall on the same side of both 0 and 100 |
| `rule_scope` | `gl.eq_principle.prompt_comparative` | Same reasoning; the ruling string must match exactly |

This is why `draft_sow` cannot be folded into `accept_proposal`, and why adjudication cannot happen
inside `submit_milestone` — not a stylistic choice.

### Working with `prompt_non_comparative`

It returns the **leader's own generated string**, integrity-checked by validators — not a boolean
judgment of the `criteria` argument, however naturally it reads that way. Two consequences shape
`draft_sow`:

1. The `task` argument has to pin the output shape down explicitly (a JSON object with named keys),
   because the return value is whatever the leader produced.
2. `_parse_sow` must re-validate everything that comes back and never trust it. It enforces that the
   draft covers exactly as many milestones as the agreed schedule, in order, each with at least one
   non-empty criterion — a draft that reshapes the schedule is rejected outright rather than
   partially applied.

Both `fn` arguments are **named nested functions**, never inline lambdas: passing a lambda to an
eq_principle primitive trips a `genvm-lint` E025 false positive that marks the enclosing function's
own scope as nondet-reachable.

### Prompt injection

The brief, the proposal, the delivery notes and the fetched evidence are all written by a party with
something to gain. Every prompt labels them explicitly as untrusted material to verify rather than
instructions to follow. The adjudication prompt says so about the notes and evidence; the drafting
task says so about the brief and the proposal.

## 4. Failing closed

Parsing model output is lenient about form and strict about meaning:

- `_extract_json_blob` slices between the outermost braces, strips code fences and trailing commas.
- Key aliases are accepted (`completion_pct` / `completion` / `pct` / `score`).
- Percentages are **clamped** to 0–100 rather than rejected — a model saying "110%" means 100.
- An **unrecognised scope ruling is never guessed at**. `MAYBE`, `PARTIALLY` or an empty string
  raises rather than defaulting, because that answer decides whether the freelancer owes work for
  free.
- Every deterministic reject carries an `[EXPECTED]` / `[EXTERNAL]` / `[LLM_ERROR]` prefix so
  validators comparing rejects compare equal strings.

## 5. Settlement, and where money is allowed to move

Funds leave the contract in exactly four places, none of which is a judging call:

`settle_milestone` · `cancel_job` · `refund_expired` · the bond resolution inside the
re-adjudication that answers a dispute.

Critically, **`adjudicate_milestone` does not pay anyone**. A ruling opens an appeal window instead.
If a ruling paid out on landing, a dispute raised afterwards could only record disagreement — the
money would already be gone. Keeping the deposit locked until the window closes is what makes the
dispute mechanism economically real rather than decorative.

The split itself is a pure module-level function so it can be tested exhaustively:

```python
def _split(amount: int, pct: int) -> tuple[int, int]:
    earned = amount * pct // 100
    return earned, amount - earned
```

Integer floor to the freelancer, everything left — the rounding dust included — back to the client.
`earned + refunded == amount` at every percentage, which the test suite asserts for all 101 of them.

### Liveness

Every terminal state is reachable **permissionlessly**: `settle_milestone` and `refund_expired` can
be called by anyone, and so can `draft_sow` and `adjudicate_milestone`. Escrow must never depend on a
counterparty still being around and co-operative. Conversely, disputes are capped at 3 rounds per
milestone so the process always terminates rather than cycling.

### The appeal window is a constructor parameter

Set once at deployment, bounded 60s–30 days, defaulting to 48 hours, with **no setter**. An owner who
could shorten the window mid-engagement could strip the losing side of its only chance to contest a
ruling; making it immutable removes that power entirely while still letting a sandbox deployment run
the full lifecycle in minutes.

## 6. Change orders

An amendment is not a patch. `open_change_order` appends the new milestones, adds their funding to
escrow, **clears both signatures** and returns the job to `awaiting_sow` so the contract re-drafts the
entire Statement of Work including the new work. An amendment nobody re-signed is not an agreement.

Two guards worth noting:

- Every existing milestone must be `pending` or `settled`. Amending while a delivery is being judged
  would change the criteria underneath it.
- The amendment carries its own deadline, which may extend the job's but never shorten it. Without
  this, an amendment onto a job whose deadline had passed would be unworkable — the freelancer could
  never deliver, since `submit_milestone` refuses after the deadline.

A **completed** job can be amended too. Follow-on work for the same freelancer under the same signed
relationship is the ordinary case, and re-drafting from the existing scope preserves that continuity.

## 7. Testing: three suites, because no single one is sufficient

### The direct-mode limitation, precisely

gltest's mock WASI host implements `ExecPrompt` and `WebRender`, but has **no handler for the
`ExecPromptTemplate` request** that `gl.eq_principle.prompt_comparative` and `prompt_non_comparative`
issue internally. Those calls fall through to the mock's unknown-request path and return `None`
**regardless of any `mock_llm()` registration**. This was confirmed by probe against this repo's own
contract, not inferred:

```
DRAFT FAILED -> UserError('[LLM_ERROR] Statement of Work response contained no JSON: None')
```

Since `draft_sow` gates every later state, that makes signing, delivery, adjudication, disputes,
settlement and change orders **all unreachable in direct mode**. Left there, the escrow arithmetic —
the code that moves money — would have had no test at all.

### The three suites

| Suite | Runs against | Covers | Does not cover |
|---|---|---|---|
| `tests/direct/` | gltest direct mode (real GenVM semantics) | Storage encoding, `u256`/`Address` behaviour, the schema, everything up to `draft_sow` | Anything downstream of the Statement of Work |
| `tests/unit/` | `tests/unit/glstub.py`, an in-process stand-in, model answer injected | The full state machine, every guard, all escrow and bond arithmetic | GenVM storage encoding, gas, validator consensus |
| `tests/integration/` | A live network | The actual LLM-decided outcomes | — (needs a funded key; not run in CI) |

`tests/unit` runs **the real contract source**, imported unmodified — it is not a reimplementation.
The stub supplies just enough of the `genlayer` namespace to execute it as ordinary Python. One
deliberate divergence: its `u256` raises on a negative value rather than wrapping, because any
negative reaching that constructor is an accounting bug that should surface loudly in a test.

What it proves is what the contract does *with* a verdict — never that validators would agree on one.
That claim belongs to `tests/integration` alone, and the distinction is stated in both suites'
docstrings so no one mistakes 297 green tests for consensus coverage.

## 8. Frontend notes

The app is a static SPA with no backend, no indexer and no database; every figure on screen is a live
contract read via `genlayer-js`. Two chain-specific traps are handled in `frontend/src/lib/tx.ts`:

- **`getTransaction` returns status as the numeric enum ordinal** and leaves `status_name` undefined
  on that RPC path, so comparing against status *names* silently never matches and a finalized
  transaction appears to hang indefinitely.
- **ACCEPTED is not success** — a transaction can reach ACCEPTED with the contract call inside it
  reverted. The leader receipt's `execution_result` is what actually says.

Polling backs off (4s → 20s). Studionet enforces both a per-minute limit and a 5000-request **daily**
quota; a flat 4-second poll over a 10-minute budget is ~150 requests per write, which is enough to
spend a whole day's quota in one end-to-end run.

Reads fan out through `mapWithConcurrency` with a small pacing gap, and retry with backoff on
rate-limit errors specifically — never on genuine failures, which should surface immediately.
