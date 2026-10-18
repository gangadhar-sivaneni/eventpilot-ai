"""Major League Hacking season page (student hackathons worldwide). Data comes from the page's embedded JSON."""
import json
import re
from datetime import datetime, timezone

from net import fetch as http

KEY = "mlh"
ALLOWED_HOSTS = {"www.mlh.com", "mlh.com"}
DATA = re.compile(r'<script[^>]*data-page="app"[^>]*>(.*?)</script>', re.S)


def season(now: datetime) -> int:
    return now.year + (now.month >= 7)  # seasons run July–June and are named by their end year


def parse(e: dict) -> dict:
    venue = e.get("venueAddress") or {}
    return {
        "external_id": e["id"],
        "url": e.get("websiteUrl") or f"https://www.mlh.com{e['url']}",
        "title": e["name"],
        "organizer": "Major League Hacking member event",
        "format": {"physical": "in_person", "digital": "online", "hybrid": "hybrid"}.get(e.get("formatType")),
        "city": venue.get("city") or e.get("location"),
        "country": venue.get("country"),
        "starts_at": e.get("startsAt"),
        "ends_at": e.get("endsAt"),
        "categories": ["hackathon", "student", "mlh"],
    }


def extract(html: str) -> list[dict]:
    m = DATA.search(html)
    if not m:
        raise ValueError("MLH page layout changed: embedded data not found")
    return json.loads(m.group(1))["props"]["upcomingEvents"]


def fetch():
    html = http(f"https://www.mlh.com/seasons/{season(datetime.now(timezone.utc))}/events", ALLOWED_HOSTS).text
    for e in extract(html):
        yield parse(e)
