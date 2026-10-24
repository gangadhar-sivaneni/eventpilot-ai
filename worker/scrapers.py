"""EventPilot AI — Unified Event Scrapers & Ingestion Adapters

This single file contains all scrapers for EventPilot AI.
It combines all external event platforms and feeds into one cohesive, readable module:
  1. devpost        — Global hackathons from Devpost API
  2. unstop         — Competitions, hackathons, and workshops from Unstop API
  3. devfolio       — Indian and international developer hackathons from Devfolio
  4. hackerearth    — Corporate innovation and coding challenges from HackerEarth
  5. mlh            — Major League Hacking student hackathon season
  6. college_rss    — College feeds (MLRIT, CBIT, IIIT, etc.) via RSS
  7. synthetic      — Isolated test/mock events for local testing (excluded from production)

Production adapters expose:
  - KEY: str (matches the database event_sources key)
  - ALLOWED_HOSTS: set[str] (enforced by net.py SSRF firewall)
  - fetch(): generator yielding normalized event dicts
"""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urljoin, urlsplit

import feedparser
from bs4 import BeautifulSoup
from net import fetch as http


# ─────────────────────────────────────────────────────────────────────────────
# 1. DEVPOST SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class devpost:
    """Devpost public hackathon listing (JSON used by devpost.com/hackathons)."""
    KEY = "devpost"
    ALLOWED_HOSTS = {"devpost.com"}
    PAGES = 5  # newest first; 9 per page

    @staticmethod
    def parse(h: dict) -> dict | None:
        if h.get("invite_only"):
            return None
        loc = (h.get("displayed_location") or {}).get("location") or ""
        # Devpost's submission window is not the event schedule. Only use
        # separately published event dates; otherwise normalize() rejects it.
        starts = h.get("event_start_date") or h.get("starts_at")
        ends = h.get("event_end_date") or h.get("ends_at")
        prize = re.sub(r"<[^>]+>", "", h.get("prize_amount") or "").strip()
        has_cash = (h.get("prizes_counts") or {}).get("cash") and prize.strip("$€£₹0,. ")
        event_end = ends or starts
        now_iso = datetime.now(timezone.utc).isoformat()
        if event_end and event_end < now_iso:
            return None

        is_online = not loc or "online" in loc.lower() or "virtual" in loc.lower()
        return {
            "external_id": h["id"],
            "url": h["url"],
            "title": h["title"],
            "organizer": h.get("organization_name"),
            "format": "online" if is_online else "in_person",
            "city": None if is_online else loc or None,
            "starts_at": starts,
            "ends_at": ends,
            "registration_deadline": h.get("registration_deadline"),
            "registration_status": "open" if h.get("open_state") == "open" else "unknown",
            "prize_text": prize if has_cash else None,
            "categories": ["hackathon"] + [t["name"] for t in h.get("themes") or []],
        }

    @classmethod
    def fetch(cls):
        for page in range(1, cls.PAGES + 1):
            try:
                url = f"https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&order_by=recently-added&page={page}"
                res = http(url, cls.ALLOWED_HOSTS).json()
                items = res.get("hackathons") or []
                if not items:
                    break
                yield from filter(None, map(cls.parse, items))
            except Exception as err:
                print(f"  devpost page {page} notice: {err}")
                break


# ─────────────────────────────────────────────────────────────────────────────
# 2. UNSTOP SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class unstop:
    """Unstop public opportunity search (hackathons, competitions, workshops, conferences)."""
    KEY = "unstop"
    ALLOWED_HOSTS = {"unstop.com"}
    TYPES = ["hackathons", "competitions", "workshops", "conferences"]
    PAGES = 3  # per type, 50 per page
    CURRENCY = {"fa-rupee": "INR", "fa-dollar": "USD", "fa-euro": "EUR"}
    SYMBOL = {"INR": "₹", "USD": "$", "EUR": "€"}
    COLLEGE = re.compile(r"institute|college|university|\biit|\biim|\bnit\b|iiit|vidyalaya|engineering|school of", re.I)

    @staticmethod
    def india_time(value, country: str | None, *, end_of_day: bool = False):
        """Unstop's India listings often omit their timezone; interpret those as IST."""
        if not value or (country or "").strip().lower() not in {"india", "in"}:
            return value
        text = str(value).strip()
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", text):
            time = "23:59:59" if end_of_day else "00:00:00"
            return f"{text}T{time}+05:30"
        if re.search(r"(?:Z|[+-]\d{2}:?\d{2})$", text, re.I):
            return text
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?", text):
            return text.replace(" ", "T") + "+05:30"
        return value

    @classmethod
    def prize(cls, prizes: list) -> str | None:
        cash = sum(p.get("cash") or 0 for p in prizes)
        if not cash:
            return None
        code = cls.CURRENCY.get(prizes[0].get("currency"), "")
        return f"{cls.SYMBOL.get(code, code + ' ')}{cash:,}"

    @classmethod
    def parse(cls, o: dict, kind: str) -> dict:
        reg = o.get("regnRequirements") or {}
        org = (o.get("organisation") or {}).get("name")
        addr = o.get("address_with_country_logo") or {}
        region = o.get("region")
        country = ((addr.get("country") or {}).get("name") if isinstance(addr.get("country"), dict)
                   else addr.get("country"))

        raw_url = o.get("seo_url") or ""
        if raw_url.startswith("/"):
            raw_url = f"https://unstop.com{raw_url}"
        if not re.search(r"-\d{5,9}(?:/.*)?$|/(?:o|p)/\d+", raw_url) and o.get("id"):
            raw_url = f"https://unstop.com/o/{o['id']}"

        # Event dates and registration dates describe different timelines.
        # Missing event dates stay missing and are rejected by normalize().
        start_raw = o.get("start_date") or o.get("startDate")
        end_raw = o.get("end_date") or o.get("endDate")
        deadline_raw = reg.get("end_regn_dt")
        opens_raw = reg.get("start_regn_dt")

        is_online = region == "online" or not addr.get("city")
        return {
            "external_id": o["id"],
            "url": raw_url,
            "title": o["title"],
            "organizer": org,
            "format": {"online": "online", "offline": "in_person", "hybrid": "hybrid"}.get(region) or ("online" if is_online else "in_person"),
            "city": addr.get("city") or None,
            "country": country or ("India" if addr.get("city") else None),
            "registration_opens_at": cls.india_time(opens_raw, country),
            "starts_at": cls.india_time(start_raw, country),
            "ends_at": cls.india_time(end_raw, country, end_of_day=True),
            "registration_deadline": cls.india_time(deadline_raw, country, end_of_day=True),
            "registration_status": "open" if o.get("regn_open") == 1 or reg.get("reg_status") == "STARTED" else None,
            "fee_status": "paid" if o.get("isPaid") in (True, 1) else (
                "free" if o.get("isPaid") in (False, 0) else "unknown"
            ),
            "prize_text": cls.prize(o.get("prizes") or []),
            "categories": [kind.rstrip("s"), o.get("subtype"), *(w["name"] for w in o.get("workfunction") or []),
                           "college" if org and cls.COLLEGE.search(org) else None],
        }

    @classmethod
    def fetch(cls):
        for kind in cls.TYPES:
            for page in range(1, cls.PAGES + 1):
                try:
                    url = f"https://unstop.com/api/public/opportunity/search-result?opportunity={kind}&page={page}&per_page=50&oppstatus=open"
                    res = http(url, cls.ALLOWED_HOSTS).json()
                    items = (res.get("data") or {}).get("data") or []
                    if not items:
                        break
                    for o in items:
                        yield cls.parse(o, kind)
                except Exception as err:
                    print(f"  unstop {kind} page {page} notice: {err}")
                    break


# ─────────────────────────────────────────────────────────────────────────────
# 3. DEVFOLIO SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class devfolio:
    """Devfolio hackathons with open applications (prominent in India tech colleges)."""
    KEY = "devfolio"
    ALLOWED_HOSTS = {"api.devfolio.co"}
    MONEY = re.compile(r"[₹$€£]|\b(rs\.?|inr|usd|usdc|cash)\b", re.I)

    @classmethod
    def parse(cls, h: dict) -> dict:
        s = h.get("hackathon_setting") or {}
        prize = next((p["desc"] for p in h.get("prizes") or [] if cls.MONEY.search(p.get("desc") or "")), None)
        return {
            "external_id": h["uuid"],
            "url": f"https://{h['slug']}.devfolio.co/",
            "registration_url": f"https://{h['slug']}.devfolio.co/",
            "title": h["name"],
            "description": h.get("tagline"),
            "format": "online" if h.get("is_online") is True else ("in_person" if h.get("is_online") is False else None),
            "city": h.get("city"),
            "country": h.get("country"),
            "starts_at": h.get("starts_at"),
            "ends_at": h.get("ends_at"),
            "registration_opens_at": s.get("reg_starts_at"),
            "registration_deadline": s.get("reg_ends_at"),
            "registration_status": "open",
            "prize_text": prize,
            "categories": ["hackathon"] + [t["name"] for t in h.get("themes") or []],
        }

    @classmethod
    def fetch(cls):
        body = {"type": "application_open", "from": 0, "size": 200}
        for hit in http("https://api.devfolio.co/api/search/hackathons", cls.ALLOWED_HOSTS, json_body=body).json()["hits"]["hits"]:
            yield cls.parse(hit["_source"])


# ─────────────────────────────────────────────────────────────────────────────
# 4. HACKEREARTH SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class hackerearth:
    """HackerEarth public challenge feed (enterprise & hiring hackathons)."""
    KEY = "hackerearth"
    ALLOWED_HOSTS = {"www.hackerearth.com"}

    @staticmethod
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

    @classmethod
    def fetch(cls):
        for e in http("https://www.hackerearth.com/chrome-extension/events/", cls.ALLOWED_HOSTS).json()["response"]:
            yield cls.parse(e)


# ─────────────────────────────────────────────────────────────────────────────
# 5. MAJOR LEAGUE HACKING (MLH) SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class mlh:
    """Major League Hacking season page (student hackathons worldwide)."""
    KEY = "mlh"
    ALLOWED_HOSTS = {"www.mlh.com", "mlh.com"}
    DATA = re.compile(r'<script[^>]*data-page="app"[^>]*>(.*?)</script>', re.S)

    @staticmethod
    def season(now: datetime) -> int:
        return now.year + (now.month >= 7)  # seasons run July–June, named by end year

    @staticmethod
    def parse(e: dict) -> dict | None:
        now_iso = datetime.now(timezone.utc).isoformat()
        starts = e.get("startsAt")
        ends = e.get("endsAt")
        if starts and starts < now_iso:
            return None
        if ends and ends < now_iso:
            return None

        venue = e.get("venueAddress") or {}
        return {
            "external_id": e["id"],
            "url": e.get("websiteUrl") or f"https://www.mlh.com{e['url']}",
            "title": e["name"],
            "organizer": "Major League Hacking member event",
            "format": {"physical": "in_person", "digital": "online", "hybrid": "hybrid"}.get(e.get("formatType")),
            "city": venue.get("city") or e.get("location"),
            "country": venue.get("country"),
            "starts_at": starts,
            "ends_at": ends,
            "registration_deadline": None,
            "registration_status": "unknown",
            "categories": ["hackathon", "student", "mlh"],
        }

    @classmethod
    def extract(cls, html: str) -> list[dict]:
        m = cls.DATA.search(html)
        if not m:
            raise ValueError("MLH page layout changed: embedded data not found")
        return json.loads(m.group(1))["props"]["upcomingEvents"]

    @classmethod
    def fetch(cls):
        url = f"https://www.mlh.com/seasons/{cls.season(datetime.now(timezone.utc))}/events"
        html = http(url, cls.ALLOWED_HOSTS).text
        yield from filter(None, map(cls.parse, cls.extract(html)))


# ─────────────────────────────────────────────────────────────────────────────
# 6. COLLEGE RSS FEEDS SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class college_rss:
    """College RSS discovery; import only pages that publish Schema.org Event dates."""
    KEY = "college_rss"
    FEEDS = [
        ("https://mlrit.ac.in/feed/", "MLR Institute of Technology", "Hyderabad", "India"),
        ("https://www.cbit.ac.in/feed/", "Chaitanya Bharathi Institute of Technology", "Hyderabad", "India"),
    ]
    ALLOWED_HOSTS = {urlsplit(f[0]).hostname for f in FEEDS}
    EVENT_WORDS = re.compile(
        r"hackathon|ideathon|fest\b|techfest|workshop|symposium|competition|contest|bootcamp|"
        r"conference|summit|seminar|webinar|expo|quiz|coding|registration", re.I
    )

    @classmethod
    def parse(cls, entry: dict, college: str, city: str, country: str) -> dict | None:
        title = entry.get("title") or ""
        m = cls.EVENT_WORDS.search(title)
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

    @staticmethod
    def _event_nodes(value):
        if isinstance(value, list):
            for item in value:
                yield from college_rss._event_nodes(item)
        elif isinstance(value, dict):
            kind = value.get("@type", [])
            kinds = [kind] if isinstance(kind, str) else kind
            if any(str(k).endswith("Event") for k in kinds):
                yield value
            for child in value.get("@graph", []):
                yield from college_rss._event_nodes(child)

    @classmethod
    def parse_event_page(cls, html: str, entry: dict, college: str) -> dict | None:
        """Use the event's published structured data; never treat the article date as its event date."""
        for script in BeautifulSoup(html, "html.parser").select('script[type="application/ld+json"]'):
            try:
                data = json.loads(script.string or script.get_text())
            except (TypeError, json.JSONDecodeError):
                continue
            for event in cls._event_nodes(data):
                start = event.get("startDate")
                if not start:
                    continue
                location = event.get("location") or {}
                address = location.get("address") or {} if isinstance(location, dict) else {}
                if isinstance(address, dict):
                    event_city = address.get("addressLocality")
                    event_country = address.get("addressCountry")
                    if isinstance(event_country, dict):
                        event_country = event_country.get("name") or event_country.get("@id")
                    if str(event_country or "").rstrip("/").endswith("/IN"):
                        event_country = "IN"
                else:
                    event_city, event_country = None, None
                mode = event.get("eventAttendanceMode") or ""
                event_format = "online" if "OnlineEventAttendanceMode" in str(mode) else (
                    "in_person" if location else "unknown"
                )
                organizer = event.get("organizer") or college
                if isinstance(organizer, dict):
                    organizer = organizer.get("name") or college
                offers = event.get("offers") or {}
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                return {
                    "external_id": event.get("@id") or entry.get("id") or entry.get("link"),
                    "url": event.get("url") or entry.get("link"),
                    "registration_url": offers.get("url") if isinstance(offers, dict) else None,
                    "title": event.get("name") or entry.get("title"),
                    "description": event.get("description") or entry.get("summary"),
                    "organizer": organizer,
                    "city": event_city,
                    "country": event_country,
                    "format": event_format,
                    "starts_at": unstop.india_time(start, event_country),
                    "ends_at": unstop.india_time(event.get("endDate"), event_country, end_of_day=True),
                    "categories": ["college", "technology event"],
                }
        return None

    @classmethod
    def fetch(cls):
        for url, college, city, country in cls.FEEDS:
            try:
                feed = feedparser.parse(http(url, cls.ALLOWED_HOSTS).content)
                for entry in feed.entries:
                    row = cls.parse(entry, college, city, country)
                    if not row or not entry.get("link"):
                        continue
                    page = http(entry.link, {urlsplit(url).hostname}).text
                    event = cls.parse_event_page(page, entry, college)
                    if event:
                        yield event
            except Exception as err:
                print(f"  college_rss {college} notice: {err}")


# ─────────────────────────────────────────────────────────────────────────────
# IIT HYDERABAD OFFICIAL EVENTS CALENDAR
# ─────────────────────────────────────────────────────────────────────────────
class iit_hyd:
    """Dated event cards from IIT Hyderabad's official Workshops and Events page."""
    KEY = "iit_hyd"
    URL = "https://iith.ac.in/events/"
    ALLOWED_HOSTS = {"iith.ac.in"}
    DATE_PATTERN = re.compile(r"\b\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4}\b")

    @classmethod
    def parse(cls, article) -> dict | None:
        link = article.select_one("h3 a[href]")
        date_node = article.select_one("p")
        if not link or not date_node:
            return None
        date_match = cls.DATE_PATTERN.search(date_node.get_text(" ", strip=True))
        if not date_match:
            return None
        date_text = date_match.group(0)
        event_date = None
        for fmt in ("%d %b %Y", "%d %B %Y"):
            try:
                event_date = datetime.strptime(date_text, fmt).date().isoformat()
                break
            except ValueError:
                continue
        if not event_date:
            return None

        title_text = link.get_text(" ", strip=True)
        title_parts = re.split(r"\s[-–—]\s", title_text, maxsplit=1)
        title = title_parts[0].strip()
        paragraphs = article.find_all("p")
        description_parts = title_parts[1:] + [p.get_text(" ", strip=True) for p in paragraphs[1:]]
        description = " ".join(p for p in description_parts if p) or None
        url = urljoin(cls.URL, link.get("href"))
        return {
            "external_id": url,
            "url": url,
            "registration_url": url,
            "title": title,
            "description": description,
            "organizer": "IIT Hyderabad",
            "city": "Hyderabad",
            "country": "India",
            "format": "unknown",
            "starts_at": unstop.india_time(event_date, "India"),
            "categories": ["college"],
        }

    @classmethod
    def fetch(cls):
        soup = BeautifulSoup(http(cls.URL, cls.ALLOWED_HOSTS).text, "html.parser")
        for article in soup.select("article"):
            row = cls.parse(article)
            if row:
                yield row


# ─────────────────────────────────────────────────────────────────────────────
# Test-only adapter (not registered for production discovery).

class synthetic:
    """Clearly-labelled fake events for tests only; excluded from production discovery."""
    KEY = "synthetic"
    ALLOWED_HOSTS: set[str] = set()

    @staticmethod
    def fetch():
        yield {
            "external_id": "syn-1",
            "url": "https://example.com/synthetic/hackathon",
            "title": "[TEST] Synthetic Hackathon",
            "organizer": "EventPilot test data",
            "format": "online",
            "registration_status": "open",
            "registration_deadline": "2099-12-31",
            "fee_status": "free",
            "prize_text": "₹10,000",
            "categories": ["hackathon", "test"]
        }
        yield {
            "external_id": "syn-2",
            "url": "https://example.com/synthetic/workshop",
            "title": "[TEST] Synthetic Paid Workshop",
            "organizer": "EventPilot test data",
            "format": "in_person",
            "city": "Hyderabad",
            "country": "India",
            "registration_opens_at": "2099-01-01T09:00:00Z",
            "registration_deadline": "2099-02-01",
            "fee_status": "paid",
            "fee_amount": 499,
            "fee_currency": "INR",
            "categories": ["workshop", "test"]
        }
        yield {
            "external_id": "syn-3",
            "url": "https://example.com/synthetic/meetup",
            "title": "[TEST] Synthetic Meetup (fee unknown)",
            "format": "hybrid",
            "categories": ["meetup", "test"]
        }


# ─────────────────────────────────────────────────────────────────────────────
# UNIFIED REGISTRY
# ─────────────────────────────────────────────────────────────────────────────
REGISTRY = {
    s.KEY: s for s in (
        devpost,
        unstop,
        devfolio,
        hackerearth,
        mlh,
        college_rss,
        iit_hyd,
    )
}
