"""Direct-mode suite: the contract's real Python running on gltest's mocked
GenVM host, so storage encoding, `u256`/`Address` semantics and the schema all
behave as they will on chain.

Its reach stops at `draft_sow`. The mock host implements `ExecPrompt` and
`WebRender` but has no handler for the `ExecPromptTemplate` request that
`gl.eq_principle.prompt_comparative` / `prompt_non_comparative` issue
internally, so both primitives resolve to `None` here regardless of any
registered mock - which makes every method downstream of the Statement of Work
unreachable in this suite.

The rest of the state machine (signing, delivery, adjudication, disputes,
settlement, change orders) is covered in tests/unit, which runs the same
contract source against an in-process host with the model's answer injected;
the LLM-decided outcomes themselves are covered in tests/integration, which
needs a real network. See docs/ARCHITECTURE.md.
"""
