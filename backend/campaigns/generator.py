"""Slice 4 — AI script generation (orchestration LLM).

Given a campaign goal + reason + the available contact fields, ask Claude/GPT to
draft the agent's system prompt, first message, and a typed extraction schema.
Provider switches on ORCHESTRATOR_PROVIDER (anthropic | openai).
"""
import json
import os

SYSTEM = (
    "You design an outbound phone-call script for an AI voice agent. "
    "Given a campaign GOAL, REASON, and the available customer FIELDS, return "
    "STRICT JSON with exactly these keys: "
    '{"script_prompt": str, "first_message": str, '
    '"extraction_schema": [{"key": str, "type": "string|boolean|number|date", "desc": str}]}. '
    "The agent calls on behalf of the company. Reference customer fields with DOUBLE "
    "curly braces EXACTLY like {{name}}, {{context}} and {{phone}} — this is "
    "ElevenLabs' dynamic-variable syntax; never use single braces. "
    "IMPORTANT: the agent is calling the customer, so it ALREADY knows their phone "
    "number as {{phone}}. NEVER ask the customer to read out or provide their phone "
    "number. If a contact number must be confirmed (e.g. for the appointment "
    "confirmation), ask whether to use this number, {{phone}}, or a different one. "
    "Keep calls under 90 seconds; be polite; clearly identify as an AI assistant. "
    "Return ONLY the JSON object, no prose."
)

ALLOWED_TYPES = {"string", "boolean", "number", "date"}


def _parse(txt: str) -> dict:
    """Extract + validate the JSON object from a (possibly fenced/noisy) reply."""
    start, end = txt.find("{"), txt.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("no JSON object in model output")
    data = json.loads(txt[start:end + 1])

    out = {
        "script_prompt": str(data.get("script_prompt", "")).strip(),
        "first_message": str(data.get("first_message", "")).strip(),
        "extraction_schema": [],
    }
    for item in data.get("extraction_schema") or []:
        key = (item.get("key") or "").strip()
        if not key:
            continue
        t = (item.get("type") or "string").strip().lower()
        if t not in ALLOWED_TYPES:
            t = "string"
        out["extraction_schema"].append({
            "key": key, "type": t,
            "desc": (item.get("desc") or item.get("description") or "").strip(),
        })
    return out


def generate_script(goal, reason, fields=("name", "context")) -> dict:
    provider = os.environ.get("ORCHESTRATOR_PROVIDER", "anthropic")
    user = f"GOAL: {goal}\nREASON: {reason}\nFIELDS: {', '.join(fields)}"

    if provider == "openai":
        from openai import OpenAI

        model = os.environ.get("ORCHESTRATOR_MODEL", "gpt-4o-mini")
        txt = OpenAI().chat.completions.create(
            model=model,
            messages=[{"role": "system", "content": SYSTEM},
                      {"role": "user", "content": user}],
            response_format={"type": "json_object"},
        ).choices[0].message.content
    else:
        import anthropic

        model = os.environ.get("ORCHESTRATOR_MODEL", "claude-haiku-4-5-20251001")
        txt = anthropic.Anthropic().messages.create(
            model=model, max_tokens=1200, system=SYSTEM,
            messages=[{"role": "user", "content": user}],
        ).content[0].text

    data = _parse(txt)
    # Guarantee the agent actually has the number: {{phone}} is only injected
    # where it appears in the script, so bind it explicitly if the LLM omitted it.
    if "{{phone}}" not in data["script_prompt"]:
        data["script_prompt"] += (
            " The customer's phone number on file is {{phone}} — you already have it, "
            "so never ask them to read it out. If a contact number is needed, offer to "
            "use this number ({{phone}}) or ask whether they'd prefer a different one."
        )
    return data
