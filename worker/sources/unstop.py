"""Unstop public opportunity search (hackathons, competitions, workshops, conferences; many college-hosted)."""
import re

from net import fetch as http

KEY = "unstop"
ALLOWED_HOSTS = {"unstop.com"}
TYPES = ["hackathons", "competitions", "workshops", "conferences"]
PAGES = 3  # per type, 50 per page
CURRENCY = {"fa-rupee": "INR", "fa-dollar": "USD", "fa-euro": "EUR"}
SYMBOL = {"INR": "₹", "USD": "$", "EUR": "€"}
COLLEGE = re.compile(r"institute|college|university|\biit|\biim|\bnit\b|iiit|vidyalaya|engineering|school of", re.I)


def prize(prizes: list) -> str | None:
    cash = sum(p.get("cash") or 0 for p in prizes)
    if not cash:
        return None
    code = CURRENCY.get(prizes[0].get("currency"), "")
    return f"{SYMBOL.get(code, code + ' ')}{cash:,}"


def parse(o: dict, kind: str) -> dict:
    reg = o.get("regnRequirements") or {}
    org = (o.get("organisation") or {}).get("name")
    addr = o.get("address_with_country_logo") or {}
    region = o.get("region")
    return {
        "external_id": o["id"],
        "url": o["seo_url"],
        "title": o["title"],
        "organizer": org,
        "format": {"online": "online", "offline": "in_person", "hybrid": "hybrid"}.get(region),
        "city": addr.get("city") or None,
        "country": (addr.get("country") or {}).get("name") if isinstance(addr.get("country"), dict) else addr.get("country"),
        "registration_opens_at": reg.get("start_regn_dt"),
        "registration_deadline": reg.get("end_regn_dt") or o.get("end_date"),
        "registration_status": "open" if o.get("regn_open") == 1 else None,
        "fee_status": "paid" if o.get("isPaid") else "free",  # Unstop states this per listing
        "prize_text": prize(o.get("prizes") or []),
        "categories": [kind.rstrip("s"), o.get("subtype"), *(w["name"] for w in o.get("workfunction") or []),
                       "college" if org and COLLEGE.search(org) else None],
    }


def fetch():
    for kind in TYPES:
        for page in range(1, PAGES + 1):
            items = http(f"https://unstop.com/api/public/opportunity/search-result?opportunity={kind}"
                         f"&page={page}&per_page=50&oppstatus=open", ALLOWED_HOSTS).json()["data"]["data"]
            if not items:  # Unstop returns 49 for per_page=50, so only an empty page means "done"
                break
            for o in items:
                yield parse(o, kind)
