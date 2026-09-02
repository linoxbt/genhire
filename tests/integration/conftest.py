"""Fixtures for the live-network suite.

This is the only suite that can exercise what the other two cannot: the actual
LLM-decided outcomes. `tests/direct` cannot reach them (its mock host has no
`ExecPromptTemplate` handler, so both eq_principle prompt primitives resolve to
`None`), and `tests/unit` injects the answer rather than deriving it.

Running it needs a funded account's raw private key in a gitignored
`gltest.config.yaml` — see gltest.config.yaml.example. Pace it: Studionet
enforces both a per-minute and a 5000/day request quota, and each drafting or
adjudication call is a full validator round.

    gltest tests/integration/ -v -s --network studionet
"""
import json

import pytest
from gltest import get_contract_factory
from gltest.contracts import Contract

CONTRACT_NAME = "GenHire"

# A validator round running a real model is slow; the default receipt budget is
# far too short for drafting or adjudication.
WAIT_RETRIES = 200
WAIT_INTERVAL = 3000

# Deploy the suite's own instance with a short appeal window so settlement is
# reachable inside a test run rather than two days later.
TEST_APPEAL_WINDOW = 60

# Stable, boring fixture page - the evidence content itself is not what is under
# test here, the judging of it is.
EVIDENCE_URL = "https://example.com"

BRIEF = (
    "Build a single landing page that explains what the IANA example domain is for. "
    "It must be readable without JavaScript and must state that the domain is reserved "
    "for use in documentation."
)


def deploy_genhire(account=None, appeal_window: int = TEST_APPEAL_WINDOW):
    return get_contract_factory(CONTRACT_NAME).deploy(account=account, args=[appeal_window])


def as_account(contract, account):
    """Re-bind a deployed contract to a different signer."""
    return Contract.new(address=contract.address, schema=contract._schema, account=account)


def schedule(*amounts, prefix="Milestone") -> str:
    return json.dumps(
        [{"title": f"{prefix} {i + 1}", "amount": str(a)} for i, a in enumerate(amounts)]
    )


def evidence(*urls) -> str:
    return json.dumps(list(urls) or [EVIDENCE_URL])


def evidence_hashes(*hashes) -> str:
    """One sha256 per URL. Content-addressed references pass an empty string.

    The fixture page is fetched by validators, not by us, so the digest has to
    be of exactly what `gl.nondet.web.render` returns - which is why this suite
    hashes the live page at test time rather than pinning a constant.
    """
    return json.dumps(list(hashes))


def sha256_of(url: str) -> str:
    """The sha256 of a page's text, as the contract will compute it."""
    import hashlib
    import urllib.request

    with urllib.request.urlopen(url, timeout=30) as response:
        return hashlib.sha256(response.read().decode("utf-8", "replace").encode("utf-8")).hexdigest()


@pytest.fixture
def genhire():
    return deploy_genhire()
