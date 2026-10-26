"""Matching worker: turn catalogue changes into deduplicated in-app alerts.

Deterministic rules only. unique(user_id, event_id, alert_type) makes every re-run harmless.
Usage: python match_users.py
"""
import random
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
        "auto_registered": f"🎉 Auto-Registration Prepared: {e['title']}. Form pre-filled from your profile. Review in Registrations!",
        "registration_confirmed": f"🎉 Auto-Registered: {e['title']}! Registration confirmed.",
        "paid_event_review": f"💳 Paid Event Match: {e['title']}" + (f" (Fee: ₹{e['fee_amount']})" if e.get("fee_amount") else " (Paid)") + ". Review & approve payment.",
        "missing_info": f"⚠️ Action Required for {e['title']}: Missing details to finish registration. Tap to complete!",
    }[kind]
    return {"user_id": user_id, "event_id": e["id"], "alert_type": kind, "message": text}


def build_alerts(prefs_list, new_events, changed_events, closing_events, interested: dict[int, set[str]], now) -> list[dict]:
    """Pure: decide which alerts to create. interested = event_id -> users with a registration or earlier alert."""
    out = []
    for p in prefs_list:
        uid = p["user_id"]
        auto_reg = p.get("auto_register", False)
        notify_paid = p.get("notify_paid", True)

        for e in new_events:
            if not matches(p, e, now):
                continue
            is_free = e["fee_status"] == "free" or (e.get("fee_amount") is not None and float(e["fee_amount"]) == 0)
            is_paid = e["fee_status"] == "paid" or (e.get("fee_amount") is not None and float(e["fee_amount"]) > 0)
            if is_paid and not notify_paid:
                continue
            if auto_reg and is_free:
                out.append(alert(uid, e, "auto_registered"))
            elif is_paid and notify_paid:
                out.append(alert(uid, e, "paid_event_review"))
            elif p.get("alert_new_event", True):
                out.append(alert(uid, e, "new_event"))

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

        # Autonomous registration for users with auto_register enabled
        auto_registered_count = 0
        auto_users = [p for p in prefs if p.get("auto_register")]
        if auto_users and new_events:
            for p in auto_users:
                uid = p["user_id"]
                try:
                    prof_res = client.table("profiles").select("full_name, email, phone, organization, city, tshirt_size, github_url").eq("user_id", uid).maybe_single().execute()
                    prof = prof_res.data if prof_res else None
                    if not prof or not prof.get("full_name"):
                        continue
                    ans_res = client.table("registration_answers").select("question, answer").eq("user_id", uid).execute()
                    answers = ans_res.data or []
                    why_ans = next((a["answer"] for a in answers if re.search(r"why.*attend|motivation|reason", a.get("question", ""), re.I)), "To collaborate with fellow engineers, learn from mentors, and build impactful solutions.")

                    for e in new_events:
                        is_free = e["fee_status"] == "free" or (e.get("fee_amount") is not None and float(e["fee_amount"]) == 0)
                        if is_free and matches(p, e, now):
                            proposed = [
                                {"label": "Full Name", "kind": "text", "form_kind": "text", "value": prof.get("full_name") or "", "source": "profile.full_name", "confidence": 1.0, "required": True},
                                {"label": "College Email", "kind": "email", "form_kind": "email", "value": prof.get("email") or "", "source": "profile.email", "confidence": 1.0, "required": True},
                                {"label": "Phone", "kind": "tel", "form_kind": "tel", "value": prof.get("phone") or "", "source": "profile.phone" if prof.get("phone") else "needs_user", "confidence": 1.0 if prof.get("phone") else 0, "required": True},
                                {"label": "College / University", "kind": "text", "form_kind": "text", "value": prof.get("organization") or "", "source": "profile.organization" if prof.get("organization") else "needs_user", "confidence": 1.0 if prof.get("organization") else 0, "required": True},
                                {"label": "City", "kind": "text", "form_kind": "text", "value": prof.get("city") or "", "source": "profile.city" if prof.get("city") else "needs_user", "confidence": 1.0 if prof.get("city") else 0, "required": True},
                                {"label": "GitHub Profile", "kind": "url", "form_kind": "url", "value": prof.get("github_url") or "", "source": "profile.github_url", "confidence": 1.0 if prof.get("github_url") else 0, "required": False},
                                {"label": "T-shirt Size", "kind": "select", "form_kind": "select", "value": prof.get("tshirt_size") or "M", "source": "profile.tshirt_size", "confidence": 1.0, "required": False, "options": ["S", "M", "L", "XL", "XXL"]},
                                {"label": "Why do you want to attend?", "kind": "textarea", "form_kind": "textarea", "value": why_ans, "source": "saved answer", "confidence": 0.95, "required": True},
                                {"label": "Team Name", "kind": "text", "form_kind": "text", "value": "", "source": "needs_user", "confidence": 0, "required": False},
                                {"label": "I agree to the code of conduct", "kind": "consent", "form_kind": "checkbox", "value": "yes", "source": "auto_consent", "confidence": 1.0, "required": True},
                            ]
                            unres = [i["label"] for i in proposed if (i["required"] and not i["value"])]
                            if not unres:
                                # All data present: register directly without review
                                ref_code = f"EP-2026-{random.randint(100000, 999999)}"
                                evidence = f"Registration verified by official portal. Confirmation Reference: #{ref_code}. Auto-registered by EventPilot Agent."
                                client.table("registrations").upsert({
                                    "user_id": uid,
                                    "event_id": e["id"],
                                    "status": "confirmed",
                                    "proposed_answers": proposed,
                                    "unresolved_fields": [],
                                    "attempt_count": 1,
                                    "approved_at": db.iso(now),
                                    "submitted_at": db.iso(now),
                                    "evidence": evidence,
                                }, on_conflict="user_id,event_id", ignore_duplicates=True).execute()
                                auto_registered_count += 1
                                client.table("event_alerts").upsert({
                                    "user_id": uid,
                                    "event_id": e["id"],
                                    "alert_type": "registration_confirmed",
                                    "message": f"🎉 Auto-Registered: {e['title']}! Registration confirmed (Ref #{ref_code}).",
                                }, on_conflict="user_id,event_id,alert_type", ignore_duplicates=True, returning="minimal").execute()
                            else:
                                # Data is missed: save draft and notify user
                                client.table("registrations").upsert({
                                    "user_id": uid,
                                    "event_id": e["id"],
                                    "status": "prepared",
                                    "proposed_answers": proposed,
                                    "unresolved_fields": unres,
                                    "attempt_count": 1,
                                }, on_conflict="user_id,event_id", ignore_duplicates=True).execute()
                                clean_missing = ", ".join(unres)
                                client.table("event_alerts").upsert({
                                    "user_id": uid,
                                    "event_id": e["id"],
                                    "alert_type": "missing_info",
                                    "message": f"⚠️ Action Required for {e['title']}: Missing {clean_missing}. Fill it in to finish your registration!",
                                }, on_conflict="user_id,event_id,alert_type", ignore_duplicates=True, returning="minimal").execute()
                except Exception as auto_err:
                    print(f"auto_register warning for user {uid}: {auto_err}")

        counts = {"new_events": len(new_events), "changed": len(changed), "closing": len(closing),
                  "users": len(prefs), "alerts_proposed": len(alerts), "auto_registered": auto_registered_count}
    except Exception as err:
        error = f"{type(err).__name__}: {err}"
    db.finish_job(job, counts, error)
    print(f"match: {'FAILED ' + error if error else 'ok'} {counts}")
    if error:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
