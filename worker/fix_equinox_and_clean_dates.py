"""1. Replace old Equinox with authentic 'The Equinox 2.0' (Oct 30-31, 2026 at MLRIT)
   with real portal 'https://equinox-2.0.mlritcie.in' and exact pass details.
2. Clean out any events whose ends_at or registration_deadline has already passed.
3. Sync both Supabase and data/store.json.
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

REAL_EQUINOX = {
    "external_id": "mlrit-equinox-2-0",
    "title": "The Equinox 2.0 – Annual E-Summit 2026",
    "url": "https://mlritcie.in/events",
    "registration_url": "https://equinox-2.0.mlritcie.in",
    "organizer": "Centre for Innovation & Entrepreneurship (CIE), MLRIT",
    "city": "Hyderabad",
    "country": "India",
    "format": "in_person",
    "starts_at": "2026-10-30T03:30:00+00:00",
    "ends_at": "2026-10-31T15:30:00+00:00",
    "registration_opens_at": "2026-10-01T00:00:00+00:00",
    "registration_deadline": "2026-10-29T18:29:59+00:00",
    "fee_status": "paid",
    "fee_amount": 769,
    "fee_currency": "INR",
    "prize_text": "₹1,50,000+ Cash & Incubation Grants",
    "registration_status": "open",
    "eligibility": "Open to all engineering and college students, aspiring entrepreneurs, and innovators. Teams of 4–5 members.",
    "categories": ["college", "startup", "e-summit", "hackathon", "pitching"],
    "description": "The Equinox 2.0 is the premier 2-day national E-Summit organized by the Centre for Innovation & Entrepreneurship (CIE) at MLR Institute of Technology (MLRIT), Dundigal, Hyderabad. Flagship tracks include Startup Expo, Pitch Deck to active venture capitalists and angel investors, IPL Auction strategic bidding simulation, Brand Battles, Crossroads business crisis challenge, Hustle Mania live stall challenge, Startup-Poly board challenge, and exclusive Internship Drive & E-Cell Meet. Evenings feature Stand-up Comedy and Musical Night. Delegate Pass: ₹769. Venue: MLRIT Campus, Dundigal, Gandi Maisamma, Hyderabad 500043."
}

def clean_and_update():
    now_iso = datetime.now(timezone.utc).isoformat()

    # 1. Update Supabase
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        
        # Delete old placeholder equinox
        supabase.table("events").delete().eq("external_id", "mlrit-equinox-2026").execute()
        print("[OK] Removed old mlrit-equinox-2026 placeholder")

        # Get MLRIT source id
        src = supabase.table("event_sources").select("id").eq("key", "mlrit_hyd").execute()
        mlrit_source_id = src.data[0]["id"] if src.data else 15

        # Delete any events that have already ended (ends_at < now_iso)
        ended_res = supabase.table("events").delete().lt("ends_at", now_iso).execute()
        print("[OK] Purged past ended events from Supabase")

        # Delete any events whose registration deadline passed
        expired_res = supabase.table("events").delete().lt("registration_deadline", now_iso).execute()
        print("[OK] Purged expired registration deadline events from Supabase")

        # Upsert The Equinox 2.0
        ev_data = dict(REAL_EQUINOX)
        ev_data["source_id"] = mlrit_source_id
        ev_data["last_checked_at"] = now_iso
        ev_data["first_seen_at"] = now_iso

        existing = supabase.table("events").select("id").eq("external_id", "mlrit-equinox-2-0").execute()
        if existing.data:
            supabase.table("events").update(ev_data).eq("id", existing.data[0]["id"]).execute()
            print("[OK] Updated The Equinox 2.0 in Supabase")
        else:
            supabase.table("events").insert(ev_data).execute()
            print("[+] Inserted The Equinox 2.0 in Supabase")

    # 2. Update local store
    if DATA_PATH.exists():
        with open(DATA_PATH, "r", encoding="utf-8") as f:
            store = json.load(f)

        events = store.get("events", [])
        
        # Filter out old equinox, expired, and past events
        valid_events = []
        for e in events:
            if e.get("external_id") == "mlrit-equinox-2026":
                continue
            if e.get("ends_at") and e["ends_at"] < now_iso:
                continue
            if e.get("registration_deadline") and e["registration_deadline"] < now_iso:
                continue
            valid_events.append(e)

        # Check if mlrit-equinox-2-0 is present
        found = False
        for e in valid_events:
            if e.get("external_id") == "mlrit-equinox-2-0":
                e.update(REAL_EQUINOX)
                e["last_checked_at"] = now_iso
                found = True
                break

        if not found:
            max_id = max((e.get("id", 0) for e in valid_events), default=0) + 1
            new_e = dict(REAL_EQUINOX)
            new_e["id"] = max_id
            new_e["last_checked_at"] = now_iso
            new_e["first_seen_at"] = now_iso
            valid_events.insert(0, new_e) # Put at the top!

        store["events"] = valid_events
        with open(DATA_PATH, "w", encoding="utf-8") as f:
            json.dump(store, f, indent=2, ensure_ascii=False)
        print(f"[OK] Local store updated: {len(valid_events)} active future events.")

if __name__ == "__main__":
    clean_and_update()
