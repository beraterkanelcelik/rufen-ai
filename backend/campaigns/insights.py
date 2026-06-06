"""Campaign summaries + insights via a LOCAL Qwen model (Ollama, OpenAI-compatible
API). Kept separate from the in-call LLM (Claude) and the script generator —
this runs on the operator's machine so we use Qwen for the analytics layer.

Env:
  QWEN_BASE_URL  default http://host.docker.internal:11434/v1  (host Ollama)
  QWEN_MODEL     default qwen2.5:3b
  QWEN_API_KEY   default "ollama" (Ollama ignores it)
"""
import os

from openai import OpenAI

TERMINAL = ("completed", "failed", "exhausted")

SYSTEM = (
    "You are an operations analyst for an outbound AI calling campaign. Given the "
    "per-contact outcomes and extracted fields, write: a 2-3 sentence SUMMARY, then "
    "3-5 short, specific, actionable INSIGHTS / next steps for the operator (e.g. "
    "who to follow up, common objections, booking patterns). Plain text only: a "
    "'Summary:' paragraph followed by '- ' bullet lines. Be concise and concrete."
)


def _client():
    return OpenAI(
        base_url=os.environ.get("QWEN_BASE_URL", "http://host.docker.internal:11434/v1"),
        api_key=os.environ.get("QWEN_API_KEY", "ollama"),
    )


def generate_insights(campaign) -> str:
    contacts = list(campaign.contacts.all().order_by("id"))
    counts: dict[str, int] = {}
    rows = []
    for c in contacts:
        counts[c.status] = counts.get(c.status, 0) + 1
        rows.append(
            f"- {c.name}: status={c.status}, outcome={c.last_outcome or '-'}, "
            f"result={c.result or {}}"
        )
    finished = sum(counts.get(s, 0) for s in TERMINAL)
    success = counts.get("completed", 0)
    user = (
        f"Campaign: {campaign.name}\n"
        f"Goal: {campaign.goal}\n"
        f"Reason: {campaign.reason}\n"
        f"Totals: {len(contacts)} contacts, {finished} finished, "
        f"{success} completed. Status counts: {counts}\n\n"
        f"Per-contact:\n" + "\n".join(rows)
    )
    model = os.environ.get("QWEN_MODEL", "qwen2.5:3b")
    resp = _client().chat.completions.create(
        model=model,
        messages=[{"role": "system", "content": SYSTEM},
                  {"role": "user", "content": user}],
        temperature=0.4,
        max_tokens=600,
    )
    return resp.choices[0].message.content.strip()
