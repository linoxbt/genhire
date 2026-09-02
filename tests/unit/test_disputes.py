"""Bonded disputes: forcing a re-adjudication, and who pays for it."""
import json

import pytest


def bond_for(h, job_id, index=0) -> int:
    """The bond as an int, for arithmetic. The view itself returns a decimal
    string - see test_the_bond_is_a_string_so_large_values_survive."""
    return int(h.contract.get_required_bond(job_id, index))


def test_bond_is_five_percent_of_the_milestone(h):
    job_id = h.engage(1000, 4000)
    assert bond_for(h, job_id, 0) == 50
    assert bond_for(h, job_id, 1) == 200


def test_bond_is_never_zero_on_a_tiny_milestone(h):
    """A 5% bond on a small amount floors to zero, which would make disputing
    free - it is floored at one wei instead."""
    job_id = h.engage(10)
    assert bond_for(h, job_id, 0) == 1


def test_a_dispute_reopens_the_milestone_for_re_adjudication(h, client):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id))
    h.contract.dispute_ruling(job_id, 0, "The second criterion was clearly met")

    job = h.contract.get_job(job_id)
    assert job["milestones"][0]["status"] == "submitted"
    assert job["dispute_bond"] == "50"
    assert job["dispute_round"] == 1
    assert job["disputer"] == client.as_hex


def test_a_successful_dispute_refunds_the_bond(h, client, freelancer):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    bond = bond_for(h, job_id)
    h.acting_as(client, bond)
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    before = h.paid_to(client)

    h.adjudicate(job_id, 0, 65)  # the percentage moved, so the disputer was right

    assert h.paid_to(client) - before == bond
    assert h.contract.get_job(job_id)["dispute_bond"] == "0"


def test_a_failed_dispute_forfeits_the_bond_to_the_other_party(h, client, freelancer):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    bond = bond_for(h, job_id)
    h.acting_as(client, bond)
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    before_client, before_freelancer = h.paid_to(client), h.paid_to(freelancer)

    h.adjudicate(job_id, 0, 40)  # unchanged, so the delay cost the disputer the bond

    assert h.paid_to(client) == before_client
    assert h.paid_to(freelancer) - before_freelancer == bond


def test_the_freelancer_can_dispute_too_and_forfeits_to_the_client(h, client, freelancer):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    bond = bond_for(h, job_id)
    h.acting_as(freelancer, bond)
    h.contract.dispute_ruling(job_id, 0, "Scored too low")
    before = h.paid_to(client)
    h.adjudicate(job_id, 0, 40)
    assert h.paid_to(client) - before == bond


def test_overpaid_bond_is_refunded_immediately(h, client):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    bond = bond_for(h, job_id)
    h.acting_as(client, bond + 777)
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    # Only the required bond is ever put at risk.
    assert h.paid_to(client) == 777
    assert h.contract.get_job(job_id)["dispute_bond"] == str(bond)


def test_an_underfunded_dispute_is_rejected(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id) - 1)
    with pytest.raises(UserError, match="requires a bond"):
        h.contract.dispute_ruling(job_id, 0, "Under-scored")


def test_disputes_are_capped_so_settlement_terminates(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    rounds = h.contract.get_max_dispute_rounds()
    for _ in range(rounds - 1):
        h.acting_as(client, bond_for(h, job_id))
        h.contract.dispute_ruling(job_id, 0, "Again")
        h.adjudicate(job_id, 0, 40)

    assert h.contract.get_job(job_id)["milestones"][0]["rounds"] == rounds
    h.acting_as(client, bond_for(h, job_id))
    with pytest.raises(UserError, match="all 3 adjudication rounds"):
        h.contract.dispute_ruling(job_id, 0, "One more")


def test_a_dispute_after_the_window_is_rejected(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.warp(h.contract.get_appeal_window_seconds() + 1)
    h.acting_as(client, bond_for(h, job_id))
    with pytest.raises(UserError, match="appeal window .* has closed"):
        h.contract.dispute_ruling(job_id, 0, "Too late")


def test_only_a_party_can_dispute(h, stranger, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(stranger, bond_for(h, job_id))
    with pytest.raises(UserError, match="Only the client or the freelancer"):
        h.contract.dispute_ruling(job_id, 0, "Not my job")


def test_a_disputed_milestone_cannot_settle_until_it_is_re_ruled(h, client, UserError, stranger):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id))
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    h.warp(h.contract.get_appeal_window_seconds() + 1)
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="not awaiting settlement"):
        h.contract.settle_milestone(job_id, 0)


def test_only_one_dispute_can_be_open_at_a_time(h, client, freelancer, UserError):
    job_id = h.engage(600, 400)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id, 0))
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    h.acting_as(freelancer, bond_for(h, job_id, 0))
    with pytest.raises(UserError, match="dispute is already open"):
        h.contract.dispute_ruling(job_id, 0, "Also disputing")


def test_a_dispute_needs_a_reason(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id))
    with pytest.raises(UserError, match="must state a reason"):
        h.contract.dispute_ruling(job_id, 0, "   ")


def test_the_dispute_reason_is_given_to_the_re_adjudication(h, client):
    """A re-review has to be a genuine second look, not a repeat of the first."""
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id))
    h.contract.dispute_ruling(job_id, 0, "The API docs criterion was met in the appendix")

    h.gl.nondet.responses.append('{"completion_pct": 65, "reasoning": "Reviewed again", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())  # run the real leader body
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "PREVIOUS RULING ON THIS MILESTONE IS BEING CONTESTED" in prompt
    assert "The API docs criterion was met in the appendix" in prompt


def test_the_bond_is_a_string_so_large_values_survive(h):
    """Regression: the bond used to cross as a raw int.

    A bond is 5% of a milestone, so any milestone above roughly 0.18 GEN
    produces a figure beyond JavaScript's Number.MAX_SAFE_INTEGER (2**53 - 1).
    Returned as a number it is silently corrupted on the way to the wallet, and
    the transaction is then rejected by the contract's own bond check - so the
    disputes that break are exactly the large ones that matter most.
    """
    one_gen = 10**18
    job_id = h.engage(one_gen)

    raw = h.contract.get_required_bond(job_id, 0)
    assert isinstance(raw, str), "wei must cross the boundary as a decimal string"

    bond = int(raw)
    assert bond == one_gen * 500 // 10000  # 5%
    assert bond > 2**53, "this is the range a JS number cannot represent exactly"
    # Exact round-trip through the string, which is the point of the change.
    assert str(bond) == raw


def test_every_money_field_crosses_as_a_string(h):
    """The whole view surface must agree, or callers cannot trust any of it."""
    job_id = h.engage(10**18, 10**18)
    job = h.contract.get_job(job_id)
    for field in ("escrow", "budget", "agreed_price", "dispute_bond"):
        assert isinstance(job[field], str), f"{field} must be a decimal string"
    for milestone in job["milestones"]:
        for field in ("amount", "paid", "refunded"):
            assert isinstance(milestone[field], str), f"milestone {field} must be a decimal string"


def test_a_dispute_preserves_the_reasoning_of_the_ruling_it_contests(h, client):
    """Regression: the dispute reason used to overwrite `reasoning`.

    `reasoning` belongs to the adjudicator. Overwriting it destroyed the record
    of why the contested ruling was made, and made the UI display the
    complainant's words under the heading "Ruling".
    """
    job_id = h.engage(1000)
    h.submit(job_id, 0)
    h.adjudicate(job_id, 0, 40, reasoning="Two of four criteria were met")

    h.acting_as(client, bond_for(h, job_id))
    h.contract.dispute_ruling(job_id, 0, "The API docs criterion was met in the appendix")

    milestone = h.contract.get_job(job_id)["milestones"][0]
    assert milestone["reasoning"] == "Two of four criteria were met"
    assert milestone["dispute_reason"] == "The API docs criterion was met in the appendix"


def test_resolving_a_dispute_leaves_no_stale_state(h, client):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, bond_for(h, job_id))
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    h.adjudicate(job_id, 0, 65)

    job = h.contract.get_job(job_id)
    assert job["dispute_bond"] == "0"
    assert job["disputer"] == "0x0000000000000000000000000000000000000000"
    assert job["dispute_milestone"] == 0
    assert job["milestones"][0]["dispute_reason"] == ""


def test_both_the_ruling_and_the_complaint_reach_the_re_adjudication(h, client):
    """The appeal must see what it is overturning as well as the objection."""
    job_id = h.engage(1000)
    h.submit(job_id, 0)
    h.adjudicate(job_id, 0, 40, reasoning="Criterion three was not evidenced")
    h.acting_as(client, bond_for(h, job_id))
    h.contract.dispute_ruling(job_id, 0, "Criterion three is covered in section 4")

    h.gl.nondet.responses.append('{"completion_pct": 65, "reasoning": "Re-reviewed", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "Criterion three was not evidenced" in prompt, "the ruling under appeal must be shown"
    assert "Criterion three is covered in section 4" in prompt, "the objection must be shown"
    assert "to weigh, not to obey" in prompt


def test_the_real_adjudication_body_fetches_evidence_and_parses_the_verdict(h, client):
    """Runs `_judge` end to end: evidence fetch, prompt assembly, JSON parsing.

    Every other adjudication test injects an already-parsed dict, so
    `_fetch_evidence` and `_parse_milestone_verdict` were never exercised on
    the adjudication path at all.
    """
    job_id = h.engage(1000)
    h.submit(job_id, 0, content="The cart page renders and payment succeeds.")

    h.gl.nondet.responses.append(
        '```json\n{"completion_pct": "82%", "reasoning": "Most criteria met",'
        ' "criteria": [{"criterion": "cart renders", "met": "yes", "note": "seen"}]}\n```'
    )
    h.queue_verdict(lambda leader_fn: leader_fn())
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "The cart page renders and payment succeeds." in prompt, "fetched evidence must reach the judge"
    assert "untrusted" in prompt.lower()

    milestone = h.contract.get_job(job_id)["milestones"][0]
    # Fenced JSON, a "82%" string and a "yes" boolean all coerced correctly -
    # and 82 quantises to 80, so validators compare the same bucket rather than
    # a number that leader selection could shift.
    assert milestone["pct"] == 80
    assert milestone["criteria_result"][0]["met"] is True


def test_a_total_fetch_failure_aborts_the_delivery(h, freelancer, UserError):
    """A network blip must not become a settlement.

    The snapshot is what every later ruling reads, so recording nothing but
    fetch errors would get a reasonable ~0% ruling later - paying the
    freelancer nothing and costing them a 5% bond to contest, for a failure on
    the validator's side. An external failure has to stop the submission rather
    than quietly become the delivery.
    """
    job_id = h.engage(1000)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="None of the 1 evidence sources could be fetched"):
        h.contract.submit_milestone(job_id, 0, json.dumps(["https://example.com/gone"]), "")

    # Nothing locked: still pending, still deliverable.
    milestone = h.contract.get_job(job_id)["milestones"][0]
    assert milestone["status"] == "pending"
    assert milestone["evidence_snapshot"] == ""


def test_a_partial_fetch_failure_still_proceeds(h, client, freelancer):
    """One dead link out of several is a judgment call, not an abort."""
    h.gl.nondet.web.pages["https://example.com/live"] = "The cart page renders."

    job_id = h.engage(1000)
    h.acting_as(freelancer, 0)
    h.contract.submit_milestone(
        job_id,
        0,
        json.dumps(["https://example.com/live", "https://example.com/dead"]),
        "",
    )

    h.gl.nondet.responses.append('{"completion_pct": 55, "reasoning": "Partly evidenced", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "The cart page renders." in prompt
    assert "[failed to fetch" in prompt
    assert h.contract.get_job(job_id)["milestones"][0]["pct"] == 55


def test_the_snapshot_not_the_live_page_is_what_gets_judged(h, client):
    """The regression that H-3's first attempt got backwards.

    Committing to a sha256 and re-fetching at adjudication meant a page that
    changed - or simply rendered differently - permanently bricked the
    milestone, because evidence is only writable while pending. Storing the
    text at submission instead means the page can change freely and the ruling
    is unaffected: what was delivered is what gets judged.
    """
    job_id = h.engage(1000)
    h.submit(job_id, 0, content="The build, as delivered.")

    # Whoever controls the page swaps it after delivery.
    h.gl.nondet.web.pages[h.EVIDENCE_URL] = "Something else entirely."

    h.gl.nondet.responses.append('{"completion_pct": 80, "reasoning": "Assessed", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "The build, as delivered." in prompt, "the ruling must judge the delivered bytes"
    assert "Something else entirely." not in prompt, "the swapped page must not reach the model"
    assert h.contract.get_job(job_id)["milestones"][0]["pct"] == 80


def test_an_appeal_judges_the_same_bytes_as_the_ruling(h, client, freelancer):
    """H-3's actual goal, now structural rather than checked.

    The appeal cannot judge different evidence because it does not fetch at
    all - it reads the same stored snapshot the first ruling did.
    """
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 40)

    h.gl.nondet.web.pages[h.EVIDENCE_URL] = "Rewritten to look complete."

    bond = int(h.contract.get_required_bond(job_id, 0))
    h.acting_as(freelancer, bond)
    h.contract.dispute_ruling(job_id, 0, "The criteria were met in full.")

    h.gl.nondet.responses.append('{"completion_pct": 60, "reasoning": "Reassessed", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "The delivered build." in prompt
    assert "Rewritten to look complete." not in prompt


def test_adjudication_never_fetches(h, client):
    """The snapshot is authoritative, so a ruling must touch the network zero
    times - the property the whole design turns on."""
    job_id = h.engage(1000)
    h.submit(job_id, 0)
    fetches_after_delivery = h.gl.nondet.web.fetches
    assert fetches_after_delivery > 0, "submission is what fetches"

    h.gl.nondet.responses.append('{"completion_pct": 70, "reasoning": "Assessed", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    assert h.gl.nondet.web.fetches == fetches_after_delivery


def test_evidence_is_stored_as_plain_urls(h, freelancer):
    job_id = h.engage(600, 400)
    h.gl.nondet.web.pages["ipfs://bafyExample"] = "pinned"
    h.acting_as(freelancer, 0)
    h.contract.submit_milestone(job_id, 0, json.dumps(["ipfs://bafyExample"]), "")

    milestone = h.contract.get_job(job_id)["milestones"][0]
    assert milestone["evidence"] == ["ipfs://bafyExample"]
    assert milestone["evidence_snapshot"] == "--- SOURCE: ipfs://bafyExample ---\npinned\n\n"
