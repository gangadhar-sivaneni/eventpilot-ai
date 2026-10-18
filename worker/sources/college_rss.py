"""College website RSS feeds. A post becomes an event only when its title names an event type.
Feeds give the post date, not the event date, so dates stay unknown rather than guessed."""
import re
from urllib.parse import urlsplit

import feedparser

from net import fetch as http

KEY = "college_rss"
# (feed URL, college, city, country). Add colleges here; their host is allowlisted automatically.
FEEDS = [
    ("https://mlrit.ac.in/feed/", "MLR Institute of Technology", "Hyderabad", "India"),
    ("https://www.cbit.ac.in/feed/", "Chaitanya Bharathi Institute of Technology", "Hyderabad", "India"),
]
ALLOWED_HOSTS = {urlsplit(f[0]).hostname for f in FEEDS}
EVENT_WORDS = re.compile(r"hackathon|ideathon|fest\b|techfest|workshop|symposium|competition|contest|bootcamp|"
                         r"conference|summit|seminar|webinar|expo|quiz|coding|registration", re.I)


def parse(entry: dict, college: str, city: str, country: str) -> dict | None:
    title = entry.get("title") or ""
    m = EVENT_WORDS.search(title)
    if not m:
        return None
    return {
        "external_id": entry.get("id") or entry.get("link"),
        "url": entry.get("link"),
        "title": title,
        "description": entry.get("summary"),
        "organizer": college,
        "city": city,
        "country": country,
        "categories": ["college", m.group(0).lower()],
    }


def fetch():
    for url, college, city, country in FEEDS:
        feed = feedparser.parse(http(url, ALLOWED_HOSTS).content)
        for entry in feed.entries:
            row = parse(entry, college, city, country)
            if row:
                yield row
