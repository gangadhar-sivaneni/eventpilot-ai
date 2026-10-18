"""Matching worker: turn catalogue changes into deduplicated in-app alerts.

Deterministic rules only. unique(user_id, event_id, alert_type) makes every re-run harmless.
Usage: python match_users.py
"""
import re
from datetime import datetime, timedelta

import db

FIRST_RUN_LOOKBACK = timedelta(days=1)
REMINDER_WINDOW = timedelta(hours=24)


def matches(prefs: dict, e: dict, now: datetime) -> bool:
    """Does event e fit a user's preferences? Unknown values never pass a strict filter."""
    if e["registration_status"] == "closed":
        return False
    if e.get("registration_deadline") and datetime.fromisoformat(e["registration_deadline"]) < now:
        return False
    if prefs["categories"]:
        title = e["title"].lower()
        if not (set(prefs["categories"]) & set(e["categories"])
                or any(re.search(rf"\b{re.escape(c)}\b", title) for c in prefs["categories"])):
            return False
    online = e["format"] == "online"  # online events are reachable from any country or city
    if prefs["countries"] and not online and (e.get("country") or "").lower() not in {c.lower() for c in prefs["countries"]}:
        return False
    if prefs["cities"] and not online and not any(c.lower() in (e.get("city") or "").lower() for c in prefs["cities"]):
        return False
    if prefs["formats"] and e["format"] not in prefs["formats"]:
        return False
    if prefs.get("max_fee") is not None:
        if e["fee_status"] == "unknown":
            return False  # unknown is never treated as free or cheap
        # ponytail: compares amounts across currencies; add FX conversion when users mix currencies
        if e["fee_status"] == "paid" and (e.get("fee_amount") is None or float(e["fee_amount"]) > float(prefs["max_fee"])):
            return False
    if prefs["prize_only"] and not e.get("prize_text"):
        return False
    return True


def alert(user_id: str, e: dict, kind: str) -> dict:
    text = {
        "new_event": f"New match: {e['title']}" + (f" (prize {e['prize_text']})" if e.get("prize_text") else ""),
        "registration_opened": f"Registration is now open for {e['title']}",
        "deadline_reminder": f"Registration for {e['title']} closes within 24 hours",
        "availability_changed": f"{e['title']}: registration status changed to {e['registration_status']}",
    }[kind]
    return {"user_id": user_id, "event_id": e["id"], "alert_type": kind, "message": text}


def build_alerts(prefs_list, new_events, changed_events, closing_events, interested: dict[int, set[str]], now) -> list[dict]:
    """Pure: decide which alerts to create. interested = event_id -> users with a registration or earlier alert."""
    out = []
    for p in prefs_list:
        uid = p["user_id"]
        if p["alert_new_event"]:
            out += [alert(uid, e, "new_event") for e in new_events if matches(p, e, now)]
        for e in changed_events:
            involved = uid in interested.get(e["id"], set()) or matches(p, e, now)
            if not involved:
                continue
            if e["registration_status"] == "open" and p["alert_registration_opened"]:
                out.append(alert(uid, e, "registration_opened"))
            elif e["registration_status"] != "open" and p["alert_availability_changed"] and uid in interested.get(e["id"], set()):
                out.append(alert(uid, e, "availability_changed"))
        if p["alert_deadline_reminder"]:
            out += [alert(uid, e, "deadline_reminder") for e in closing_events if uid in interested.get(e["id"], set())]
    return out


def main() -> None:
    job = db.start_job("match")
    if job is None:
        print("match: another run is in progress")
        return
    counts, error = {}, None
    try:
        client, now = db.client(), db.now()
        since = db.iso(db.last_success("match") or now - FIRST_RUN_LOOKBACK)
        cols = "id, title, categories, country, city, format, fee_status, fee_amount, prize_text, registration_status, registration_deadline"
        new_events = client.table("events").select(cols).gt("first_seen_at", since).limit(5000).execute().data
        changed = client.table("events").select(cols).gt("status_changed_at", since).limit(5000).execute().data
        closing = client.table("events").select(cols).gte("registration_deadline", db.iso(now)) \
            .lte("registration_deadline", db.iso(now + REMINDER_WINDOW)).limit(5000).execute().data
        prefs = client.table("user_preferences").select("*").execute().data

        watched_ids = list({e["id"] for e in changed + closing})
        interested: dict[int, set[str]] = {}
        for batch in db.chunks(watched_ids, 200):
            regs = client.table("registrations").select("user_id, event_id").in_("event_id", batch) \
                .in_("status", ["not_started", "prepared", "awaiting_approval"]).execute().data
            seen = client.table("event_alerts").select("user_id, event_id").in_("event_id", batch) \
                .eq("alert_type", "new_event").execute().data
            for r in regs + seen:
                interested.setdefault(r["event_id"], set()).add(r["user_id"])

        alerts = build_alerts(prefs, new_events, changed, closing, interested, now)
        for batch in db.chunks(alerts, 500):
            client.table("event_alerts").upsert(batch, on_conflict="user_id,event_id,alert_type",
                                                ignore_duplicates=True, returning="minimal").execute()
        counts = {"new_events": len(new_events), "changed": len(changed), "closing": len(closing),
                  "users": len(prefs), "alerts_proposed": len(alerts)}
    except Exception as err:
        error = f"{type(err).__name__}: {err}"
    db.finish_job(job, counts, error)
    print(f"match: {'FAILED ' + error if error else 'ok'} {counts}")
    if error:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
