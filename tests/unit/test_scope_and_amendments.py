"""Scope rulings and funded change orders - the arguments that end engagements."""
import json

import pytest


def test_an_in_scope_ruling_is_recorded_against_the_signed_sow(h, client):
    job_id = h.engage(1000)
    h.queue_verdict({"ruling": "IN_SCOPE", "reasoning": "The criteria already require this"})
    h.acting_as(client, 0)
    h.contract.rule_scope(job_id, "Please also add a loading spinner")

    ruling = h.contract.get_rulings(job_id)[-1]
    assert ruling["kind"] == "scope"
    assert ruling["ruling"] == "IN_SCOPE"
    assert ruling["by"] == client.as_hex
    assert ruling["sow_version"] == 1


def test_an_out_of_scope_ruling_is_recorded(h, freelancer):
    job_id = h.engage(1000)
    h.queue_verdict({"ruling": "OUT_OF_SCOPE", "reasoning": "Native apps are explicitly excluded"})
    h.acting_as(freelancer, 0)
    h.contract.rule_scope(job_id, "Also ship an iOS app")
    assert h.contract.get_rulings(job_id)[-1]["ruling"] == "OUT_OF_SCOPE"


def test_a_scope_ruling_moves_no_money(h):
    job_id = h.engage(1000)
    before = len(h.transfers)
    h.queue_verdict({"ruling": "IN_SCOPE", "reasoning": "Covered"})
    h.acting_as(h.gl.message.sender_address, 0)
    h.contract.rule_scope(job_id, "A tweak")
    assert len(h.transfers) == before
    assert h.contract.get_job(job_id)["escrow"] == "1000"


def test_only_a_party_can_request_a_scope_ruling(h, stranger, UserError):
    job_id = h.engage(1000)
    h.queue_verdict({"ruling": "IN_SCOPE", "reasoning": "Covered"})
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="Only the client or the freelancer"):
        h.contract.rule_scope(job_id, "A tweak")


def test_the_scope_prompt_is_built_from_the_signed_agreement(h, client):
    job_id = h.engage(600, 400)
    h.gl.nondet.responses.append('{"ruling": "OUT_OF_SCOPE", "reasoning": "Excluded"}')
    h.queue_verdict(lambda leader_fn: leader_fn())  # run the real leader body
    h.acting_as(client, 0)
    h.contract.rule_scope(job_id, "Also ship an iOS app")

    prompt = h.gl.nondet.prompts[-1]
    assert "Deliver the checkout flow" in prompt          # the drafted scope
    assert "Native mobile apps" in prompt                  # the drafted exclusions
    assert "Criterion for milestone 2" in prompt           # the drafted criteria
    assert "Also ship an iOS app" in prompt
    assert "untrusted" in prompt.lower()


# -- change orders -----------------------------------------------------

def test_a_change_order_adds_escrow_and_reopens_signing(h, client):
    job_id = h.engage(1000)
    h.change_order(job_id, 500)

    job = h.contract.get_job(job_id)
    assert job["status"] == "awaiting_sow"
    assert job["escrow"] == "1500"
    assert job["agreed_price"] == "1500"
    assert len(job["milestones"]) == 2
    assert job["milestones"][1]["title"] == "Amendment 1"
    # An amendment nobody re-signed is not an agreement.
    assert job["client_signed"] is False
    assert job["freelancer_signed"] is False

    record = h.contract.get_rulings(job_id)[-1]
    assert record["kind"] == "change_order"
    assert record["added"] == "500"


def test_a_change_order_must_be_funded_exactly(h, client, UserError):
    job_id = h.engage(1000)
    h.acting_as(client, 400)
    with pytest.raises(UserError, match="total 500 wei but 400 wei was sent"):
        h.contract.open_change_order(job_id, "Add work", h.schedule(500), h.at(60 * 86400))


def test_an_unfunded_change_order_is_rejected(h, client, UserError):
    job_id = h.engage(1000)
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="funded with a non-zero amount"):
        h.contract.open_change_order(job_id, "Add work", h.schedule(500), h.at(60 * 86400))


def test_only_the_client_can_fund_a_change_order(h, freelancer, UserError):
    job_id = h.engage(1000)
    h.acting_as(freelancer, 500)
    with pytest.raises(UserError, match="Only the client can fund a change order"):
        h.contract.open_change_order(job_id, "More work", h.schedule(500), h.at(60 * 86400))


def test_a_change_order_cannot_move_the_goalposts_mid_delivery(h, client, UserError):
    """An amendment while a delivery is being judged would change the criteria
    underneath it."""
    job_id = h.engage(600, 400)
    h.submit(job_id, 0)
    h.acting_as(client, 500)
    with pytest.raises(UserError, match="Milestone 0 is 'submitted'"):
        h.contract.open_change_order(job_id, "More work", h.schedule(500), h.at(60 * 86400))


def test_a_change_order_is_blocked_while_a_dispute_is_open(h, client, UserError):
    job_id = h.engage(600, 400)
    h.deliver_and_rule(job_id, 0, 40)
    h.acting_as(client, h.contract.get_required_bond(job_id, 0))
    h.contract.dispute_ruling(job_id, 0, "Under-scored")
    h.acting_as(client, 500)
    with pytest.raises(UserError, match="while a dispute is open"):
        h.contract.open_change_order(job_id, "More work", h.schedule(500), h.at(60 * 86400))


def test_the_amended_agreement_is_redrafted_and_resigned_end_to_end(h, client, freelancer):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)

    h.change_order(job_id, 500)
    h.draft(job_id, payload=h.sow_payload(2, scope="Checkout flow plus an admin report"))

    job = h.contract.get_job(job_id)
    assert job["sow_version"] == 2
    assert job["status"] == "sow_drafted"
    h.sign_both(job_id)
    assert h.contract.get_job(job_id)["status"] == "active"

    h.deliver_and_rule(job_id, 1, 100)
    h.settle(job_id, 1)
    assert h.contract.get_job(job_id)["status"] == "completed"
    assert h.paid_to(freelancer) == 1500


def test_a_change_order_respects_the_milestone_ceiling(h, client, UserError):
    job_id = h.engage(*([100] * 7))
    h.acting_as(client, 200)
    with pytest.raises(UserError, match="at most 8 milestones in total"):
        h.contract.open_change_order(job_id, "More", h.schedule(100, 100), h.at(60 * 86400))


def test_an_amendment_may_extend_the_deadline_but_never_shorten_it(h, client, UserError):
    job_id = h.engage(1000)
    h.acting_as(client, 500)
    with pytest.raises(UserError, match="not be earlier than the current deadline"):
        h.contract.open_change_order(job_id, "More work", h.schedule(500), h.at(10 * 86400))

    h.change_order(job_id, 500, days=90)
    assert h.contract.get_job(job_id)["deadline"] == h.at(90 * 86400)


def test_an_amendment_cannot_be_backdated(h, client, UserError):
    job_id = h.engage(1000)
    h.acting_as(client, 500)
    with pytest.raises(UserError, match="new_deadline must be in the future"):
        h.contract.open_change_order(job_id, "More work", h.schedule(500), h.at(-1))


def test_an_amendment_does_not_rewrite_a_settled_milestone_s_criteria(h):
    """Regression: re-drafting used to overwrite every milestone's criteria.

    A settled milestone was judged against specific text. An amendment re-drafts
    the whole agreement, and rewriting that text afterwards destroys the record
    of what the ruling actually held the work to — while the per-criterion
    verdicts stay behind, so the two can disagree in both content and count.
    """
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)

    settled_before = h.contract.get_job(job_id)["milestones"][0]["criteria"]
    assert settled_before, "precondition: the settled milestone has criteria"

    h.change_order(job_id, 500)
    h.draft(
        job_id,
        payload=h.sow_payload(2, scope="Checkout flow plus an admin report"),
    )

    milestones = h.contract.get_job(job_id)["milestones"]
    assert milestones[0]["criteria"] == settled_before, "settled criteria must be immutable"
    assert milestones[0]["status"] == "settled"
    # The new, pending milestone does take the freshly drafted criteria.
    assert milestones[1]["criteria"] == ["Criterion for milestone 2"]


def test_scope_rulings_are_capped(h, client, UserError):
    """Each one is a full validator round with no state change to stop it, so
    without a cap a party could burn validator time for free and fill the
    ruling log so later legitimate rulings cannot be recorded."""
    job_id = h.engage(1000)
    cap = h.contract.get_max_scope_rulings()

    for i in range(cap):
        h.queue_verdict({"ruling": "IN_SCOPE", "reasoning": f"Covered {i}"})
        h.acting_as(client, 0)
        h.contract.rule_scope(job_id, f"Question {i}")

    h.queue_verdict({"ruling": "IN_SCOPE", "reasoning": "Covered"})
    h.acting_as(client, 0)
    with pytest.raises(UserError, match=f"used all {cap} scope rulings"):
        h.contract.rule_scope(job_id, "One more")
