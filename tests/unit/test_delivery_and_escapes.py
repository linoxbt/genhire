"""Delivery ordering, the permissionless escapes, and reviews."""
import json

import pytest

EVIDENCE = json.dumps(["https://example.com/build"])
# A well-formed sha256; content is only re-checked when a fetch succeeds.
ONE_HASH = json.dumps(["a" * 64])


# -- delivery ----------------------------------------------------------

def test_only_the_freelancer_can_deliver(h, client, UserError):
    job_id = h.engage(1000)
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="Only the freelancer can submit"):
        h.contract.submit_milestone(job_id, 0, EVIDENCE, ONE_HASH, "")


def test_milestones_are_delivered_in_order(h, freelancer, UserError):
    job_id = h.engage(600, 400)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="Milestone 0 must settle before milestone 1"):
        h.contract.submit_milestone(job_id, 1, EVIDENCE, ONE_HASH, "")


def test_the_next_milestone_opens_once_the_previous_settles(h):
    job_id = h.engage(600, 400)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)
    h.submit(job_id, 1)
    assert h.contract.get_job(job_id)["milestones"][1]["status"] == "submitted"


def test_a_milestone_cannot_be_delivered_twice(h, freelancer, UserError):
    job_id = h.engage(1000)
    h.submit(job_id, 0)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="not awaiting delivery"):
        h.contract.submit_milestone(job_id, 0, EVIDENCE, ONE_HASH, "")


def test_delivery_is_blocked_after_the_deadline(h, freelancer, UserError):
    job_id = h.engage(1000)
    h.warp(31 * 24 * 60 * 60)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="deadline for this job has passed"):
        h.contract.submit_milestone(job_id, 0, EVIDENCE, ONE_HASH, "")


def test_a_nonexistent_milestone_is_rejected(h, freelancer, UserError):
    job_id = h.engage(1000)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="Milestone 5 does not exist"):
        h.contract.submit_milestone(job_id, 5, EVIDENCE, ONE_HASH, "")


@pytest.mark.parametrize("bad", ["[]", '["ftp://x/y"]', '["not-a-url"]', "not json"])
def test_malformed_evidence_is_rejected(h, freelancer, UserError, bad):
    job_id = h.engage(1000)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError):
        h.contract.submit_milestone(job_id, 0, bad, ONE_HASH, "")


@pytest.mark.parametrize("scheme", ["https://", "http://", "ipfs://", "ar://"])
def test_accepted_evidence_schemes(h, freelancer, scheme):
    job_id = h.engage(1000)
    h.acting_as(freelancer, 0)
    h.contract.submit_milestone(job_id, 0, json.dumps([f"{scheme}example.com/x"]), ONE_HASH, "")
    assert h.contract.get_job(job_id)["milestones"][0]["status"] == "submitted"


def test_adjudication_requires_a_delivery(h, stranger, UserError):
    job_id = h.engage(1000)
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="not awaiting adjudication"):
        h.contract.adjudicate_milestone(job_id, 0)


def test_adjudication_is_permissionless(h, stranger):
    """A client who dislikes where a ruling is heading cannot withhold it."""
    job_id = h.engage(1000)
    h.submit(job_id, 0)
    h.queue_verdict({"completion_pct": 55, "reasoning": "Partly delivered", "criteria": []})
    h.acting_as(stranger, 0)
    h.contract.adjudicate_milestone(job_id, 0)
    assert h.contract.get_job(job_id)["milestones"][0]["pct"] == 55


# -- cancellation ------------------------------------------------------

def test_the_client_can_cancel_before_terms_are_agreed(h, client):
    job_id = h.post(1000)
    h.acting_as(client, 0)
    h.contract.cancel_job(job_id)
    assert h.paid_to(client) == 1000
    job = h.contract.get_job(job_id)
    assert job["status"] == "cancelled"
    assert job["escrow"] == "0"


def test_cancellation_is_closed_once_terms_are_agreed(h, client, UserError):
    job_id = h.post(1000)
    h.accept(job_id, h.propose(job_id, 1000))
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="while the job is 'awaiting_sow'"):
        h.contract.cancel_job(job_id)


def test_only_the_client_can_cancel(h, freelancer, UserError):
    job_id = h.post(1000)
    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="Only the client can cancel"):
        h.contract.cancel_job(job_id)


# -- expiry ------------------------------------------------------------

def test_expiry_returns_the_escrow_after_the_deadline(h, client, stranger):
    job_id = h.engage(1000)
    h.warp(31 * 24 * 60 * 60)
    h.acting_as(stranger, 0)  # permissionless
    h.contract.refund_expired(job_id)
    assert h.paid_to(client) == 1000
    assert h.contract.get_job(job_id)["status"] == "expired"


def test_expiry_is_blocked_before_the_deadline(h, stranger, UserError):
    job_id = h.engage(1000)
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="deadline for this job has not passed"):
        h.contract.refund_expired(job_id)


def test_expiry_refuses_to_strand_a_delivered_milestone(h, stranger, UserError):
    """A delivery already in front of the adjudicator settles on its answer,
    not on the clock."""
    job_id = h.engage(1000)
    h.submit(job_id, 0)
    h.warp(31 * 24 * 60 * 60)
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="still awaiting adjudication or settlement"):
        h.contract.refund_expired(job_id)


def test_expiry_returns_only_what_is_left_after_partial_settlement(h, client, freelancer):
    job_id = h.engage(600, 400)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)
    before = h.paid_to(client)
    h.warp(31 * 24 * 60 * 60)
    h.acting_as(client, 0)
    h.contract.refund_expired(job_id)
    assert h.paid_to(client) - before == 400
    assert h.paid_to(freelancer) == 600


def test_an_unproposed_job_can_expire(h, client):
    job_id = h.post(1000)
    h.warp(31 * 24 * 60 * 60)
    h.acting_as(client, 0)
    h.contract.refund_expired(job_id)
    assert h.paid_to(client) == 1000


def test_nothing_can_be_expired_twice(h, client, UserError):
    job_id = h.post(1000)
    h.warp(31 * 24 * 60 * 60)
    h.acting_as(client, 0)
    h.contract.refund_expired(job_id)
    with pytest.raises(UserError, match="while the job is 'expired'"):
        h.contract.refund_expired(job_id)


# -- reviews -----------------------------------------------------------

def test_both_parties_can_review_once_the_job_completes(h, client, freelancer):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)

    h.acting_as(client, 0)
    h.contract.submit_review(job_id, "Delivered exactly what was drafted")
    h.acting_as(freelancer, 0)
    h.contract.submit_review(job_id, "Clear brief, prompt settlement")

    reviews = h.contract.get_job(job_id)["reviews"]
    assert len(reviews) == 2
    assert {r["reviewer"] for r in reviews} == {client.as_hex, freelancer.as_hex}
    assert reviews[0]["subject"] == freelancer.as_hex


def test_a_party_can_only_review_once(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)
    h.acting_as(client, 0)
    h.contract.submit_review(job_id, "Good")
    with pytest.raises(UserError, match="already reviewed"):
        h.contract.submit_review(job_id, "Actually, great")


def test_reviews_are_closed_until_the_job_ends(h, client, UserError):
    job_id = h.engage(1000)
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="while the job is 'active'"):
        h.contract.submit_review(job_id, "Too early")


def test_a_review_is_length_capped(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="review too long"):
        h.contract.submit_review(job_id, "x" * 281)


def test_a_stranger_cannot_review(h, stranger, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="Only the client or the freelancer"):
        h.contract.submit_review(job_id, "Nice")


# -- unknown jobs ------------------------------------------------------

def test_an_unknown_job_is_rejected_everywhere(h, client, UserError):
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="Job 999 does not exist"):
        h.contract.get_job(999)


# -- remaining size caps and empty-input guards ------------------------

def test_delivery_and_dispute_size_caps(h, client, freelancer, UserError):
    module = h.module
    job_id = h.engage(1000)

    h.acting_as(freelancer, 0)
    with pytest.raises(UserError, match="notes too long"):
        h.contract.submit_milestone(job_id, 0, EVIDENCE, ONE_HASH, "x" * (module.MAX_NOTES_CHARS + 1))
    with pytest.raises(UserError, match="at most 5 evidence URLs"):
        h.contract.submit_milestone(job_id, 0, json.dumps(["https://a.com"] * 6), json.dumps(["a" * 64] * 6), "")

    h.submit(job_id, 0)
    h.adjudicate(job_id, 0, 40)
    bond = int(h.contract.get_required_bond(job_id, 0))
    h.acting_as(client, bond)
    with pytest.raises(UserError, match="reason too long"):
        h.contract.dispute_ruling(job_id, 0, "x" * (module.MAX_REASON_CHARS + 1))


def test_a_milestone_with_no_ruling_cannot_be_disputed(h, client, UserError):
    job_id = h.engage(600, 400)
    h.submit(job_id, 0)
    h.acting_as(client, 1)
    with pytest.raises(UserError, match="no ruling to dispute"):
        h.contract.dispute_ruling(job_id, 0, "Too early")


def test_scope_and_change_order_text_is_validated(h, client, UserError):
    module = h.module
    job_id = h.engage(1000)

    h.acting_as(client, 0)
    with pytest.raises(UserError, match="request_text must not be empty"):
        h.contract.rule_scope(job_id, "   ")
    with pytest.raises(UserError, match="request_text too long"):
        h.contract.rule_scope(job_id, "x" * (module.MAX_SCOPE_REQUEST_CHARS + 1))

    h.acting_as(client, 500)
    with pytest.raises(UserError, match="request_text must not be empty"):
        h.contract.open_change_order(job_id, "  ", h.schedule(500), h.at(60 * 86400))


def test_expiry_with_nothing_escrowed_is_rejected(h, client, UserError):
    """A cancelled job has zero escrow; expiring it again must not emit a
    zero-value transfer or claim to refund anything."""
    job_id = h.post(1000)
    h.acting_as(client, 0)
    h.contract.cancel_job(job_id)
    h.warp(31 * 24 * 60 * 60)
    with pytest.raises(UserError, match="while the job is 'cancelled'"):
        h.contract.refund_expired(job_id)


def test_an_empty_review_is_rejected(h, client, UserError):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 100)
    h.settle(job_id, 0)
    h.acting_as(client, 0)
    with pytest.raises(UserError, match="must not be empty"):
        h.contract.submit_review(job_id, "   ")
