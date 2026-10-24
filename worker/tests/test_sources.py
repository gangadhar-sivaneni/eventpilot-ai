"""Source parsers against trimmed real responses (captured 2026-10-18)."""
from datetime import datetime

from bs4 import BeautifulSoup
from scrapers import college_rss, devfolio, devpost, hackerearth, iit_hyd, mlh, unstop


def test_devpost_parse_does_not_promote_submission_dates_to_event_dates():
    row = devpost.parse({"id": 30992, "title": "Build, Ship, Shape", "url": "https://amazonappdev2026.devpost.com/",
                         "displayed_location": {"location": "Online"}, "open_state": "open",
                         "submission_period_dates": "Nov 01 - Nov 23, 2026", "themes": [{"name": "Machine Learning/AI"}],
                         "prize_amount": "$<span data-currency-value>138,000</span>", "prizes_counts": {"cash": 1},
                         "organization_name": "Amazon", "invite_only": False})
    assert row["prize_text"] == "$138,000" and row["format"] == "online"
    assert row["starts_at"] is None and row["ends_at"] is None
    assert row["registration_deadline"] is None
    assert row["registration_status"] == "open"
    dated = devpost.parse({"id": 30992, "title": "Build, Ship, Shape", "url": "https://amazonappdev2026.devpost.com/",
                           "event_start_date": "2026-11-01", "event_end_date": "2026-11-02",
                           "submission_period_dates": "Nov 01 - Nov 23, 2026"})
    assert dated["starts_at"] == "2026-11-01" and dated["ends_at"] == "2026-11-02"
    assert devpost.parse({"invite_only": True}) is None


def test_unstop_parse_marks_college_and_free():
    row = unstop.parse({"id": 1771785, "title": "Hack Era 2.0", "seo_url": "https://unstop.com/hackathons/hack-era-20-erazone-1771785",
                        "region": "online", "organisation": {"name": "Gokaraju Rangaraju Institute of Engineering and Technology"},
                        "isPaid": False, "regn_open": 1, "subtype": "online_coding_challenge",
                        "prizes": [{"cash": 5000, "currency": "fa-rupee"}, {"cash": None, "currency": "fa-rupee"}],
                        "regnRequirements": {"start_regn_dt": "2026-10-18T00:00:00+05:30", "end_regn_dt": "2026-12-01T00:01:00+05:30"},
                        "workfunction": [{"name": "Software Development"}]}, "hackathons")
    assert row["prize_text"] == "₹5,000" and row["fee_status"] == "free" and row["registration_status"] == "open"
    assert "college" in row["categories"] and "hackathon" in row["categories"]


def test_unstop_does_not_use_registration_deadline_as_event_date():
    row = unstop.parse({
        "id": 1771785,
        "title": "Hack Era 2.0",
        "seo_url": "https://unstop.com/hackathons/hack-era-20-erazone-1771785",
        "region": "online",
        "organisation": {"name": "College"},
        "regnRequirements": {"end_regn_dt": "2026-12-01"},
    }, "hackathons")
    assert row["starts_at"] is None
    assert row["ends_at"] is None
    assert row["registration_deadline"].startswith("2026-12-01")


def test_devfolio_prize_needs_money():
    base = {"uuid": "u1", "slug": "arkiv", "name": "Arkiv", "is_online": True, "themes": [], "hackathon_setting": {}}
    assert devfolio.parse({**base, "prizes": [{"desc": "Swag"}, {"desc": "Devcon ticket + $2,000 USDC"}]})["prize_text"] == "Devcon ticket + $2,000 USDC"
    assert devfolio.parse({**base, "prizes": [{"desc": "Goodies"}]})["prize_text"] is None
    assert devfolio.parse({**base, "prizes": None})["url"] == "https://arkiv.devfolio.co/"


def test_hackerearth_and_mlh():
    he = hackerearth.parse({"title": "Agentic Banking Hackathon", "url": "https://www.hackerearth.com/challenges/hackathon/x/",
                            "status": "UPCOMING", "college": True, "start_utc_tz": "2026-10-05 14:30:00+00:00"})
    assert he["registration_status"] == "upcoming" and "college" in he["categories"]
    html = '<div><script data-page="app" type="application/json">{"props":{"upcomingEvents":[{"id":"e1","name":"SwampHacks","url":"/events/s","websiteUrl":"https://swamphacks.com/","formatType":"physical","venueAddress":{"city":"Gainesville","country":"US"}}]}}</script></div>'
    row = mlh.parse(mlh.extract(html)[0])
    assert row["format"] == "in_person" and row["url"] == "https://swamphacks.com/"
    assert mlh.season(datetime(2026, 10, 18)) == 2027 and mlh.season(datetime(2027, 3, 1)) == 2027


def test_college_rss_keeps_only_event_posts():
    keep = college_rss.parse({"title": "National Level Hackathon 2026 - Registrations Open", "link": "https://mlrit.ac.in/h/"},
                             "MLRIT", "Hyderabad", "India")
    assert keep["organizer"] == "MLRIT" and "college" in keep["categories"]
    assert college_rss.parse({"title": "Placement results announced", "link": "https://mlrit.ac.in/p/"}, "MLRIT", "Hyderabad", "India") is None


def test_iit_hyderabad_calendar_uses_its_published_event_date():
    html = '''<article><h3><a href="https://iith.ac.in/events/2026/12/14/nmamld-2026/">
      International Conference on Nonlocal Mechanics Approaches</a></h3>
      <p>14 Dec 2026</p><p>Conference on computational mechanics at IIT Hyderabad.</p></article>'''
    row = iit_hyd.parse(BeautifulSoup(html, "html.parser").article)
    assert row["starts_at"] == "2026-12-14T00:00:00+05:30"
    assert row["url"] == "https://iith.ac.in/events/2026/12/14/nmamld-2026/"
    assert "registration_deadline" not in row
    assert row["organizer"] == "IIT Hyderabad" and row["city"] == "Hyderabad"
    assert iit_hyd.parse(BeautifulSoup('<article><h3><a href="https://iith.ac.in/e/">Undated conference</a></h3></article>', "html.parser").article) is None

    nontechnical = BeautifulSoup('''<article><h3><a href="https://iithydrunnersclub.com/">
      Register for IIT Hyderabad Half Marathon 2026 - running at a technology campus</a></h3>
      <p>22 Nov 2026</p></article>''', "html.parser").article
    assert iit_hyd.parse(nontechnical)["title"] == "Register for IIT Hyderabad Half Marathon 2026"
