from datetime import datetime, timezone

from discovery import expired_event_ids, in_catalogue_scope, plan_rows

NOW = datetime(2026, 10, 18, tzinfo=timezone.utc)


def test_scope_requires_technology_subject_not_just_conference_format():
    assert in_catalogue_scope({"title": "International Conference on Nonlocal Mechanics", "city": "Hyderabad", "country": "India"})
    assert not in_catalogue_scope({"title": "International Conference on Art History", "city": "Hyderabad", "country": "India"})
    assert not in_catalogue_scope({"title": "IIT Hyderabad Half Marathon 2026", "description": "Running event at a technology campus", "city": "Hyderabad", "country": "India"})


def test_dedupes_counts_and_skips_invalid():
    raws = [{"url": "https://a.com/e?utm_source=x", "title": "AI Hackathon A", "format": "online", "starts_at": "2026-10-20"},
            {"url": "https://a.com/e", "title": "AI Hackathon A again", "format": "online", "starts_at": "2026-10-20"},  # same canonical URL
            {"url": "bad", "title": "Broken"},
            {"url": "https://a.com/old", "title": "AI Hackathon Old", "format": "online", "starts_at": "2026-10-20"}]
    rows, counts = plan_rows(raws, 1, {"https://a.com/old": "open"}, NOW)
    assert counts == {"fetched": 4, "out_of_scope": 1, "invalid": 0, "imported": 1, "updated": 1, "unchanged": 0}
    assert {r["url"] for r in rows} == {"https://a.com/e", "https://a.com/old"}


def test_unknown_never_overwrites_known_and_transitions_are_recorded():
    rows, _ = plan_rows([{"url": "https://a.com/x", "title": "AI Hackathon Expo", "city": "Hyderabad", "country": "India", "starts_at": "2026-11-01"}], 1, {"https://a.com/x": "open"}, NOW)
    assert "registration_status" not in rows[0] and "fee_status" not in rows[0] and "format" not in rows[0]
    assert "description" not in rows[0]  # nulls are dropped too
    rows, _ = plan_rows([{"url": "https://a.com/x", "title": "AI Hackathon Expo", "format": "online", "starts_at": "2026-11-01", "registration_status": "open"}], 1, {"https://a.com/x": "upcoming"}, NOW)
    assert rows[0]["previous_registration_status"] == "upcoming" and rows[0]["status_changed_at"]


def test_unchanged_event_facts_are_detected_without_check_timestamps():
    raw = {"url": "https://a.com/x", "title": "AI Hackathon Expo", "format": "online", "starts_at": "2026-11-01"}
    first, _ = plan_rows([raw], 1, {}, NOW)
    old = dict(first[0], last_checked_at="2026-10-18T00:00:00+00:00", quality_verified_at="2026-10-18T00:00:00+00:00")
    rows, counts = plan_rows([raw], 1, {"https://a.com/x": old}, NOW)
    assert counts["imported"] == 0 and counts["updated"] == 0 and counts["unchanged"] == 1


def test_expired_cleanup_uses_event_end_not_registration_deadline():
    expired = [
        {"id": 1, "starts_at": "2026-10-01T00:00:00+00:00", "ends_at": "2026-10-02T00:00:00+00:00"},
        {"id": 2, "starts_at": "2026-10-01T00:00:00+00:00", "ends_at": None},
    ]
    ongoing = [
        {"id": 3, "starts_at": "2026-10-23T00:00:00+00:00", "ends_at": "2026-10-25T00:00:00+00:00"},
        {"id": 4, "starts_at": "2026-10-25T00:00:00+00:00", "ends_at": None},
        {"id": 5, "starts_at": None, "ends_at": None},
    ]
    assert expired_event_ids(expired + ongoing, NOW) == [1, 2]
