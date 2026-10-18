"""Devfolio hackathons with open applications (many Indian college hackathons)."""
import re

from net import fetch as http

KEY = "devfolio"
ALLOWED_HOSTS = {"api.devfolio.co"}
MONEY = re.compile(r"[₹$€£]|\b(rs\.?|inr|usd|usdc|cash)\b", re.I)


def parse(h: dict) -> dict:
    s = h.get("hackathon_setting") or {}
    prize = next((p["desc"] for p in h.get("prizes") or [] if MONEY.search(p.get("desc") or "")), None)
    return {
        "external_id": h["uuid"],
        "url": f"https://{h['slug']}.devfolio.co/",
        "registration_url": f"https://{h['slug']}.devfolio.co/",
        "title": h["name"],
        "description": h.get("tagline"),
        "format": "online" if h.get("is_online") else "in_person",
        "city": h.get("city"),
        "country": h.get("country"),
        "starts_at": h.get("starts_at"),
        "ends_at": h.get("ends_at"),
        "registration_opens_at": s.get("reg_starts_at"),
        "registration_deadline": s.get("reg_ends_at"),
        "registration_status": "open",  # the query asks for application_open only
        "prize_text": prize,
        "categories": ["hackathon"] + [t["name"] for t in h.get("themes") or []],
    }


def fetch():
    body = {"type": "application_open", "from": 0, "size": 200}
    for hit in http("https://api.devfolio.co/api/search/hackathons", ALLOWED_HOSTS, json_body=body).json()["hits"]["hits"]:
        yield parse(hit["_source"])
