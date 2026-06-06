from calls.poller import diff_new_turns


def test_diff_returns_all_when_none_seen():
    turns = [{"role": "agent", "message": "hi"}, {"role": "user", "message": "yes"}]
    new, seen = diff_new_turns(turns, 0)
    assert [t["message"] for t in new] == ["hi", "yes"] and seen == 2


def test_diff_returns_only_tail():
    turns = [{"role": "agent", "message": "hi"}, {"role": "user", "message": "yes"}]
    new, seen = diff_new_turns(turns, 1)
    assert [t["message"] for t in new] == ["yes"] and seen == 2
