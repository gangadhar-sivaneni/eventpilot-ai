from datetime import datetime, timezone

from discovery import plan_rows

NOW = datetime(2026, 10, 18, tzinfo=timezone.utc)


def test_dedupes_counts_and_skips_invalid():
    raws = [{"url": "https://a.com/e?utm_source=x", "title": "Event A"},
            {"url": "https://a.com/e", "title": "Event A again"},  # same canonical URL
            {"url": "bad", "title": "Broken"},
            {"url": "https://a.com/old", "title": "Old event"}]
    rows, counts = plan_rows(raws, 1, {"https://a.com/old": "open"}, NOW)
    assert counts == {"fetched": 4, "invalid": 1, "imported": 1, "updated": 1}
    assert {r["url"] for r in rows} == {"https://a.com/e", "https://a.com/old"}


def test_unknown_never_overwrites_known_and_transitions_are_recorded():
    rows, _ = plan_rows([{"url": "https://a.com/x", "title": "Expo"}], 1, {"https://a.com/x": "open"}, NOW)
    assert "registration_status" not in rows[0] and "fee_status" not in rows[0] and "format" not in rows[0]
    assert "description" not in rows[0]  # nulls are dropped too
    rows, _ = plan_rows([{"url": "https://a.com/x", "title": "Expo", "registration_status": "open"}], 1, {"https://a.com/x": "upcoming"}, NOW)
    assert rows[0]["previous_registration_status"] == "upcoming" and rows[0]["status_changed_at"]
