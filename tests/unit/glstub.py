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
            return
        if isinstance(value, bytes):
            raw = value
        else:
            text = str(value)
            if text.startswith("0x") or text.startswith("0X"):
                text = text[2:]
            try:
                raw = bytes.fromhex(text)
            except ValueError:
                raise Exception(f"invalid address {value}")
        # The real SDK rejects anything that is not exactly 20 bytes. Accepting
        # short or malformed input here would hide a class of bug the chain
        # catches - notably Address(...) applied to a value read back out of
        # stored JSON.
        if len(raw) != 20:
            raise Exception(f"invalid address {value}")
        self._hex = "0x" + raw.hex()

    @property
    def as_hex(self) -> str:
        """Lowercase, where the real SDK returns an EIP-55 checksummed string.

        The contract only ever compares `as_hex` against a stored `as_hex`, so
        it is self-consistent either way - but a test asserting a literal
        address string is asserting this stub's casing, not the chain's. The
        direct suite, which uses the real SDK, is what covers that.
        """
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


MAX_U256 = 2**256 - 1


class u256(int):
    """A 32-byte unsigned integer, range-checked at construction.

    The real `u256` is `typing.NewType('u256', int)` - at runtime it is the
    identity function and checks nothing. The range is enforced later, by the
    storage encoder, which calls `int.to_bytes(32, signed=False)` and raises
    `OverflowError` on a negative or oversized value at *write* time.

    Checking here is deliberately stricter and earlier: it catches the same bugs
    with a clearer stack, at the point the bad value is produced rather than
    whenever it happens to be persisted. What it must not do is under-check, so
    both bounds are enforced, matching the encoder.
    """

    def __new__(cls, value=0):
        number = int(value)
        if number < 0:
            raise AssertionError(f"u256 underflow: {number} (encoder would raise OverflowError)")
        if number > MAX_U256:
            raise AssertionError(f"u256 overflow: {number} (encoder would raise OverflowError)")
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


class InsufficientBalance(AssertionError):
    """The contract tried to pay out more than it holds."""


class _ExternalRecipient:
    """An EOA reached through the EVM contract-interface shape.

    Models the real constraint rather than a convenient approximation: an
    external message always executes on finalization, so the real API accepts
    no `on` argument. Passing one is a bug, and the stub says so instead of
    silently swallowing it.
    """

    def __init__(self, address, gl):
        self._address = address
        self._gl = gl

    def emit_transfer(self, value, **kwargs):
        if kwargs:
            raise TypeError(
                f"external emit_transfer takes no {list(kwargs)} - external messages "
                f"always execute on finalization"
            )
        amount = int(value)
        if amount <= 0:
            raise ValueError("value must be greater than 0 for emit_transfer")
        # Debited on emit, exactly as the real chain does.
        if amount > self._gl.balance:
            raise InsufficientBalance(
                f"contract tried to send {amount} wei holding only {self._gl.balance}"
            )
        self._gl.balance -= amount
        self._gl.transfers.append({"to": self._address, "value": amount, "on": "finalized"})


class _InternalContract:
    """The IC -> IC form, which is NOT how an EOA is paid.

    `gl.get_contract_at(addr).emit_transfer(...)` addresses another Intelligent
    Contract. Sending that to a plain account has no receiver, and the value is
    debited on emit and not returned if the child transaction fails - escrow
    stranded rather than reverted. That defect shipped here once; the stub now
    refuses it so a future edit cannot quietly reintroduce it.
    """

    def __init__(self, address):
        self._address = address

    def emit_transfer(self, value, on="finalized"):
        raise AssertionError(
            "gl.get_contract_at(...).emit_transfer() is the internal IC->IC form and "
            "cannot pay an EOA. Use the @gl.evm.contract_interface recipient instead."
        )

    def emit(self, **kwargs):
        raise AssertionError("internal messages are not used by this contract")


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

    def strict_eq(self, fn):
        """Unlike the prompt principles there is no model here, so the leader
        body is simply run. Tests get the real `_fetch_evidence` - its
        budgeting, its truncation and its all-sources-failed guard - rather than
        a queued stand-in."""
        self.calls.append({"kind": "strict_eq"})
        return fn()


class _Web:
    def __init__(self):
        self.pages = {}
        # Counts every render attempt. Adjudication must never fetch: it reads
        # the snapshot stored at submission, and a test asserts this does not
        # move across a ruling.
        self.fetches = 0

    def render(self, url, mode="text"):
        self.fetches += 1
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


class _Evm:
    """Stands in for `gl.evm`. `contract_interface` turns a marker class into a
    factory: call it with an Address to get something you can emit to."""

    def __init__(self, gl):
        self._gl = gl

    def contract_interface(self, _declaration):
        gl = self._gl

        def factory(address):
            return _ExternalRecipient(address, gl)

        return factory


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
        # A real balance, not just a log. Without it nothing could detect the
        # contract paying out more than it was ever funded - the one invariant
        # an escrow must never break.
        self.balance = 0
        self.evm = _Evm(self)

    def get_contract_at(self, address):
        return _InternalContract(address)


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
