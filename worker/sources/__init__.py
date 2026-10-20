"""Unified scrapers re-exports.
All scrapers have been consolidated into the single module `worker/scrapers.py`.
This module maintains backward compatibility for any existing imports from `sources`.
"""
from scrapers import (
    REGISTRY,
    college_rss,
    devfolio,
    devpost,
    hackerearth,
    mlh,
    synthetic,
    tech_community,
    unstop,
)

__all__ = [
    "REGISTRY",
    "college_rss",
    "devfolio",
    "devpost",
    "hackerearth",
    "mlh",
    "synthetic",
    "tech_community",
    "unstop",
]
