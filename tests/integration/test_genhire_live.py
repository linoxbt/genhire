"""End-to-end against a real GenLayer network.

Everything here is a claim about the *LLM-decided* behaviour, which is exactly
what the other two suites cannot check. Assertions are deliberately loose about
wording and strict about structure: a validator round is not reproducible
sentence-for-sentence, but the shape of what it produces has to hold every time.
"""
import time

from gltest.assertions import tx_execution_succeeded

from conftest import (
    BRIEF,
    TEST_APPEAL_WINDOW,
    WAIT_INTERVAL,
    WAIT_RETRIES,
    as_account,
    deploy_genhire,
    evidence,
    schedule,
)

M1 = 6 * 10**15
M2 = 4 * 10**15
DEADLINE_DAYS = 30


def _deadline() -> int:
    return int(time.time()) + DEADLINE_DAYS * 24 * 3600


def _agree(contract, client, freelancer):
    """Post, propose and accept - leaves the job in `awaiting_sow`."""
    as_client = as_account(contract, client)
    receipt = as_client.post_job(args=[BRIEF, schedule(M1, M2), _deadline()]).transact(
        value=M1 + M2, wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
    )
    assert tx_execution_succeeded(receipt)
    job_id = as_client.list_jobs().call()[-1]

    as_freelancer = as_account(contract, freelancer)
    assert tx_execution_succeeded(
        as_freelancer.submit_proposal(
            args=[job_id, "I will build the page, then the copy pass.", schedule(M1, M2)]
        ).transact(wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL)
    )
    assert tx_execution_succeeded(
        as_client.accept_proposal(args=[job_id, 0]).transact(
            wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
        )
    )
    return job_id, as_client, as_freelancer


def test_the_contract_drafts_usable_criteria(genhire, accounts):
    """The core claim: a vague brief comes back as checkable criteria, one list
    per milestone, without either party having written them."""
    job_id, as_client, _ = _agree(genhire, accounts[0], accounts[1])

    assert tx_execution_succeeded(
        as_client.draft_sow(args=[job_id]).transact(
            wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
        )
    )

    sow = as_client.get_sow(args=[job_id]).call()
    assert sow["version"] == 1
    assert len(sow["hash"]) == 64
    assert sow["scope"].strip()
    # Exactly one criteria list per milestone, in order - the contract rejects
    # any draft that reshapes the agreed schedule.
    assert len(sow["milestones"]) == 2
    for milestone in sow["milestones"]:
        assert len(milestone["criteria"]) >= 1
        assert all(criterion.strip() for criterion in milestone["criteria"])

    job = as_client.get_job(args=[job_id]).call()
    assert job["status"] == "sow_drafted"
    assert job["milestones"][0]["criteria"] == sow["milestones"][0]["criteria"]


def test_full_lifecycle_settles_proportionally(genhire, accounts):
    """Post through settlement, with the split coming from a real ruling."""
    client, freelancer = accounts[0], accounts[1]
    job_id, as_client, as_freelancer = _agree(genhire, client, freelancer)

    as_client.draft_sow(args=[job_id]).transact(wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL)
    sow_hash = as_client.get_job(args=[job_id]).call()["sow_hash"]

    for signer in (as_client, as_freelancer):
        assert tx_execution_succeeded(
            signer.sign_sow(args=[job_id, sow_hash]).transact(
                wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
            )
        )
    assert as_client.get_job(args=[job_id]).call()["status"] == "active"

    assert tx_execution_succeeded(
        as_freelancer.submit_milestone(
            args=[job_id, 0, evidence(), "Delivered."]
        ).transact(
            wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
        )
    )
    assert tx_execution_succeeded(
        as_client.adjudicate_milestone(args=[job_id, 0]).transact(
            wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
        )
    )

    milestone = as_client.get_job(args=[job_id]).call()["milestones"][0]
    assert milestone["status"] == "ruled"
    # `_coerce_pct` clamps and `_split` rejects out-of-range, so a bare
    # 0 <= pct <= 100 assertion cannot fail. What is worth asserting is that the
    # figure is on-step, which is what makes settlement deterministic.
    assert milestone["pct"] % 5 == 0, "rulings must be quantised"
    assert milestone["reasoning"].strip()

    time.sleep(TEST_APPEAL_WINDOW + 10)
    assert tx_execution_succeeded(
        as_client.settle_milestone(args=[job_id, 0]).transact(
            wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
        )
    )

    settled = as_client.get_job(args=[job_id]).call()["milestones"][0]
    assert settled["status"] == "settled"
    # The invariant the whole design rests on, checked against a real ruling.
    assert int(settled["paid"]) + int(settled["refunded"]) == M1
    assert int(settled["paid"]) == M1 * settled["pct"] // 100


def test_scope_ruling_answers_against_the_signed_agreement(genhire, accounts):
    """A request the brief plainly never covered must come back OUT_OF_SCOPE."""
    job_id, as_client, as_freelancer = _agree(genhire, accounts[0], accounts[1])
    as_client.draft_sow(args=[job_id]).transact(wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL)
    sow_hash = as_client.get_job(args=[job_id]).call()["sow_hash"]
    for signer in (as_client, as_freelancer):
        signer.sign_sow(args=[job_id, sow_hash]).transact(
            wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL
        )

    assert tx_execution_succeeded(
        as_client.rule_scope(
            args=[job_id, "Also build a native iOS app with offline sync and push notifications."]
        ).transact(wait_retries=WAIT_RETRIES, wait_interval=WAIT_INTERVAL)
    )

    ruling = as_client.get_rulings(args=[job_id]).call()[-1]
    assert ruling["kind"] == "scope"
    assert ruling["ruling"] == "OUT_OF_SCOPE"
    assert ruling["reasoning"].strip()


def test_deploy_rejects_an_out_of_range_appeal_window(accounts):
    """The window is fixed at deployment and bounded - a zero-second window
    would strip the losing side of any chance to contest a ruling."""
    try:
        deploy_genhire(account=accounts[0], appeal_window=1)
    except Exception as error:
        assert "appeal_window_seconds must be between" in str(error)
    else:
        raise AssertionError("a 1-second appeal window should not deploy")
