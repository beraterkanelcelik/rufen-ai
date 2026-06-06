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
    "You are an operations analyst for an outbound AI calling campaign. You are given "
    "per-contact outcomes, extracted fields, and short call transcripts. Produce, in "
    "PLAIN TEXT and EXACTLY these three labelled sections:\n"
    "Summary: a 2-3 sentence overview of how the campaign went.\n"
    "Sentiment: one line starting with the overall mood as 'Positive', 'Mixed', "
    "'Negative', or 'Neutral', then 1-2 sentences on how customers reacted to the "
    "outreach — were they receptive, annoyed, hesitant, appreciative? Note roughly "
    "how many sounded positive vs negative and cite the most common reaction.\n"
    "Insights: 3-5 '- ' bullet lines with specific, actionable next steps (who to "
    "follow up, common objections, booking patterns).\n"
    "Be concise and concrete. Base sentiment ONLY on what customers actually said."
)


def _transcript_snippet(contact, max_turns: int = 8, max_chars: int = 600) -> str:
    """Compact text of the latest attempt so the model can judge sentiment without
    being flooded. Returns '' when there's nothing said yet."""
    att = contact.call_attempts.order_by("-attempt_no").first()
    if not att or not att.transcript:
        return ""
    lines = []
    for t in att.transcript[-max_turns:]:
        raw = (t.get("role") or "").lower()
        who = "Customer" if raw in ("user", "callee") else "Agent"
        text = (t.get("text") or t.get("message") or "").strip()
        if text:
            lines.append(f"  {who}: {text}")
    return ("\n".join(lines))[:max_chars]


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
        row = (
            f"- {c.name}: status={c.status}, outcome={c.last_outcome or '-'}, "
            f"result={c.result or {}}"
        )
        snippet = _transcript_snippet(c)
        if snippet:
            row += f"\n  transcript:\n{snippet}"
        rows.append(row)
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
        max_tokens=800,
    )
    return resp.choices[0].message.content.strip()
