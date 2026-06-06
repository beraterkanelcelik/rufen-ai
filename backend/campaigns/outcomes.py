"""Classify a call outcome from the ElevenLabs conversation status + transcript.

Heuristic for the demo. ElevenLabs' status does not cleanly expose busy/voicemail,
so we map to answered / no_answer / failed. Refine later by inspecting the
conversation ``metadata`` (termination reason / call_duration_secs) — see
docs/01-PITFALLS.md.
"""


def classify_outcome(status, transcript):
    if status == "failed":
        return "failed"
    if status in ("done", "processing"):
        return "answered" if transcript else "no_answer"
    return "failed"
