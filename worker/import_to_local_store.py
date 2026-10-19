"""Import live events directly from real sources (Devpost, Unstop, Devfolio, etc.)
into data/store.json so the website immediately displays real, live worldwide events.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add current dir to path
sys.path.insert(0, str(Path(__file__).parent))

from normalize import normalize
from sources import devpost, unstop, devfolio, college_rss

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "store.json"

def run_import():
    if not DATA_PATH.exists():
        print(f"Error: {DATA_PATH} not found")
        return

    with open(DATA_PATH, "r", encoding="utf-8") as f:
        store = json.load(f)

    events = store.get("events", [])
    existing_urls = {e["url"]: e for e in events if "url" in e}
    now = datetime.now(timezone.utc)
    max_id = max([e.get("id", 0) for e in events] + [0])

    sources_map = {
        "devpost": 1,
        "unstop": 2,
        "devfolio": 3,
        "hackerearth": 4,
        "mlh": 5,
        "college_rss": 6,
    }

    fetched_sources = [
        ("devpost", devpost),
        ("unstop", unstop),
        ("devfolio", devfolio),
        ("college_rss", college_rss),
    ]

    new_events_count = 0
    updated_events_count = 0

    for key, mod in fetched_sources:
        print(f"Fetching live events from {key}...")
        source_id = sources_map.get(key, 1)
        try:
            raw_items = list(mod.fetch())
            print(f"  Received {len(raw_items)} items from {key}")
            for raw in raw_items:
                norm, reason = normalize(raw, now)
                if not norm:
                    continue
                url = norm["url"]
                norm["source_id"] = source_id
                if url in existing_urls:
                    existing_urls[url].update({k: v for k, v in norm.items() if v is not None})
                    updated_events_count += 1
                else:
                    max_id += 1
                    norm["id"] = max_id
                    events.append(norm)
                    existing_urls[url] = norm
                    new_events_count += 1
        except Exception as e:
            print(f"  Error fetching {key}: {e}")

    store["events"] = events

    # Update source stats
    for s in store.get("event_sources", []):
        s_key = s.get("key")
        if s_key in sources_map:
            s["last_checked_at"] = now.isoformat()
            s["last_success_at"] = now.isoformat()
            s["last_error"] = None

    with open(DATA_PATH, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2)

    print(f"\nImport finished! Added {new_events_count} new live events, updated {updated_events_count}. Total events now: {len(events)}")

if __name__ == "__main__":
    run_import()
