"""Common normalization: one canonical, validated event shape for every source.

Sources hand over loosely-typed dicts with the same keys as the `events` table; this module turns
them into clean rows or rejects them with a reason. Unknown stays unknown: a missing fee is never free.
"""
import re
from datetime import datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from bs4 import BeautifulSoup
from dateutil import parser as dateparser

FORMATS = {"online": "online", "virtual": "online", "digital": "online", "remote": "online",
           "in_person": "in_person", "in-person": "in_person", "offline": "in_person", "physical": "in_person",
           "hybrid": "hybrid"}
STATUSES = {"upcoming", "open", "closed", "unknown"}
TRACKING = re.compile(r"^(utm_.*|ref|fbclid|gclid|mc_.*|source)$", re.I)


def canonical_url(raw) -> str | None:
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    if raw.startswith("//"):
        raw = "https:" + raw
    parts = urlsplit(raw)
    if parts.scheme not in ("http", "https") or not parts.hostname:
        return None
    query = urlencode([(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if not TRACKING.match(k)])
    path = parts.path.rstrip("/") or "/"
    netloc = parts.hostname.lower() + (f":{parts.port}" if parts.port else "")
    return urlunsplit((parts.scheme.lower(), netloc, path, query, ""))


def to_utc(raw, *, end_of_day: bool = False) -> str | None:
    """Any date/datetime → ISO UTC. Date-only values are taken as UTC midnight (or 23:59:59 for deadlines)."""
    if raw in (None, ""):
        return None
    try:
        if isinstance(raw, (int, float)):
            dt = datetime.fromtimestamp(raw, timezone.utc)
        elif isinstance(raw, datetime):
            dt = raw
        else:
            text = str(raw).strip()
            dt = dateparser.parse(text)
            if end_of_day and ":" not in text:  # date only, e.g. "Oct 23, 2026"
                dt = dt.replace(hour=23, minute=59, second=59)
    except (ValueError, OverflowError, TypeError):
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)  # ponytail: naive times assumed UTC; per-source tz if a source needs it
    if not 1990 <= dt.year <= 2100:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def clean_text(raw, limit: int) -> str | None:
    if not raw:
        return None
    text = BeautifulSoup(str(raw), "html.parser").get_text(" ") if "<" in str(raw) else str(raw)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit] or None


UNSTOP_OPP_PATTERN = re.compile(
    r"^https?://(?:www\.)?unstop\.com/(?:[a-zA-Z0-9_-]+/)*[a-zA-Z0-9_-]+-(\d{5,9})(?:/.*)?$|"
    r"^https?://(?:www\.)?unstop\.com/(?:o|p)/(\d{4,9})(?:/.*)?$",
    re.I
)


def validate_platform_url(url: str | None, *, is_registration: bool = False) -> tuple[str | None, str | None]:
    """Validate platform-specific URLs to prevent broken slugs or fallback redirects."""
    if not url:
        return None, "empty url"

    parts = urlsplit(url)
    hostname = (parts.hostname or "").lower()

    # 1. Unstop platform validation: opportunity URLs must have an authentic numeric ID suffix
    if hostname == "unstop.com" or hostname.endswith(".unstop.com"):
        path = parts.path.lower()
        if any(path.startswith(prefix) for prefix in (
            "/competitions", "/hackathons", "/workshops-webinars", "/conferences",
            "/quizzes", "/cultural-events", "/college-fests", "/o/", "/p/"
        )):
            if not UNSTOP_OPP_PATTERN.match(url):
                return None, "unstop opportunity url missing numeric id (would redirect/404)"

    # 2. General sanity: Reject raw unencoded characters or obvious placeholders
    if any(c in url for c in ("<", ">", "{", "}", " ", '"', "'")):
        return None, "url contains unencoded special characters"

    return url, None


def fee(raw_status, amount, currency) -> tuple[str, float | None, str | None]:
    status = raw_status if raw_status in ("free", "paid") else "unknown"
    try:
        amount = float(amount) if amount not in (None, "") else None
    except (TypeError, ValueError):
        amount = None
    if amount is not None and amount < 0:
        amount = None
    currency = currency.upper() if isinstance(currency, str) and re.fullmatch(r"[A-Za-z]{3}", currency) else None
    if status == "free":
        return "free", 0.0, None  # explicit 0 clears an old amount on update
    if status == "unknown" and amount:  # a positive listed fee is evidence enough of "paid"
        status = "paid"
    return status, amount, currency


def registration_status(
    raw,
    opens: str | None,
    deadline: str | None,
    now: datetime,
    *,
    starts: str | None = None,
    ends: str | None = None
) -> str:
    if raw in STATUSES and raw != "unknown":
        status = raw
    elif opens and deadline:
        status = "upcoming" if now < datetime.fromisoformat(opens) else "open"
    elif opens and now < datetime.fromisoformat(opens):
        status = "upcoming"
    else:
        status = "unknown"

    # Strict lifecycle guardrails: expired events must be closed
    if ends and now > datetime.fromisoformat(ends):
        status = "closed"
    elif deadline and now > datetime.fromisoformat(deadline):
        status = "closed"
    elif not deadline and starts and now > datetime.fromisoformat(starts):
        status = "closed"

    return status


def normalize(raw: dict, now: datetime | None = None) -> tuple[dict | None, str | None]:
    """Returns (row, None) or (None, reason)."""
    now = now or datetime.now(timezone.utc)
    raw_url = canonical_url(raw.get("url"))
    if not raw_url:
        return None, "invalid url"
    url, url_err = validate_platform_url(raw_url, is_registration=False)
    if not url:
        return None, url_err or "invalid url"

    title = clean_text(raw.get("title"), 300)
    if not title or len(title) < 2:
        return None, "missing title"

    raw_reg = canonical_url(raw.get("registration_url"))
    reg_url, _ = validate_platform_url(raw_reg, is_registration=True) if raw_reg else (None, None)

    opens = to_utc(raw.get("registration_opens_at"))
    deadline = to_utc(raw.get("registration_deadline"), end_of_day=True)
    starts, ends = to_utc(raw.get("starts_at")), to_utc(raw.get("ends_at"), end_of_day=True)
    if starts and ends and ends < starts:
        ends = None  # contradictory source data: keep the start, drop the impossible end

    if not starts:
        return None, "missing event start date"

    # Registration deadlines are not event dates. Only the event's actual end
    # (or start when no end is supplied) determines whether it has concluded.
    conclusion = ends or starts
    if datetime.fromisoformat(conclusion) <= now:
        return None, "event has already ended"

    fee_status, fee_amount, fee_currency = fee(raw.get("fee_status"), raw.get("fee_amount"), raw.get("fee_currency"))

    categories = sorted({c.strip().lower()[:40] for c in raw.get("categories") or [] if c and c.strip()})[:20]
    row = {
        "external_id": str(raw["external_id"])[:200] if raw.get("external_id") not in (None, "") else None,
        "url": url,
        "registration_url": reg_url,
        "title": title,
        "description": clean_text(raw.get("description"), 5000),
        "organizer": clean_text(raw.get("organizer"), 200),
        "city": clean_text(raw.get("city"), 80),
        "country": clean_text(raw.get("country"), 80),
        "format": FORMATS.get(str(raw.get("format") or "").lower(), "unknown"),
        "starts_at": starts,
        "ends_at": ends,
        "registration_opens_at": opens,
        "registration_deadline": deadline,
        "fee_status": fee_status,
        "fee_amount": fee_amount,
        "fee_currency": fee_currency,
        "prize_text": clean_text(raw.get("prize_text"), 200),
        "registration_status": registration_status(
            raw.get("registration_status"), opens, deadline, now, starts=starts, ends=ends
        ),
        "eligibility": clean_text(raw.get("eligibility"), 1000),
        "categories": categories,
        "last_checked_at": now.isoformat(),
    }
    return row, None
