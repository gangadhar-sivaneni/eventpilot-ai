"""HackerEarth public challenge feed (company-sponsored hackathons and contests)."""
from net import fetch as http

KEY = "hackerearth"
ALLOWED_HOSTS = {"www.hackerearth.com"}


def parse(e: dict) -> dict:
    return {
        "url": e["url"],
        "title": e["title"],
        "description": e.get("description"),
        "format": "online",
        "starts_at": e.get("start_utc_tz"),
        "ends_at": e.get("end_utc_tz"),
        "registration_status": {"ONGOING": "open", "UPCOMING": "upcoming"}.get(e.get("status")),
        "categories": ["hackathon" if "/hackathon/" in e["url"] else "competition", e.get("challenge_type"),
                       "college" if e.get("college") else None],
    }


def fetch():
    for e in http("https://www.hackerearth.com/chrome-extension/events/", ALLOWED_HOSTS).json()["response"]:
        yield parse(e)
