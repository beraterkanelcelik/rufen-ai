from campaigns.outcomes import classify_outcome


def test_failed():
    assert classify_outcome("failed", []) == "failed"


def test_no_answer_empty():
    assert classify_outcome("done", []) == "no_answer"


def test_answered():
    assert classify_outcome("done", [{"role": "user", "message": "hi"}]) == "answered"


def test_processing_with_transcript_is_answered():
    assert classify_outcome("processing", [{"role": "agent", "message": "hello"}]) == "answered"


def test_unknown_status_is_failed():
    assert classify_outcome("weird", []) == "failed"
