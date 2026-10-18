"""Devpost public hackathon listing (JSON used by devpost.com/hackathons)."""
import re
from datetime import datetime

from net import fetch as http

KEY = "devpost"
ALLOWED_HOSTS = {"devpost.com"}
PAGES = 5  # newest first; 9 per page


def period(text: str) -> tuple[str | None, str | None]:
    """'Aug 31 - Oct 23, 2026' | 'Oct 1 - 3, 2026' | 'Dec 30, 2026 - Jan 2, 2027' → ISO dates."""
    try:
        start, _, end = (s.strip() for s in text.partition(" - "))
        end = end or start
        if end[:1].isdigit():  # 'Oct 1 - 3, 2026'
            end = f"{start.split()[0]} {end}"
        end_dt = datetime.strptime(end, "%b %d, %Y")
        if re.search(r"\d{4}$", start):
            start_dt = datetime.strptime(start, "%b %d, %Y")
        else:
            start_dt = datetime.strptime(f"{start}, {end_dt.year}", "%b %d, %Y")
            if start_dt > end_dt:  # 'Dec 30 - Jan 2, 2027' style spans the new year
                start_dt = start_dt.replace(year=end_dt.year - 1)
        return start_dt.date().isoformat(), end_dt.date().isoformat()
    except ValueError:
        return None, None


def parse(h: dict) -> dict | None:
    if h.get("invite_only"):
        return None
    loc = (h.get("displayed_location") or {}).get("location") or ""
    starts, ends = period(h.get("submission_period_dates") or "")
    prize = re.sub(r"<[^>]+>", "", h.get("prize_amount") or "").strip()
    has_cash = (h.get("prizes_counts") or {}).get("cash") and prize.strip("$€£₹0,. ")
    return {
        "external_id": h["id"],
        "url": h["url"],
        "title": h["title"],
        "organizer": h.get("organization_name"),
        "format": "online" if loc.lower() == "online" else ("in_person" if loc else None),
        "city": None if loc.lower() == "online" else loc,
        "starts_at": starts,
        "ends_at": ends,  # submission period end; Devpost does not publish a separate registration deadline
        "registration_status": {"open": "open", "upcoming": "upcoming", "ended": "closed"}.get(h.get("open_state")),
        "prize_text": prize if has_cash else None,
        "categories": ["hackathon"] + [t["name"] for t in h.get("themes") or []],
    }


def fetch():
    for page in range(1, PAGES + 1):
        items = http(f"https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&order_by=recently-added&page={page}",
                     ALLOWED_HOSTS).json()["hackathons"]
        if not items:
            return
        yield from filter(None, map(parse, items))
