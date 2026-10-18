from notify import digest


def test_digest_puts_deadlines_first_and_links_back():
    body = digest([
        {"alert_type": "new_event", "message": "New match: A", "event_id": 1, "events": {"url": "https://a.com"}},
        {"alert_type": "deadline_reminder", "message": "B closes soon", "event_id": 2, "events": None},
    ], "https://site.example")
    assert body.index("B closes soon") < body.index("New match: A")
    assert "https://site.example/events/1" in body and "Official page: https://a.com" in body
    assert "https://site.example/profile" in body  # opt-out link
