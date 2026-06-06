"""Classify a call outcome from the ElevenLabs conversation status + transcript.

Heuristic for the demo. ElevenLabs' status does not cleanly expose busy/voicemail,
so we map to answered / no_answer / failed. Refine later by inspecting the
conversation ``metadata`` (termination reason / call_duration_secs) — see
docs/01-PITFALLS.md.
"""


def classify_outcome(status, transcript):
    if status == "failed":
        return "failed"
    # Terminal + non-terminal "live" statuses all classify off transcript presence.
    # In the real flow the activity only calls this at a terminal status, but
    # handling initiated/in-progress keeps the classifier robust if called early.
    if status in ("done", "processing", "in-progress", "initiated"):
        return "answered" if transcript else "no_answer"
    return "failed"
