"""Fixtures for the in-process suite. See glstub.py for what this proves."""
import datetime
import importlib.util
import json
import pathlib
import sys

import pytest

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import glstub  # noqa: E402

CONTRACT_PATH = pathlib.Path(__file__).resolve().parents[2] / "contracts" / "genhire.py"

NOW = datetime.datetime(2026, 1, 1, tzinfo=datetime.timezone.utc)
ONE_DAY = 24 * 60 * 60
CLIENT = glstub.Address("0x1111111111111111111111111111111111111111")
FREELANCER = glstub.Address("0x2222222222222222222222222222222222222222")
STRANGER = glstub.Address("0x3333333333333333333333333333333333333333")


def _load_contract_module():
    spec = importlib.util.spec_from_file_location("genhire_contract", CONTRACT_PATH)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Harness:
    """Drives the real contract, tracking simulated time and payouts."""

    def __init__(self):
        self.gl = glstub.install()
        self.module = _load_contract_module()
        self.contract = self.module.GenHire()
        self.now = NOW

    # -- host controls -------------------------------------------------
    def warp(self, seconds: int) -> None:
        self.now = self.now + datetime.timedelta(seconds=seconds)
        self.gl.message_raw["datetime"] = self.now.strftime("%Y-%m-%dT%H:%M:%SZ")

    def at(self, seconds_from_start: int = 0) -> int:
        return int(NOW.timestamp()) + seconds_from_start

    def acting_as(self, sender, value: int = 0) -> None:
        self.gl.message.sender_address = sender
        self.gl.message.value = glstub.u256(value)

    @property
    def transfers(self):
        return self.gl.transfers

    def paid_to(self, address) -> int:
        return sum(entry["value"] for entry in self.gl.transfers if entry["to"] == address)

    def queue_verdict(self, *results) -> None:
        self.gl.eq_principle.results.extend(results)

    # -- flow shortcuts ------------------------------------------------
    def schedule(self, *amounts, prefix="Milestone") -> str:
        return json.dumps(
            [{"title": f"{prefix} {i + 1}", "amount": str(a)} for i, a in enumerate(amounts)]
        )

    def post(self, *amounts, client=CLIENT, brief="Build a checkout flow", days=30) -> int:
        self.acting_as(client, sum(amounts))
        job_id = self.contract.post_job(brief, self.schedule(*amounts), self.at(days * ONE_DAY))
        self.acting_as(client, 0)
        return job_id

    def propose(self, job_id, *amounts, freelancer=FREELANCER, approach="Two passes") -> int:
        self.acting_as(freelancer, 0)
        return self.contract.submit_proposal(job_id, approach, self.schedule(*amounts))

    def accept(self, job_id, proposal_idx, client=CLIENT) -> None:
        self.acting_as(client, 0)
        self.contract.accept_proposal(job_id, proposal_idx)

    def sow_payload(self, count: int, scope="Deliver the checkout flow"):
        return json.dumps(
            {
                "scope": scope,
                "assumptions": ["The client supplies branding"],
                "exclusions": ["Native mobile apps"],
                "milestones": [{"criteria": [f"Criterion for milestone {i + 1}"]} for i in range(count)],
            }
        )

    def draft(self, job_id, count=None, payload=None) -> None:
        job = self.contract.get_job(job_id)
        self.queue_verdict(payload if payload is not None else self.sow_payload(count or len(job["milestones"])))
        self.acting_as(STRANGER, 0)
        self.contract.draft_sow(job_id)

    def sign_both(self, job_id, client=CLIENT, freelancer=FREELANCER) -> None:
        sow_hash = self.contract.get_job(job_id)["sow_hash"]
        self.acting_as(client, 0)
        self.contract.sign_sow(job_id, sow_hash)
        self.acting_as(freelancer, 0)
        self.contract.sign_sow(job_id, sow_hash)

    def engage(self, *amounts, client=CLIENT, freelancer=FREELANCER) -> int:
        """Post, propose, accept, draft and sign - job left `active`."""
        job_id = self.post(*amounts, client=client)
        idx = self.propose(job_id, *amounts, freelancer=freelancer)
        self.accept(job_id, idx, client=client)
        self.draft(job_id)
        self.sign_both(job_id, client=client, freelancer=freelancer)
        return job_id

    def change_order(self, job_id, *amounts, client=CLIENT, request="Add an admin report", days=60, prefix="Amendment"):
        self.acting_as(client, sum(amounts))
        self.contract.open_change_order(job_id, request, self.schedule(*amounts, prefix=prefix), self.at(days * ONE_DAY))
        self.acting_as(client, 0)

    def submit(self, job_id, index, freelancer=FREELANCER, notes="Done") -> None:
        self.acting_as(freelancer, 0)
        self.contract.submit_milestone(job_id, index, json.dumps(["https://example.com/build"]), notes)

    def adjudicate(self, job_id, index, pct, reasoning="Assessed against the criteria") -> None:
        self.queue_verdict({"completion_pct": pct, "reasoning": reasoning, "criteria": []})
        self.acting_as(STRANGER, 0)
        self.contract.adjudicate_milestone(job_id, index)

    def deliver_and_rule(self, job_id, index, pct) -> None:
        self.submit(job_id, index)
        self.adjudicate(job_id, index, pct)

    def settle(self, job_id, index, after_window=True) -> None:
        if after_window:
            self.warp(self.contract.get_appeal_window_seconds() + 1)
        self.acting_as(STRANGER, 0)
        self.contract.settle_milestone(job_id, index)


@pytest.fixture
def h():
    return Harness()


@pytest.fixture
def client():
    return CLIENT


@pytest.fixture
def freelancer():
    return FREELANCER


@pytest.fixture
def stranger():
    return STRANGER


@pytest.fixture
def UserError():
    return glstub.UserError
