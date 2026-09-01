"""A minimal in-process stand-in for the GenVM host, used by tests/unit.

Why this exists: gltest's direct mode has no handler for the
`ExecPromptTemplate` host request that `gl.eq_principle.prompt_comparative`
and `prompt_non_comparative` issue, so those primitives resolve to `None`
there regardless of any registered mock. Every method downstream of
`draft_sow` - signing, delivery, adjudication, disputes, settlement, change
orders - is therefore unreachable in direct mode, which would leave the
escrow arithmetic untested.

This module supplies just enough of the `genlayer` namespace to import
`contracts/genhire.py` unmodified and run it as ordinary Python, with the
non-deterministic primitives replaced by injectable results.

What that does and does not prove:
  - It exercises the real contract source: every guard, state transition and
    wei-level calculation is the shipped code, not a reimplementation.
  - It does NOT model GenVM storage encoding, gas, or validator consensus. The
    LLM result is injected, so it proves what the contract does *with* a
    verdict, never that validators would agree on one. Consensus behaviour is
    the job of tests/integration, and storage realism the job of tests/direct.
"""
import sys
import types


class UserError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


class Address:
    __slots__ = ("_hex",)

    def __init__(self, value):
        if isinstance(value, Address):
            self._hex = value._hex
        elif isinstance(value, bytes):
            self._hex = "0x" + value.hex()
        else:
            text = str(value).lower()
            if not text.startswith("0x"):
                text = "0x" + text
            self._hex = text

    @property
    def as_hex(self) -> str:
        return self._hex

    @property
    def as_bytes(self) -> bytes:
        return bytes.fromhex(self._hex[2:])

    def __eq__(self, other):
        return isinstance(other, Address) and other._hex == self._hex

    def __hash__(self):
        return hash(self._hex)

    def __repr__(self):
        return f"Address({self._hex})"


class u256(int):
    """int, but it refuses to hold a negative.

    Real GenVM would wrap or trap here; for a test harness, refusing is the
    point - any negative reaching this constructor is an accounting bug in the
    contract, and it should surface loudly rather than silently wrapping to a
    huge balance.
    """

    def __new__(cls, value=0):
        number = int(value)
        if number < 0:
            raise AssertionError(f"u256 underflow: {number}")
        return super().__new__(cls, number)


class _Generic:
    def __class_getitem__(cls, item):
        return cls


class TreeMap(dict, _Generic):
    pass


class DynArray(list, _Generic):
    pass


def allow_storage(cls):
    return cls


class _Message:
    def __init__(self):
        self.sender_address = Address("0x" + "00" * 20)
        self.value = u256(0)


class _Public:
    """Decorator namespace: @gl.public.view / .write / .write.payable."""

    class _Write:
        def __call__(self, fn):
            fn.__gl_write__ = True
            return fn

        def payable(self, fn):
            fn.__gl_payable__ = True
            return fn

    def __init__(self):
        self.write = self._Write()

    def view(self, fn):
        fn.__gl_view__ = True
        return fn


class _Recipient:
    def __init__(self, address, ledger):
        self._address = address
        self._ledger = ledger

    def emit_transfer(self, value, on="finalized"):
        if int(value) <= 0:
            raise ValueError("value must be greater than 0 for emit_transfer")
        self._ledger.append({"to": self._address, "value": int(value), "on": on})


class _Vm:
    UserError = UserError


class _Contract:
    """Base class standing in for gl.Contract.

    Storage fields are declared as class annotations on the contract and never
    assigned before use, so they are materialised here from those annotations
    before the contract's own __init__ runs.
    """

    def __new__(cls, *args, **kwargs):
        instance = super().__new__(cls)
        for name, annotation in getattr(cls, "__annotations__", {}).items():
            if annotation is TreeMap or getattr(annotation, "__name__", "") == "TreeMap":
                setattr(instance, name, TreeMap())
            elif annotation is DynArray or getattr(annotation, "__name__", "") == "DynArray":
                setattr(instance, name, DynArray())
            else:
                setattr(instance, name, u256(0))
        return instance


class _EqPrinciple:
    """Stands in for gl.eq_principle.

    `results` is a queue the test fills. Each entry is either a value to hand
    back, or a callable invoked with the leader function so a test can run the
    real leader body (and, through it, the prompt-building and parsing code).
    """

    def __init__(self):
        self.results = []
        self.calls = []

    def _next(self, fn, kind, meta):
        self.calls.append({"kind": kind, **meta})
        if not self.results:
            raise AssertionError(f"no queued eq_principle result for {kind}")
        result = self.results.pop(0)
        return result(fn) if callable(result) else result

    def prompt_non_comparative(self, fn, task="", criteria=""):
        return self._next(fn, "non_comparative", {"task": task, "criteria": criteria})

    def prompt_comparative(self, fn, principle=""):
        return self._next(fn, "comparative", {"principle": principle})


class _Web:
    def __init__(self):
        self.pages = {}

    def render(self, url, mode="text"):
        if url in self.pages:
            return self.pages[url]
        raise RuntimeError(f"no page registered for {url}")


class _Nondet:
    def __init__(self):
        self.web = _Web()
        self.prompts = []
        self.responses = []

    def exec_prompt(self, prompt, response_format=None):
        self.prompts.append(prompt)
        if not self.responses:
            raise AssertionError("no queued exec_prompt response")
        return self.responses.pop(0)


class _Gl:
    def __init__(self):
        self.vm = _Vm()
        self.public = _Public()
        self.message = _Message()
        self.message_raw = {"datetime": "2026-01-01T00:00:00Z"}
        self.eq_principle = _EqPrinciple()
        self.nondet = _Nondet()
        self.Contract = _Contract
        self.transfers = []

    def get_contract_at(self, address):
        return _Recipient(address, self.transfers)


def install():
    """Register a fresh fake `genlayer` module and return its `gl` singleton."""
    gl = _Gl()
    module = types.ModuleType("genlayer")
    module.gl = gl
    module.Address = Address
    module.u256 = u256
    module.TreeMap = TreeMap
    module.DynArray = DynArray
    module.allow_storage = allow_storage
    module.__all__ = ["gl", "Address", "u256", "TreeMap", "DynArray", "allow_storage"]
    sys.modules["genlayer"] = module
    return gl
