"""TDD the generator's JSON parsing/normalization (no live LLM call)."""
import pytest

from campaigns.generator import _parse


def test_parse_clean_json():
    txt = ('{"script_prompt":"Call {name}","first_message":"Hi {name}",'
           '"extraction_schema":[{"key":"agreed","type":"boolean","desc":"Agreed?"}]}')
    out = _parse(txt)
    assert out["script_prompt"] == "Call {name}"
    assert out["first_message"] == "Hi {name}"
    assert out["extraction_schema"] == [{"key": "agreed", "type": "boolean", "desc": "Agreed?"}]


def test_parse_fenced_and_noisy():
    txt = ('Here you go!\n```json\n{"script_prompt":"P","first_message":"F",'
           '"extraction_schema":[{"key":"x","type":"weird","desc":"d"}]}\n```\nThanks')
    out = _parse(txt)
    assert out["script_prompt"] == "P"
    # unknown type coerced to string
    assert out["extraction_schema"][0]["type"] == "string"


def test_parse_accepts_description_alias_and_drops_keyless():
    txt = ('{"script_prompt":"P","first_message":"F","extraction_schema":'
           '[{"key":"","type":"string","desc":"skip me"},'
           '{"key":"note","type":"string","description":"aliased desc"}]}')
    out = _parse(txt)
    assert len(out["extraction_schema"]) == 1
    assert out["extraction_schema"][0] == {"key": "note", "type": "string", "desc": "aliased desc"}


def test_parse_raises_without_json():
    with pytest.raises(ValueError):
        _parse("no json here")
