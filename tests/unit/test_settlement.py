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


# Percentages are on-step: a ruling is quantised to RULING_STEP_PCT before
# anything is stored or paid, so these are the values the contract can hold.
@pytest.mark.parametrize("pct,earned,refunded", [(0, 0, 1000), (35, 350, 650), (100, 1000, 0)])
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


def test_payouts_use_the_external_message_form(h, client, freelancer):
    """Regression guard for the defect that shipped here once.

    Paying an EOA is an external message and must go through the EVM
    contract-interface shape. The internal `gl.get_contract_at(...)` form has no
    receiver on a plain account, and per the docs the value is debited on emit
    and not returned if the child transaction fails - escrow stranded, not
    reverted. The stub refuses the internal form outright, so this test failing
    means a payout has regressed to it.
    """
    job_id = h.engage(1000)
    h.deliver_and_rule(job_id, 0, 60)
    h.settle(job_id, 0)

    assert h.paid_to(freelancer) == 600
    assert h.paid_to(client) == 400
    # External messages always execute on finalization - there is no other mode.
    assert [t["on"] for t in h.transfers] == ["finalized"] * len(h.transfers)


def test_the_internal_message_form_is_rejected_outright(h):
    """The stub must keep refusing the wrong API, or the guard above is empty."""
    with pytest.raises(AssertionError, match="cannot pay an EOA"):
        h.module.gl.get_contract_at(h.module.ZERO_ADDRESS).emit_transfer(value=1)


def test_the_contract_never_pays_out_more_than_it_was_funded(h, client, freelancer):
    """The invariant an escrow may never break, over a full adversarial run.

    The stub debits a real balance on every emit and raises InsufficientBalance
    if the contract ever tries to send more than it holds, so this exercises the
    whole lifecycle - acceptance refund, dispute bond, re-adjudication payout and
    settlement - and asserts the books balance at the end.
    """
    funded = 0

    # Posted over-budget, so acceptance must refund the difference.
    h.acting_as(client, 1000)
    funded += 1000
    job_id = h.contract.post_job('Brief', h.schedule(600, 400), h.at(30 * 86400))
    h.acting_as(client, 0)

    idx = h.propose(job_id, 500, 300)
    h.accept(job_id, idx)
    h.draft(job_id)
    h.sign_both(job_id)

    # Milestone 1: ruled, disputed (bond in), re-ruled, settled.
    h.deliver_and_rule(job_id, 0, 40)
    bond = int(h.contract.get_required_bond(job_id, 0))
    h.acting_as(client, bond)
    funded += bond
    h.contract.dispute_ruling(job_id, 0, 'Under-scored')
    h.adjudicate(job_id, 0, 70)
    h.settle(job_id, 0)

    # Milestone 2 settled at a partial percentage.
    h.deliver_and_rule(job_id, 1, 33)
    h.settle(job_id, 1)

    paid_out = sum(t['value'] for t in h.transfers)
    assert paid_out <= funded, 'paid out more than was ever funded'
    assert h.gl.balance == funded - paid_out >= 0
    # Nothing may be left stranded once every milestone has settled.
    assert h.contract.get_job(job_id)['status'] == 'completed'
    assert h.contract.get_job(job_id)['escrow'] == '0'
    assert h.gl.balance == 0, 'every wei funded must have been paid out or refunded'


@pytest.mark.parametrize(
    "raw,quantised",
    [(0, 0), (2, 0), (3, 5), (33, 35), (37, 35), (72, 70), (73, 75), (98, 100), (100, 100)],
)
def test_rulings_quantise_so_validators_agree_exactly(h, raw, quantised):
    """H-6: settlement pays one exact number, so the ruling must be one bucket.

    An equivalence principle has to tolerate some spread between validators, but
    the escrow is split on a single figure - so within that tolerance, leader
    selection was deciding real money. Rounding to a coarse step lets the
    principle demand an exact match instead.
    """
    verdict = h.module._parse_milestone_verdict(
        f'{{"completion_pct": {raw}, "reasoning": "assessed"}}'
    )
    assert verdict["completion_pct"] == quantised
    assert verdict["completion_pct"] % h.module.RULING_STEP_PCT == 0


def test_two_validators_a_few_points_apart_settle_identically(h, freelancer):
    """The property that matters: nearby honest answers pay the same amount."""
    for raw in (68, 71, 72):
        job_id = h.engage(1000)
        h.submit(job_id, 0)
        h.queue_verdict({"completion_pct": raw, "reasoning": "assessed", "criteria": []})
        h.acting_as(freelancer, 0)
        h.contract.adjudicate_milestone(job_id, 0)
        h.settle(job_id, 0)
        assert h.contract.get_job(job_id)["milestones"][0]["paid"] == "700"
