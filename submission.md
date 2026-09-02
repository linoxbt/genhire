# GenLayer Portal — Project submission

Paste-ready copy for the **Builder → Project** form. Every field below is under its character
limit; the counts are noted so you can see the headroom. Fields the form marks optional and that
we have nothing honest to put in are marked *skip* rather than filled with padding.

---

## 01 · Identity

| Field | Value |
|---|---|
| **Logo** | `frontend/public/mark.svg` — the Split Seal. Export at 512×512 PNG if the form rejects SVG. |
| **Project name** | `GenHire` |
| **Primary tag** | Pick from the Portal's list. Best fit is the marketplace/app category — GenHire is a complete application, not tooling or a library. |
| **Tag 1 / Tag 2** | Suggested, subject to what the dropdown actually offers: *Escrow / Payments* and *Agents* (both parties can be autonomous agents). |

---

## 02 · Project summary — one-liner (162/180)

```
An engagement marketplace where the Intelligent Contract drafts the Statement of Work it later enforces, then settles escrow proportionally to what was delivered.
```

---

## 03 · Project overview — description (995/1000)

```
GenHire is an escrow marketplace for work, built so that neither party writes the standard the work is judged by.

A client posts a brief and funds it. A freelancer proposes terms; either side can counter. When a proposal is accepted, the Intelligent Contract itself DRAFTS the binding Statement of Work — turning vague wording into specific, individually checkable acceptance criteria — and both parties sign that exact text by its hash before any work begins.

Everything after that is decided against the text the contract wrote. Delivered work is adjudicated by validator consensus into a completion percentage with a per-criterion breakdown, and escrow splits on that number: real work lands partly done far more often than it lands cleanly failed, so all-or-nothing is the wrong shape. "Was that in scope?" becomes a question with an on-chain answer, and out-of-scope work needs a funded change order.

No oracle, no arbitrator, no backend. One Python/GenVM contract is the whole protocol.
```

---

## 04 · Demo video

*Skip* — there is no recording yet. The Portal treats this as optional, and a link to nothing is
worse than an empty field. Worth adding later: the drafting step is the moment that lands, because
a two-sentence brief visibly becomes ten checkable criteria.

---

## 05 · How-to — the exact path

Needs two wallets, because the whole point is an agreement between two parties. Studio GEN is free
from the faucet, and the deployed appeal window is **300 seconds** so the full lifecycle finishes in
one sitting rather than two days.

| # | Heading | Instruction |
|---|---|---|
| 01 | Open the app | Go to https://genhire.netlify.app. The header shows the network (Studio) and a Connect button. |
| 02 | Fund a wallet | Connect wallet A. If it holds no GEN, open https://studio.genlayer.com and use the faucet (the water-drop button in the account selector). |
| 03 | Post a brief | Go to **Post a brief**. Write a real brief — a few sentences of what you want built. Add two milestones with GEN amounts. Submit: the full budget is escrowed with this transaction. |
| 04 | Propose as the other side | Switch to wallet B, open the job from **Board**, and submit a proposal. Price it at or below the posted budget; you may re-split the milestones. |
| 05 | Accept the terms | Back on wallet A, accept the proposal. Any budget the accepted price does not use is refunded to you immediately — watch the escrow figure drop to the agreed price. |
| 06 | Let the contract draft the agreement | Press **Draft the agreement**. Validators write the Statement of Work — scope, assumptions, exclusions, and one list of acceptance criteria per milestone. This is a real LLM consensus round: allow a few minutes. Anyone can trigger it, so neither side can stall. |
| 07 | Read what it wrote | Read clause 3. The criteria were written by the contract from your brief and the accepted proposal — neither party typed them. |
| 08 | Sign it, both sides | Sign on wallet A, then wallet B. Each signature submits the hash of that exact text, so nobody can be bound to a draft they were not shown. The job becomes **In force**. |
| 09 | Deliver a milestone | On wallet B, deliver milestone 1 with a public URL as evidence. Validators read the page during this transaction and store the text, so a later appeal is judged on the same bytes. |
| 10 | Adjudicate | Press **Request adjudication**. Validators fetch the evidence and return a completion percentage with a per-criterion breakdown. Another real consensus round — a few minutes. |
| 11 | Settle | Wait out the 300-second appeal window, then press **Settle**. The escrow splits on the ruled percentage: the freelancer is paid `amount × pct ÷ 100` and the client refunded the remainder. |

---

## 06 · Review verification — expected outcome (478/500)

```
You should end with a settled milestone whose escrow split matches its ruled percentage.

Concretely: get_sow returns acceptance criteria the contract wrote, not ones either party typed; the job reaches "active" only after two signatures against the same hash; adjudication returns a completion percentage with per-criterion results; and once the 300s appeal window closes, settlement pays amount x pct / 100 and refunds the rest, paid + refunded matching the milestone exactly.
```

**Contract link (optional field, but worth filling):**

```
https://explorer-studio.genlayer.com/address/0xa0074bb806b5bA67684c272d342339A56Bf57713
```

---

## 07 · Project links

| Field | Value |
|---|---|
| **Website** *(required)* | https://genhire.netlify.app |
| **GitHub** | https://github.com/linoxbt/genhire |

## Evidence & Supporting Information

| Type | URL |
|---|---|
| GitHub Repository | https://github.com/linoxbt/genhire |

---

## Notes for whoever submits this

**What to lead with in conversation.** The novel part is not the escrow — escrow is old. It is that
the contract is the *drafter*, not merely the judge. Most designs take the acceptance criteria as an
input, which quietly rewards whoever writes more carefully; here the criteria are produced by
validator consensus from both sides' words, and signed by hash before work starts.

**The second point, if there is room.** Rulings are a completion percentage, not a verdict, and the
escrow splits on it. `paid + refunded` always equals the milestone amount exactly, at every
percentage — that invariant is asserted across the whole 0–100 range in the test suite.

**Two design decisions a reviewer may probe:**

- *Evidence is snapshotted at delivery.* If adjudication re-fetched on every call, including the
  appeal, whoever controls the page could change what is judged between a ruling and its dispute.
  Delivery is therefore a consensus round of its own: the contract fetches each URL once and stores
  the text on the milestone, and every later ruling reads that snapshot instead of the live page.
  The appeal cannot judge different bytes because there is only one copy of them.
- *Rulings are quantised to 5% steps.* An equivalence principle has to tolerate a spread between
  validators, but settlement pays one exact number — so inside that tolerance, leader selection was
  deciding real money. Rounding to a coarse step lets the principle demand an exact match instead.

**Be straight about scope if asked.** Delivery → adjudication → settlement has been exercised
end-to-end in the test suites and is running live at time of writing, but the on-chain settlement
run had not completed when this text was drafted — Studio's daily request quota was exhausted. The
drafting and signature steps *are* proven on chain. Do not claim more than that; a steward following
the how-to will find out either way, and being the one who said so first is worth more than the
claim.

**Studio only.** Asimov rejects a contract this size (`BlockPubdataLimitReached`; the ceiling
measures between 52 and 55 kB against ~73 kB of source). Studio takes the source unmodified, which
is what keeps `genlayer code` byte-verification against the repository meaningful.
