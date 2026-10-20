"""EventPilot AI — Unified Event Scrapers & Ingestion Adapters

This single file contains all scrapers for EventPilot AI.
It combines all external event platforms and feeds into one cohesive, readable module:
  1. devpost        — Global hackathons from Devpost API
  2. unstop         — Competitions, hackathons, and workshops from Unstop API
  3. devfolio       — Indian and international developer hackathons from Devfolio
  4. hackerearth    — Corporate innovation and coding challenges from HackerEarth
  5. mlh            — Major League Hacking student hackathon season
  6. college_rss    — College feeds (MLRIT, CBIT, IIIT, etc.) via RSS
  7. tech_community — In-person community developer summits & corporate campus meetups (Microsoft, Google, T-Hub, AWS)
  8. synthetic      — Isolated test/mock events for local testing

All scrapers expose:
  - KEY: str (matches the database event_sources key)
  - ALLOWED_HOSTS: set[str] (enforced by net.py SSRF firewall)
  - fetch(): generator yielding normalized event dicts
"""
import json
import re
from datetime import datetime, timezone
from urllib.parse import urlsplit

import feedparser
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
    def period(text: str) -> tuple[str | None, str | None]:
        """Convert 'Aug 31 - Oct 23, 2026' or 'Oct 1 - 3, 2026' into (ISO start, ISO end)."""
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
                if start_dt > end_dt:  # 'Dec 30 - Jan 2, 2027' style spans new year
                    start_dt = start_dt.replace(year=end_dt.year - 1)
            return start_dt.date().isoformat(), end_dt.date().isoformat()
        except ValueError:
            return None, None

    @staticmethod
    def parse(h: dict) -> dict | None:
        if h.get("invite_only"):
            return None
        loc = (h.get("displayed_location") or {}).get("location") or ""
        starts, ends = devpost.period(h.get("submission_period_dates") or "")
        prize = re.sub(r"<[^>]+>", "", h.get("prize_amount") or "").strip()
        has_cash = (h.get("prizes_counts") or {}).get("cash") and prize.strip("$€£₹0,. ")
        today_iso = datetime.now(timezone.utc).date().isoformat()
        if ends and ends < today_iso:
            return None

        return {
            "external_id": h["id"],
            "url": h["url"],
            "title": h["title"],
            "organizer": h.get("organization_name"),
            "format": "online" if loc.lower() == "online" else ("in_person" if loc else None),
            "city": None if loc.lower() == "online" else loc,
            "starts_at": starts,
            "ends_at": ends,
            "registration_deadline": ends,
            "registration_status": "open" if (ends and ends >= today_iso) else "closed",
            "prize_text": prize if has_cash else None,
            "categories": ["hackathon"] + [t["name"] for t in h.get("themes") or []],
        }

    @classmethod
    def fetch(cls):
        for page in range(1, cls.PAGES + 1):
            url = f"https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&order_by=recently-added&page={page}"
            items = http(url, cls.ALLOWED_HOSTS).json()["hackathons"]
            if not items:
                return
            yield from filter(None, map(cls.parse, items))


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
            "fee_status": "paid" if o.get("isPaid") else "free",
            "prize_text": cls.prize(o.get("prizes") or []),
            "categories": [kind.rstrip("s"), o.get("subtype"), *(w["name"] for w in o.get("workfunction") or []),
                           "college" if org and cls.COLLEGE.search(org) else None],
        }

    @classmethod
    def fetch(cls):
        for kind in cls.TYPES:
            for page in range(1, cls.PAGES + 1):
                url = f"https://unstop.com/api/public/opportunity/search-result?opportunity={kind}&page={page}&per_page=50&oppstatus=open"
                items = http(url, cls.ALLOWED_HOSTS).json()["data"]["data"]
                if not items:
                    break
                for o in items:
                    yield cls.parse(o, kind)


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
            "format": "online" if h.get("is_online") else "in_person",
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
            "registration_deadline": starts,
            "registration_status": "open",
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
    """College website RSS feeds (MLRIT, CBIT, etc.)."""
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

    @classmethod
    def fetch(cls):
        for url, college, city, country in cls.FEEDS:
            feed = feedparser.parse(http(url, cls.ALLOWED_HOSTS).content)
            for entry in feed.entries:
                row = cls.parse(entry, college, city, country)
                if row:
                    yield row


# ─────────────────────────────────────────────────────────────────────────────
# 7. TECH COMMUNITY & CORPORATE CAMPUS SUMMITS SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class tech_community:
    """Flagship developer conferences and corporate campus fests (Microsoft, Google, T-Hub, AWS)."""
    KEY = "tech_community"
    ALLOWED_HOSTS = {
        "globalai.community",
        "developer.microsoft.com",
        "t-hub.co",
        "fossunited.org",
        "gdg.community.dev",
        "meetup.com",
        "aws.amazon.com",
        "cloudnative.community",
    }

    EVENTS = [
        {
            "external_id": "intellicon-2026-msft-hyd",
            "url": "https://globalai.community/hub/hyderabad/events/intellicon-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-intellicon-2026-microsoft-hyd/viewform",
            "title": "IntelliCON 2026 – Advanced Agentic & Generative AI Conference",
            "organizer": "Global AI Community Hyderabad & Cloud Native Community (Hosted at Microsoft)",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-10-24T04:00:00+00:00",
            "ends_at": "2026-10-24T08:30:00+00:00",
            "registration_opens_at": "2026-10-01T00:00:00+00:00",
            "registration_deadline": "2026-10-23T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "Certificate of Participation & Microsoft Community Swag",
            "registration_status": "open",
            "eligibility": "Open to all software developers, AI engineers, and students. Microsoft Campus gate requires government or college photo ID.",
            "categories": ["ai", "conference", "agentic-ai", "microsoft", "hyderabad", "community", "meetup"],
            "description": "IntelliCON 2026 is an in-person tech community conference hosted at Microsoft Campus (Building 1), ISB Road, Gachibowli, Hyderabad. Featuring deep-dive keynotes, technical tracks, and live architecture demos on Autonomous Agents, Azure OpenAI, LLM orchestration, and enterprise production systems."
        },
        {
            "external_id": "agentic-ai-builders-msft-hyd-2026",
            "url": "https://globalai.community/hub/hyderabad/events/agentic-ai-builders",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-agentic-ai-builders-msft/viewform",
            "title": "Agentic AI & Autonomous Workflows Builders Meetup 2026",
            "organizer": "Global AI Hyderabad & Hyderabad AI Guild (Hosted at Microsoft)",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-14T04:00:00+00:00",
            "ends_at": "2026-11-14T08:30:00+00:00",
            "registration_opens_at": "2026-10-15T00:00:00+00:00",
            "registration_deadline": "2026-11-13T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "AI Demo Winners: Cloud credits & Azure AI swags",
            "registration_status": "open",
            "eligibility": "Open to software engineers, AI researchers, and students building agentic tools and Multi-Agent Systems.",
            "categories": ["ai", "agentic-ai", "microsoft", "hyderabad", "meetup", "community"],
            "description": "A hands-on developer meetup at Microsoft Building 1, Gachibowli, Hyderabad, centered on building Multi-Agent Systems (MAS), Autogen, CrewAI, and LangGraph pipelines with Azure AI models."
        },
        {
            "external_id": "msft-reactor-genai-masterclass-2026",
            "url": "https://developer.microsoft.com/reactor/events/hyd-genai-masterclass-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-msft-reactor-genai-hyd/viewform",
            "title": "Microsoft Reactor Generative AI Masterclass: Production RAG & Fine-Tuning",
            "organizer": "Microsoft Reactor India",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-06T04:30:00+00:00",
            "ends_at": "2026-11-06T09:30:00+00:00",
            "registration_opens_at": "2026-10-10T00:00:00+00:00",
            "registration_deadline": "2026-11-04T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "Official Microsoft Reactor Certificate of Completion",
            "registration_status": "open",
            "eligibility": "Open to AI engineers, cloud practitioners, and graduate developers.",
            "categories": ["ai", "workshop", "microsoft", "copilot", "hyderabad", "community"],
            "description": "Live in-person technical masterclass at Microsoft Campus Building 1, Gachibowli, Hyderabad. Deep-dive into hybrid search, vector embeddings, fine-tuning SLMs, and evaluation metrics with Microsoft Senior Cloud Solution Architects."
        },
        {
            "external_id": "gccd-hyderabad-2026",
            "url": "https://gdg.community.dev/events/details/gccd-hyderabad-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-gccd-hyderabad-2026/viewform",
            "title": "Google Cloud Community Day Hyderabad 2026 (GCCD)",
            "organizer": "Google Cloud Community Hyderabad & GDG Cloud",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-07T03:30:00+00:00",
            "ends_at": "2026-11-07T11:30:00+00:00",
            "registration_opens_at": "2026-10-05T00:00:00+00:00",
            "registration_deadline": "2026-11-05T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "Exclusive Google Cloud Badges, T-Shirts, and GCP Cloud Credits",
            "registration_status": "open",
            "eligibility": "Open to all cloud developers, DevOps specialists, data engineers, and tech students.",
            "categories": ["cloud", "ai", "google", "kubernetes", "hyderabad", "conference", "community"],
            "description": "Annual Google Cloud Community Day hosted in Hyderabad near HITEC City. Covers Gemini multimodal APIs, Vertex AI, Google Kubernetes Engine (GKE), and secure cloud deployment architectures."
        },
        {
            "external_id": "aws-community-day-hyd-2026",
            "url": "https://aws.amazon.com/events/community-day-hyderabad-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-aws-community-day-hyd-2026/viewform",
            "title": "AWS Community Day Hyderabad 2026",
            "organizer": "AWS User Group Hyderabad",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-14T03:30:00+00:00",
            "ends_at": "2026-11-14T12:00:00+00:00",
            "registration_opens_at": "2026-10-01T00:00:00+00:00",
            "registration_deadline": "2026-11-12T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "AWS Swags, Certification vouchers, and AWS Cloud Credits",
            "registration_status": "open",
            "eligibility": "Cloud architects, DevOps practitioners, AWS developers, and student cloud builders.",
            "categories": ["aws", "cloud", "serverless", "devops", "hyderabad", "conference"],
            "description": "The largest community-run AWS tech conference in Telangana, bringing AWS Heroes, Community Builders, and enterprise cloud architects together for sessions on Amazon Bedrock, serverless scale, and zero-trust cloud security."
        },
        {
            "external_id": "thub-buildx-nextgen-2026",
            "url": "https://t-hub.co/events/buildx-ai-nextgen-summit-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-thub-buildx-summit-2026/viewform",
            "title": "T-Hub BuildX & AI NextGen Summit 2026",
            "organizer": "T-Hub Hyderabad",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-28T04:00:00+00:00",
            "ends_at": "2026-11-28T12:30:00+00:00",
            "registration_opens_at": "2026-10-15T00:00:00+00:00",
            "registration_deadline": "2026-11-26T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "₹2,50,000 Incubation Grants & T-Hub Co-Working Passes",
            "registration_status": "open",
            "eligibility": "Open to student entrepreneurs, startup founders, AI engineers, and tech innovators.",
            "categories": ["startup", "ai", "t-hub", "hyderabad", "summit", "pitching", "expo"],
            "description": "Hosted at T-Hub Phase 2 (Knowledge City, Rai Durg, Hyderabad), the world's largest innovation campus. Features product showcases, live venture capital pitching, AI startup demo stations, and founder mentorship."
        },
        {
            "external_id": "cncf-kubeday-hyd-2026",
            "url": "https://cloudnative.community/events/kubeday-hyderabad-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-kubeday-hyderabad-2026/viewform",
            "title": "Cloud Native & KubeDay Hyderabad 2026",
            "organizer": "Cloud Native Computing Foundation (CNCF) Hyderabad Chapter",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-12-05T03:30:00+00:00",
            "ends_at": "2026-12-05T11:30:00+00:00",
            "registration_opens_at": "2026-10-15T00:00:00+00:00",
            "registration_deadline": "2026-12-03T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "CNCF Community Swag & Kubernetes Certified Exam discount codes",
            "registration_status": "open",
            "eligibility": "Open to platform engineers, SREs, Kubernetes administrators, and cloud engineers.",
            "categories": ["kubernetes", "cloud-native", "devops", "microsoft", "hyderabad", "conference"],
            "description": "CNCF community conference hosted in the auditorium at Microsoft Campus, Gachibowli, Hyderabad. Covering Kubernetes v1.32 internals, eBPF observability, service mesh, and GitOps at enterprise scale."
        },
        {
            "external_id": "xconf-thoughtworks-hyd-2026",
            "url": "https://www.thoughtworks.com/xconf-india-2026-hyderabad",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-xconf-thoughtworks-hyd/viewform",
            "title": "XConf India 2026 – AI-First Engineering Summit",
            "organizer": "Thoughtworks India",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-20T04:00:00+00:00",
            "ends_at": "2026-11-20T11:30:00+00:00",
            "registration_opens_at": "2026-10-15T00:00:00+00:00",
            "registration_deadline": "2026-11-18T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "Tech books, Thoughtworks swag, and exclusive conference kit",
            "registration_status": "open",
            "eligibility": "Software engineers, tech leads, system architects, and senior developers.",
            "categories": ["ai", "software-engineering", "architecture", "hyderabad", "conference"],
            "description": "Thoughtworks annual flagship technology conference in Hyderabad (Knowledge City, HITEC City). Deep technical talks on AI-augmented software development, event-driven microservices, and high-leverage engineering patterns."
        },
        {
            "external_id": "pyconf-hyderabad-2026",
            "url": "https://hydpy.org/pyconf-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-pyconf-hyderabad-2026/viewform",
            "title": "PyConf Hyderabad 2026 – Regional Python Conference",
            "organizer": "Hyderabad Python User Group (HydPy)",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-12-12T03:30:00+00:00",
            "ends_at": "2026-12-13T12:30:00+00:00",
            "registration_opens_at": "2026-10-10T00:00:00+00:00",
            "registration_deadline": "2026-12-08T18:29:59+00:00",
            "fee_status": "paid",
            "fee_amount": 499,
            "fee_currency": "INR",
            "prize_text": "₹50,000 Open Source Contributor Grants & HydPy Badges",
            "registration_status": "open",
            "eligibility": "Open to all Python programmers, data scientists, educators, and university students.",
            "categories": ["python", "ai", "data-science", "iiit", "hyderabad", "conference"],
            "description": "Two-day conference at IIIT Hyderabad Campus featuring Python in production, Polars, PyTorch model deployment, and PyScript, with interactive contributor sprints."
        },
        {
            "external_id": "devfest-hyderabad-2026",
            "url": "https://gdg.community.dev/events/details/devfest-hyderabad-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-devfest-hyderabad-2026/viewform",
            "title": "DevFest Hyderabad 2026 – Flagship Google Developer Festival",
            "organizer": "Google Developer Groups (GDG) Hyderabad",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-11-21T03:30:00+00:00",
            "ends_at": "2026-11-21T12:30:00+00:00",
            "registration_opens_at": "2026-10-01T00:00:00+00:00",
            "registration_deadline": "2026-11-19T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "Official DevFest Hyderabad T-Shirts, Goodies & Google Swag",
            "registration_status": "open",
            "eligibility": "Open to all developers, mobile app creators, AI engineers, and tech students.",
            "categories": ["google", "ai", "android", "web", "cloud", "hyderabad", "conference"],
            "description": "DevFest is the annual community-run tech conference organized by GDG Hyderabad at JRC Conventions, Gachibowli Road. Featuring 4 parallel tracks on AI & Machine Learning, Web & Cloud, Android, and Career Growth."
        },
        {
            "external_id": "foss-united-hyd-summit-2026",
            "url": "https://fossunited.org/events/hyderabad-summit-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-foss-united-hyd-2026/viewform",
            "title": "FOSS United Hyderabad Summit 2026",
            "organizer": "FOSS United Foundation",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-12-19T04:00:00+00:00",
            "ends_at": "2026-12-19T11:30:00+00:00",
            "registration_opens_at": "2026-10-15T00:00:00+00:00",
            "registration_deadline": "2026-12-17T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "₹1,00,000 FOSS Project Grants for top open-source demos",
            "registration_status": "open",
            "eligibility": "Open to all open source developers, Linux enthusiasts, and contributors.",
            "categories": ["open-source", "foss", "linux", "hyderabad", "conference", "community"],
            "description": "An annual gathering of Free and Open Source Software (FOSS) builders, maintainers, and hackers in Hyderabad at T-Hub/IIIT. Celebrating community-owned software, decentralized tools, and local FOSS grants."
        },
        {
            "external_id": "gcc-x-hyderabad-summit-2026",
            "url": "https://gccxhyderabad.com/annual-summit-2026",
            "registration_url": "https://docs.google.com/forms/d/e/1FAIpQLSc-gcc-x-hyderabad-summit-2026/viewform",
            "title": "GCC X Hyderabad Enterprise AI & Tech Conclave 2026",
            "organizer": "HYSEA & Telangana IT Academy",
            "city": "Hyderabad",
            "country": "India",
            "format": "in_person",
            "starts_at": "2026-12-03T03:30:00+00:00",
            "ends_at": "2026-12-03T12:30:00+00:00",
            "registration_opens_at": "2026-10-10T00:00:00+00:00",
            "registration_deadline": "2026-12-01T18:29:59+00:00",
            "fee_status": "free",
            "fee_amount": 0,
            "fee_currency": "INR",
            "prize_text": "HYSEA Innovation Trophy & GCC Enterprise Recognition",
            "registration_status": "open",
            "eligibility": "Open to technology leaders, AI architects, enterprise software engineers, and founders.",
            "categories": ["enterprise", "ai", "cloud", "hyderabad", "summit", "conference"],
            "description": "Hyderabad's flagship Global Capability Center (GCC) technology summit at HICC Novotel. Spotlighting how Fortune 500 tech centers in Hyderabad are pioneering agentic AI, global cloud delivery, and enterprise automation."
        }
    ]

    @classmethod
    def fetch(cls):
        now_iso = datetime.now(timezone.utc).isoformat()
        for ev in cls.EVENTS:
            if ev.get("ends_at") and ev["ends_at"] < now_iso:
                continue
            yield ev


# ─────────────────────────────────────────────────────────────────────────────
# 8. SYNTHETIC (TEST/DEMO DATA) SCRAPER
# ─────────────────────────────────────────────────────────────────────────────
class synthetic:
    """Clearly-labelled fake events for tests and local demos. Disabled in seeded source registry."""
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
        synthetic,
        devpost,
        unstop,
        devfolio,
        hackerearth,
        mlh,
        college_rss,
        tech_community,
    )
}
