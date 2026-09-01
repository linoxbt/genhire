"""Parsing untrusted input: schedules from users, JSON from a model.

LLM output is never fully controllable even under a format instruction, so
every parser here has to be lenient about shape and strict about meaning -
and must fail closed rather than guess when the answer decides who gets paid.
"""
import json

import pytest


# -- money -------------------------------------------------------------

@pytest.mark.parametrize("value,expected", [("0", 0), ("1000", 1000), (1000, 1000), ("  42  ", 42)])
def test_wei_accepts_decimal_strings_and_ints(h, value, expected):
    assert h.module._wei(value, "amount") == expected


def test_wei_survives_amounts_a_float_would_round(h):
    huge = "123456789012345678901234567890"
    assert h.module._wei(huge, "amount") == int(huge)


@pytest.mark.parametrize("bad", ["", "1.5", "-5", "1e18", "0x10", True, None, [], "1 000"])
def test_wei_rejects_anything_ambiguous(h, UserError, bad):
    with pytest.raises(UserError):
        h.module._wei(bad, "amount")


# -- schedules ---------------------------------------------------------

def test_a_schedule_normalises_to_pending_milestones(h):
    parsed = h.module._parse_milestones(json.dumps([{"title": "Design", "amount": "100"}]), "s")
    assert parsed[0]["status"] == "pending"
    assert parsed[0]["criteria"] == []      # criteria are the contract's to write, not the caller's
    assert parsed[0]["pct"] == 0
    assert parsed[0]["paid"] == "0"


def test_a_schedule_ignores_caller_supplied_criteria(h):
    """A caller must not be able to pre-write the criteria they will be judged on."""
    raw = json.dumps([{"title": "Design", "amount": "100", "criteria": ["anything I say goes"]}])
    assert h.module._parse_milestones(raw, "s")[0]["criteria"] == []


@pytest.mark.parametrize(
    "raw,message",
    [
        ("", "must not be empty"),
        ("not json", "not valid JSON"),
        ("{}", "non-empty JSON array"),
        ("[]", "non-empty JSON array"),
        ('[{"amount": "1"}]', "needs a title"),
        ('[{"title": "x"}]', "decimal string amount"),
        ('[{"title": "  ", "amount": "1"}]', "needs a title"),
        ('["just a string"]', "must be a JSON object"),
    ],
)
def test_malformed_schedules_are_rejected(h, UserError, raw, message):
    with pytest.raises(UserError, match=message):
        h.module._parse_milestones(raw, "milestones_json")


def test_schedule_totals(h):
    parsed = h.module._parse_milestones(json.dumps([
        {"title": "a", "amount": "600"}, {"title": "b", "amount": "400"}
    ]), "s")
    assert h.module._milestones_total(parsed) == 1000


# -- percentages -------------------------------------------------------

@pytest.mark.parametrize(
    "value,expected",
    [(75, 75), (0, 0), (100, 100), ("75", 75), ("75%", 75), (75.6, 75),
     (150, 100), (-20, 0), (True, 100), (False, 0), ("about 40 percent", 40)],
)
def test_percentages_are_clamped_not_rejected(h, value, expected):
    assert h.module._coerce_pct(value) == expected


@pytest.mark.parametrize("bad", ["high", None, {}, []])
def test_an_uninterpretable_percentage_fails_closed(h, UserError, bad):
    with pytest.raises(UserError):
        h.module._coerce_pct(bad)


# -- JSON out of a model -----------------------------------------------

@pytest.mark.parametrize(
    "raw",
    [
        '{"ruling": "IN_SCOPE", "reasoning": "covered"}',
        'Sure! Here you go:\n{"ruling": "IN_SCOPE", "reasoning": "covered"}\nHope that helps.',
        '```json\n{"ruling": "IN_SCOPE", "reasoning": "covered"}\n```',
        '{"ruling": "IN_SCOPE", "reasoning": "covered",}',   # trailing comma
    ],
)
def test_json_is_recovered_from_the_shapes_models_actually_emit(h, raw):
    assert h.module._parse_scope_verdict(raw)["ruling"] == "IN_SCOPE"


@pytest.mark.parametrize("raw", ["", "no json here", None, "{unclosed", '{"ruling": "IN_SCOPE"}'])
def test_unusable_model_output_fails_closed(h, UserError, raw):
    with pytest.raises(UserError):
        h.module._parse_scope_verdict(raw)


@pytest.mark.parametrize(
    "value,expected",
    [("IN_SCOPE", "IN_SCOPE"), ("in scope", "IN_SCOPE"), ("in-scope", "IN_SCOPE"),
     ("OUT_OF_SCOPE", "OUT_OF_SCOPE"), ("out of scope", "OUT_OF_SCOPE"), ("excluded", "OUT_OF_SCOPE")],
)
def test_scope_rulings_are_normalised(h, value, expected):
    raw = json.dumps({"ruling": value, "reasoning": "because"})
    assert h.module._parse_scope_verdict(raw)["ruling"] == expected


@pytest.mark.parametrize("value", ["MAYBE", "PARTIALLY", "unclear", ""])
def test_an_unrecognised_scope_ruling_is_never_guessed_at(h, UserError, value):
    """This answer decides whether the freelancer owes the work for free."""
    raw = json.dumps({"ruling": value, "reasoning": "because"})
    with pytest.raises(UserError, match="not IN_SCOPE or OUT_OF_SCOPE"):
        h.module._parse_scope_verdict(raw)


def test_a_milestone_verdict_keeps_its_criterion_breakdown(h):
    raw = json.dumps({
        "completion_pct": 70,
        "reasoning": "Two of three criteria met",
        "criteria": [
            {"criterion": "cart renders", "met": True, "note": "verified"},
            {"criterion": "payment works", "met": "no", "note": "missing"},
        ],
    })
    verdict = h.module._parse_milestone_verdict(raw)
    assert verdict["completion_pct"] == 70
    assert [c["met"] for c in verdict["criteria"]] == [True, False]


@pytest.mark.parametrize("key", ["completion", "pct", "percent", "score"])
def test_a_milestone_verdict_accepts_the_usual_key_aliases(h, key):
    raw = json.dumps({key: 60, "reasoning": "partly done"})
    assert h.module._parse_milestone_verdict(raw)["completion_pct"] == 60


def test_a_milestone_verdict_without_reasoning_is_rejected(h, UserError):
    with pytest.raises(UserError, match="missing its reasoning"):
        h.module._parse_milestone_verdict(json.dumps({"completion_pct": 60}))


def test_reasoning_is_length_capped(h):
    raw = json.dumps({"completion_pct": 50, "reasoning": "x" * 5000})
    assert len(h.module._parse_milestone_verdict(raw)["reasoning"]) == h.module.MAX_REASON_CHARS


def test_a_drafted_sow_normalises_its_lists(h):
    raw = json.dumps({
        "scope": "Build it",
        "assumptions": "a single string, not a list",
        "milestones": [{"acceptance_criteria": ["one", "  ", "two"]}],
    })
    sow = h.module._parse_sow(raw)
    assert sow["assumptions"] == ["a single string, not a list"]
    assert sow["exclusions"] == []
    assert sow["milestones"][0]["criteria"] == ["one", "two"]
