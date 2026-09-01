"""Direct mode: proposals, counters and acceptance - the last step before the
contract has to draft anything."""
from helpers import deploy, milestones, post_job, propose


def test_proposal_is_recorded(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    idx = propose(contract, direct_vm, direct_bob, job_id, 400, 300)

    from genlayer.py.types import Address

    proposals = contract.get_proposals(job_id)
    assert idx == 0 and len(proposals) == 1
    assert proposals[0]["from"] == Address(direct_bob).as_hex
    assert proposals[0]["to"] == Address(direct_alice).as_hex
    assert proposals[0]["price"] == "700"


def test_client_cannot_propose_on_their_own_job(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("cannot propose on their own job"):
        contract.submit_proposal(job_id, "Mine", milestones(1000))


def test_proposal_cannot_exceed_the_escrow(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("only 1000 wei is escrowed"):
        contract.submit_proposal(job_id, "Ambitious", milestones(1500))


def test_counter_then_accept_sets_the_agreed_terms(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    idx = propose(contract, direct_vm, direct_bob, job_id, 900)

    direct_vm.sender = direct_alice
    counter_idx = contract.counter_proposal(job_id, idx, "Here is my split", milestones(400, 300))
    direct_vm.sender = direct_bob
    contract.accept_proposal(job_id, counter_idx)

    from genlayer.py.types import Address

    job = contract.get_job(job_id)
    assert job["status"] == "awaiting_sow"
    assert job["freelancer"] == Address(direct_bob).as_hex
    assert job["agreed_price"] == "700"
    assert job["escrow"] == "700"          # the unspent 300 was refunded on acceptance
    assert job["accepted_proposal_idx"] == counter_idx


def test_only_the_addressee_can_accept(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    idx = propose(contract, direct_vm, direct_bob, job_id, 1000)
    direct_vm.sender = direct_bob   # the offeror cannot accept their own offer
    with direct_vm.expect_revert("Only the party an offer was made to"):
        contract.accept_proposal(job_id, idx)


def test_job_is_addressable_by_both_parties(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    idx = propose(contract, direct_vm, direct_bob, job_id, 1000)
    direct_vm.sender = direct_alice
    contract.accept_proposal(job_id, idx)

    from genlayer.py.types import Address

    assert contract.list_jobs_for(Address(direct_alice)) == [job_id]
    assert contract.list_jobs_for(Address(direct_bob)) == [job_id]


def test_cancel_refunds_and_closes(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    direct_vm.sender = direct_alice
    contract.cancel_job(job_id)
    job = contract.get_job(job_id)
    assert job["status"] == "cancelled"
    assert job["escrow"] == "0"


def test_expiry_after_the_deadline(direct_vm, direct_deploy, direct_alice, direct_bob):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("deadline for this job has not passed"):
        contract.refund_expired(job_id)


def test_the_sow_is_empty_until_it_is_drafted(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    sow = contract.get_sow(job_id)
    assert sow["version"] == 0
    assert sow["scope"] == ""
    assert sow["milestones"] == []


def test_drafting_cannot_be_skipped(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Signing is gated on a draft existing at all."""
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 1000)
    idx = propose(contract, direct_vm, direct_bob, job_id, 1000)
    direct_vm.sender = direct_alice
    contract.accept_proposal(job_id, idx)
    with direct_vm.expect_revert("while the job is 'awaiting_sow'"):
        contract.sign_sow(job_id, "a" * 64)
