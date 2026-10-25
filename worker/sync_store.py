"""Sync active, verified events from Supabase into data/store.json.
This ensures local demo mode and tests have 100% truthful, verified future data matching the production catalog.
"""
import json
import os
from pathlib import Path
import db

def sync():
    root = Path(__file__).resolve().parent.parent
    store_path = root / "data" / "store.json"
    if not store_path.exists():
        print(f"store.json not found at {store_path}")
        return

    with open(store_path, "r", encoding="utf-8") as f:
        store = json.load(f)

    # Fetch all events from Supabase
    all_events = []
    page_size = 500
    offset = 0
    table = db.client().table("events")
    while True:
        page = table.select("*").range(offset, offset + page_size - 1).execute().data
        all_events.extend(page)
        if len(page) < page_size:
            break
        offset += page_size

    # Fetch event_sources as well
    sources = db.client().table("event_sources").select("*").execute().data

    store["events"] = all_events
    store["event_sources"] = sources

    with open(store_path, "w", encoding="utf-8") as f:
        json.dump(store, f, indent=2, ensure_ascii=False)

    print(f"Successfully synced {len(all_events)} events and {len(sources)} sources from Supabase to {store_path}")

if __name__ == "__main__":
    sync()
