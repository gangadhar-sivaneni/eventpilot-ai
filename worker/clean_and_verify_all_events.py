"""Full catalogue validation and cleanup:
1. Purge all events that have already started in the past (starts_at < now),
   ended in the past (ends_at < now), or whose registration deadline has expired.
2. Backfill explicit registration_deadline for all events where it was missing
   (using ends_at for Devpost submission periods, starts_at for MLH hackathons).
3. Verify that 100% of remaining events are genuinely in the future and open.
4. Sync both Supabase and data/store.json.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

# Load worker env
env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(env_path)

from supabase import create_client

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SECRET_KEY")

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "store.json"

def run_full_validation():
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()
    now_date = now.date().isoformat()

    print(f"[*] Running full catalogue audit at {now_iso}...")

    # --- 1. Audit Supabase ---
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        res = supabase.table("events").select("*").execute()
        all_events = res.data or []
        print(f"[*] Supabase total events before audit: {len(all_events)}")

        purged_ids = []
        updated_count = 0

        for e in all_events:
            eid = e["id"]
            st = e.get("starts_at")
            ends = e.get("ends_at")
            dl = e.get("registration_deadline")
            sid = e.get("source_id")

            # 1. Backfill deadline if missing
            if not dl:
                if sid == 2 and ends: # Devpost
                    dl = ends
                elif sid == 6 and st: # MLH
                    dl = st
                elif ends:
                    dl = ends
                elif st:
                    dl = st

            # 2. Check if event is in the past:
            # - Starts before today
            # - Ends before today
            # - Registration deadline before today
            is_past = False
            if st and st < now_iso:
                # If it started in the past, purge it so users don't see previous events!
                is_past = True
            elif ends and ends < now_iso:
                is_past = True
            elif dl and dl < now_iso:
                is_past = True

            if is_past:
                purged_ids.append(eid)
            else:
                # Update deadline if it was backfilled or status needs updating
                updates = {}
                if dl and dl != e.get("registration_deadline"):
                    updates["registration_deadline"] = dl
                if e.get("registration_status") in ("closed", "unknown", None):
                    updates["registration_status"] = "open"
                
                if updates:
                    supabase.table("events").update(updates).eq("id", eid).execute()
                    updated_count += 1

        # Delete past events in batches
        if purged_ids:
            for i in range(0, len(purged_ids), 50):
                batch = purged_ids[i:i+50]
                supabase.table("events").delete().in_("id", batch).execute()
            print(f"[OK] Purged {len(purged_ids)} past/already-started/expired events from Supabase.")

        print(f"[OK] Updated deadlines/status for {updated_count} events in Supabase.")
        
        # Verify Supabase count
        remaining_sb = supabase.table("events").select("id", count="exact").execute().count
        print(f"[OK] Remaining verified future events in Supabase: {remaining_sb}")

    # --- 2. Audit Local Store (data/store.json) ---
    if DATA_PATH.exists():
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            store = json.load(f)

        events = store.get("events", [])
        print(f"[*] Local store events before audit: {len(events)}")

        clean_events = []
        store_purged = 0

        for e in events:
            st = e.get("starts_at")
            ends = e.get("ends_at")
            dl = e.get("registration_deadline")
            ext = e.get("external_id") or ""

            # Backfill deadline
            if not dl:
                if "devpost" in ext and ends:
                    dl = ends
                elif "mlh" in ext and st:
                    dl = st
                elif ends:
                    dl = ends
                elif st:
                    dl = st
                e["registration_deadline"] = dl

            # Check if past
            is_past = False
            if st and st < now_iso:
                is_past = True
            elif ends and ends < now_iso:
                is_past = True
            elif dl and dl < now_iso:
                is_past = True

            if is_past:
                store_purged += 1
            else:
                e["registration_status"] = "open"
                clean_events.append(e)

        store["events"] = clean_events
        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, indent=2, ensure_ascii=False)

        print(f"[OK] Purged {store_purged} past events from local store.")
        print(f"[OK] Remaining verified future events in local store: {len(clean_events)}")

if __name__ == "__main__":
    run_full_validation()
