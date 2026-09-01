"""Bonded disputes: forcing a re-adjudication, and who pays for it."""
import pytest


def bond_for(h, job_id, index=0):
    return h.contract.get_required_bond(job_id, index)


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

    h.gl.nondet.web.pages["https://example.com/build"] = "a build page"
    h.gl.nondet.responses.append('{"completion_pct": 65, "reasoning": "Reviewed again", "criteria": []}')
    h.queue_verdict(lambda leader_fn: leader_fn())  # run the real leader body
    h.acting_as(client, 0)
    h.contract.adjudicate_milestone(job_id, 0)

    prompt = h.gl.nondet.prompts[-1]
    assert "PREVIOUS RULING ON THIS MILESTONE IS BEING CONTESTED" in prompt
    assert "The API docs criterion was met in the appendix" in prompt
