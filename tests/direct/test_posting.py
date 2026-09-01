"""Direct mode: real GenVM types and storage, for everything reachable without
a validator round. See conftest.py for why that stops at draft_sow."""
import json

from helpers import EVIDENCE, deploy, future_deadline, milestones, post_job, propose


def test_post_job_round_trips_through_real_storage(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    job_id = post_job(contract, direct_vm, direct_alice, 600, 400)

    from genlayer.py.types import Address

    job = contract.get_job(job_id)
    assert job_id == 1
    assert job["client"] == Address(direct_alice).as_hex
    assert job["status"] == "drafting"
    assert job["escrow"] == "1000"
    assert job["budget"] == "1000"
    assert job["agreed_price"] == "0"
    assert job["sow_version"] == 0
    assert job["client_signed"] is False
    assert len(job["milestones"]) == 2
    assert job["milestones"][0]["amount"] == "600"


def test_ids_increment_and_list(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    first = post_job(contract, direct_vm, direct_alice, 1000)
    second = post_job(contract, direct_vm, direct_alice, 500)
    assert [first, second] == [1, 2]
    assert contract.list_jobs() == [1, 2]


def test_post_job_rejects_a_mismatched_budget(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 900
    with direct_vm.expect_revert("Milestone amounts total 1000 wei"):
        contract.post_job("Brief", milestones(600, 400), future_deadline())


def test_post_job_requires_value(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 0
    with direct_vm.expect_revert("non-zero budget"):
        contract.post_job("Brief", milestones(1000), future_deadline())


def test_post_job_requires_a_future_deadline(direct_vm, direct_deploy, direct_alice):
    contract = deploy(direct_vm, direct_deploy)
    direct_vm.sender = direct_alice
    direct_vm.value = 1000
    with direct_vm.expect_revert("deadline must be in the future"):
        contract.post_job("Brief", milestones(1000), future_deadline(days=-1))


def test_constants_are_readable(direct_vm, direct_deploy):
    contract = deploy(direct_vm, direct_deploy)
    assert contract.get_appeal_window_seconds() == 48 * 60 * 60
    assert contract.get_max_dispute_rounds() == 3


def test_an_unknown_job_reverts(direct_vm, direct_deploy):
    contract = deploy(direct_vm, direct_deploy)
    with direct_vm.expect_revert("does not exist"):
        contract.get_job(42)
