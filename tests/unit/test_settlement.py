"""Escrow arithmetic: what a ruling actually pays out."""
import pytest


@pytest.mark.parametrize("pct", list(range(0, 101)))
def test_split_conserves_the_whole_amount(h, pct):
    """paid + refunded is exactly the milestone amount, at every percentage."""
    earned, refunded = h.module._split(1000000000000000007, pct)
    assert earned + refunded == 1000000000000000007
    assert earned >= 0 and refunded >= 0


@pytest.mark.parametrize(
    "amount,pct,expected_earned",
    [
        (1000, 0, 0),
        (1000, 100, 1000),
        (1000, 33, 330),
        (1000, 99, 990),
        (1, 50, 0),        # a single wei cannot be halved - the dust stays with the client
        (7, 99, 6),
        (10**18, 72, 720000000000000000),
    ],
)
def test_split_rounds_down_to_the_freelancer(h, amount, pct, expected_earned):
    earned, refunded = h.module._split(amount, pct)
    assert earned == expected_earned
    assert refunded == amount - expected_earned


def test_split_rejects_a_percentage_outside_the_range(h, UserError):
    with pytest.raises(UserError):
        h.module._split(1000, 101)
    with pytest.raises(UserError):
        h.module._split(1000, -1)


@pytest.mark.parametrize("pct,earned,refunded", [(0, 0, 1000), (37, 370, 630), (100, 1000, 0)])
def test_settlement_moves_exactly_the_ruled_split(h, client, freelancer, pct, earned, refunded):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, pct)
    h.settle(job_id, 0)

    assert h.paid_to(freelancer) == earned
    assert h.paid_to(client) == refunded
    job = h.contract.get_job(job_id)
    assert job["escrow"] == "0"
    assert job["status"] == "completed"
    milestone = job["milestones"][0]
    assert milestone["status"] == "settled"
    assert int(milestone["paid"]) + int(milestone["refunded"]) == 1000


def test_escrow_falls_by_exactly_the_settled_milestone(h):
    job_id = h.engage(600, 400)
    assert h.contract.get_job(job_id)["escrow"] == "1000"
    h.deliver_and_rule(job_id, 0, 50)
    h.settle(job_id, 0)
    assert h.contract.get_job(job_id)["escrow"] == "400"
    assert h.contract.get_job(job_id)["status"] == "active"


def test_a_zero_percent_ruling_transfers_nothing_to_the_freelancer(h, freelancer):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 0)
    h.settle(job_id, 0)
    # No zero-value transfer is emitted at all - emit_transfer rejects zero.
    assert all(entry["to"] != freelancer for entry in h.transfers)


def test_settlement_waits_for_the_appeal_window(h, UserError, stranger):
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 80)
    h.acting_as(stranger, 0)
    with pytest.raises(UserError, match="appeal window"):
        h.contract.settle_milestone(job_id, 0)
    h.settle(job_id, 0)
    assert h.contract.get_job(job_id)["status"] == "completed"


def test_settlement_is_permissionless(h, stranger):
    """Escrow must never depend on a counterparty still being around."""
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 60)
    h.warp(h.contract.get_appeal_window_seconds() + 1)
    h.acting_as(stranger, 0)
    h.contract.settle_milestone(job_id, 0)
    assert h.contract.get_job(job_id)["status"] == "completed"


def test_a_milestone_cannot_be_settled_twice(h, UserError):
    # Two milestones, so the job is still `active` after the first settles -
    # with a single milestone the job would be `completed` and the status
    # guard would mask the per-milestone one.
    job_id = h.engage(600, 400)
    h.deliver_and_rule(job_id, 0, 60)
    h.settle(job_id, 0)
    with pytest.raises(UserError, match="not awaiting settlement"):
        h.contract.settle_milestone(job_id, 0)


def test_an_unruled_milestone_cannot_be_settled(h, UserError):
    job_id = h.engage(600, 400)
    h.submit(job_id, 0)
    h.warp(h.contract.get_appeal_window_seconds() + 1)
    with pytest.raises(UserError, match="not awaiting settlement"):
        h.contract.settle_milestone(job_id, 0)


def test_the_appeal_window_is_fixed_at_deployment(h):
    assert h.contract.get_appeal_window_seconds() == h.module.DEFAULT_APPEAL_WINDOW_SECONDS
    short = h.module.GenHire(300)
    assert short.get_appeal_window_seconds() == 300


@pytest.mark.parametrize("bad", [0, 59, 30 * 24 * 60 * 60 + 1])
def test_an_out_of_range_appeal_window_is_refused_at_deployment(h, UserError, bad):
    with pytest.raises(UserError, match="appeal_window_seconds must be between"):
        h.module.GenHire(bad)


def test_a_short_window_still_gates_settlement(h, client, freelancer, stranger):
    """The window is configurable, not skippable."""
    h.gl.eq_principle.results.clear()
    contract = h.module.GenHire(300)
    h.contract = contract
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 50)
    h.acting_as(stranger, 0)
    with pytest.raises(h.module.gl.vm.UserError, match="appeal window"):
        contract.settle_milestone(job_id, 0)
    h.warp(301)
    contract.settle_milestone(job_id, 0)
    assert h.paid_to(freelancer) == 500
