from datetime import datetime, timezone

from normalize import canonical_url, fee, normalize, registration_status, to_utc, validate_platform_url

NOW = datetime(2026, 10, 18, 12, tzinfo=timezone.utc)


def test_canonical_url_strips_tracking_fragment_and_trailing_slash():
    assert canonical_url("HTTPS://Example.COM/Event/?utm_source=x&id=7#top") == "https://example.com/Event?id=7"
    assert canonical_url("//devpost.com/") == "https://devpost.com/"
    assert canonical_url("javascript:alert(1)") is None
    assert canonical_url("ftp://example.com/x") is None
    assert canonical_url(None) is None


def test_validate_platform_url_protects_against_fake_unstop_slugs():
    # Authentic Unstop URLs with numeric IDs pass
    u1, err1 = validate_platform_url("https://unstop.com/competitions/code-jam-2026-1771928")
    assert err1 is None and u1 == "https://unstop.com/competitions/code-jam-2026-1771928"

    u2, err2 = validate_platform_url("https://unstop.com/o/1771928")
    assert err2 is None and u2 == "https://unstop.com/o/1771928"

    # Guess/fabricated Unstop slugs without numeric IDs are rejected
    u3, err3 = validate_platform_url("https://unstop.com/competitions/acumen-vasavi-2026")
    assert u3 is None and "missing numeric id" in err3

    u4, err4 = validate_platform_url("https://unstop.com/hackathons/some-college-fest")
    assert u4 is None and "missing numeric id" in err4

    # Authentic external portals pass untouched
    u5, err5 = validate_platform_url("https://vce.ac.in/acumen")
    assert err5 is None and u5 == "https://vce.ac.in/acumen"


def test_dates_become_utc_and_date_only_deadlines_end_of_day():
    assert to_utc("2026-10-05 20:00:00+05:30") == "2026-10-05T14:30:00+00:00"
    assert to_utc("Oct 23, 2026", end_of_day=True) == "2026-10-23T23:59:59+00:00"
    assert to_utc("2026-10-23") == "2026-10-23T00:00:00+00:00"
    assert to_utc("not a date") is None
    assert to_utc("3026-01-01") is None


def test_unknown_fee_is_never_free():
    assert fee(None, None, None) == ("unknown", None, None)
    assert fee("free", 50, "INR") == ("free", 0.0, None)
    assert fee(None, "499", "inr") == ("paid", 499.0, "INR")  # a listed positive fee means paid
    assert fee("paid", -3, "rupees") == ("paid", None, None)


def test_registration_status_rules():
    assert registration_status("open", None, None, NOW) == "open"
    assert registration_status("open", None, "2026-10-01T00:00:00+00:00", NOW) == "closed"  # passed deadline wins
    assert registration_status(None, "2026-11-01T00:00:00+00:00", "2026-12-01T00:00:00+00:00", NOW) == "upcoming"
    assert registration_status(None, "2026-10-01T00:00:00+00:00", "2026-12-01T00:00:00+00:00", NOW) == "open"
    assert registration_status(None, None, "2026-12-01T00:00:00+00:00", NOW) == "unknown"  # no guessing
    # Past ends_at forces closed even if listing claims open
    assert registration_status("open", None, None, NOW, ends="2026-10-15T00:00:00+00:00") == "closed"


def test_normalize_rejects_invalid_and_cleans_valid():
    assert normalize({"url": "nope", "title": "x"}, NOW) == (None, "invalid url")
    assert normalize({"url": "https://a.com", "title": " "}, NOW) == (None, "missing title")
    # Fabricated unstop slug rejected by normalize
    row_fake, err_fake = normalize({"url": "https://unstop.com/competitions/acumen-vasavi-2026", "title": "Acumen"}, NOW)
    assert row_fake is None and "missing numeric id" in err_fake

    # An event date must not be copied into the registration deadline.
    row_future, err_future = normalize({
        "url": "https://vce.ac.in/acumen",
        "title": "Acumen 2026 - Vasavi",
        "starts_at": "2026-11-18",
        "format": "in_person"
    }, NOW)
    assert err_future is None
    assert row_future["registration_deadline"] is None
    assert row_future["registration_status"] == "unknown"

    row, err = normalize({"url": "https://a.com/e/", "title": "  <b>Big</b>   Hack ", "format": "Offline",
                          "categories": ["AI", "ai", None, " Web "], "starts_at": "2026-11-02", "ends_at": "2026-11-01"}, NOW)
    assert err is None
    assert row["url"] == "https://a.com/e" and row["title"] == "Big Hack" and row["format"] == "in_person"
    assert row["categories"] == ["ai", "web"]
    assert row["fee_status"] == "unknown" and row["ends_at"] is None  # impossible end date dropped


def test_registration_deadline_is_never_used_as_event_start_or_lifetime():
    missing_start, missing_reason = normalize({
        "url": "https://example.com/event",
        "title": "A real technology event",
        "registration_deadline": "2026-11-30",
    }, NOW)
    assert missing_start is None and missing_reason == "missing event start date"

    completed, completed_reason = normalize({
        "url": "https://example.com/event",
        "title": "A real technology event",
        "starts_at": "2026-10-10",
        "registration_deadline": "2026-11-30",
    }, NOW)
    assert completed is None and completed_reason == "event has already ended"
