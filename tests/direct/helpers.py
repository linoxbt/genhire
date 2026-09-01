"""Helpers for the direct-mode suite.

Kept out of conftest.py so the two suites' helper modules have distinct import
names - pytest puts both test directories on sys.path, and two modules both
called `conftest` would shadow one another.
"""
import datetime
import json

CONTRACT_PATH = "contracts/genhire.py"

# Fixed reference time; direct mode's clock is set once per deployed instance
# via warp(), and every deadline here is computed relative to it.
NOW_ISO = "2026-01-01T00:00:00Z"
NOW_TS = int(datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc).timestamp())
ONE_DAY = 24 * 60 * 60

EVIDENCE = json.dumps(["https://example.com/build"])


def deploy(direct_vm, direct_deploy):
    direct_vm.warp(NOW_ISO)
    return direct_deploy(CONTRACT_PATH)


def future_deadline(days: int = 30) -> int:
    return NOW_TS + days * ONE_DAY


def milestones(*amounts, prefix="Milestone") -> str:
    return json.dumps(
        [{"title": f"{prefix} {index + 1}", "amount": str(amount)} for index, amount in enumerate(amounts)]
    )


def post_job(contract, direct_vm, client, *amounts, brief="Build a checkout flow", deadline=None):
    direct_vm.sender = client
    direct_vm.value = sum(amounts)
    job_id = contract.post_job(brief, milestones(*amounts), deadline or future_deadline())
    direct_vm.value = 0
    return job_id


def propose(contract, direct_vm, freelancer, job_id, *amounts, approach="I will build it in two passes"):
    direct_vm.sender = freelancer
    direct_vm.value = 0
    return contract.submit_proposal(job_id, approach, milestones(*amounts))
