"""Source adapters. Each module has KEY, ALLOWED_HOSTS and fetch() -> iterable of raw event dicts
(keys as in the `events` table, values loosely typed). Parsing lives here; validation lives in normalize.py."""
from . import college_rss, devfolio, devpost, hackerearth, mlh, synthetic, tech_community, unstop

REGISTRY = {m.KEY: m for m in (synthetic, devpost, unstop, devfolio, hackerearth, mlh, college_rss, tech_community)}

