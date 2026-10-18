"""Email delivery from the alert outbox (event_alerts.emailed_at is null).

In-app alerts are the source of truth; email is a retryable copy. One digest per user per run.
Without Gmail credentials this exits quietly, so in-app alerts keep working.
Usage: python notify.py
"""
import os
import smtplib
from email.message import EmailMessage

import db

MAX_ATTEMPTS = 5
TYPE_LABEL = {"new_event": "New", "registration_opened": "Opened", "deadline_reminder": "Closing soon",
              "availability_changed": "Changed"}


def digest(alerts: list[dict], site_url: str) -> str:
    lines = []
    for a in sorted(alerts, key=lambda a: a["alert_type"] != "deadline_reminder"):  # urgent first
        ev = a.get("events") or {}
        lines.append(f"[{TYPE_LABEL[a['alert_type']]}] {a['message']}\n   {site_url}/events/{a['event_id']}"
                     + (f"\n   Official page: {ev['url']}" if ev.get("url") else ""))
    return ("\n\n".join(lines) + f"\n\nAll alerts: {site_url}/alerts\n"
            f"Turn email off: {site_url}/profile (Interests and alerts)\n")


def main() -> None:
    user, password = os.environ.get("GMAIL_USER"), os.environ.get("GMAIL_APP_PASSWORD")
    if not user or not password:
        print("notify: GMAIL_USER / GMAIL_APP_PASSWORD not set, skipping email (in-app alerts unaffected)")
        return
    site = os.environ.get("SITE_URL", "http://localhost:3000").rstrip("/")
    job = db.start_job("notify")
    if job is None:
        print("notify: another run is in progress")
        return
    client = db.client()
    counts, error = {"sent": 0, "failed": 0, "skipped_opt_out": 0}, None
    try:
        pending = client.table("event_alerts").select("id, user_id, event_id, alert_type, message, email_attempts, events(url)") \
            .is_("emailed_at", "null").lt("email_attempts", MAX_ATTEMPTS).order("created_at").limit(2000).execute().data
        by_user: dict[str, list[dict]] = {}
        for a in pending:
            by_user.setdefault(a["user_id"], []).append(a)
        ids = list(by_user)
        prefs, emails = {}, {}
        for batch in db.chunks(ids, 200):
            prefs.update({p["user_id"]: p["email_alerts"] for p in
                          client.table("user_preferences").select("user_id, email_alerts").in_("user_id", batch).execute().data})
            emails.update({p["user_id"]: p["email"] for p in
                           client.table("profiles").select("user_id, email").in_("user_id", batch).execute().data})

        with smtplib.SMTP_SSL("smtp.gmail.com", 465, timeout=30) as smtp:
            smtp.login(user, password)
            for uid, alerts in by_user.items():
                alert_ids = [a["id"] for a in alerts]
                if not prefs.get(uid) or not emails.get(uid):
                    # email handling is done for these: the user opted out (in-app alert still shows)
                    client.table("event_alerts").update({"emailed_at": db.iso(db.now())}).in_("id", alert_ids).execute()
                    counts["skipped_opt_out"] += 1
                    continue
                msg = EmailMessage()
                msg["From"], msg["To"] = user, emails[uid]
                msg["Subject"] = f"EventPilot: {len(alerts)} new alert{'s' if len(alerts) > 1 else ''}"
                msg.set_content(digest(alerts, site))
                try:
                    smtp.send_message(msg)
                    client.table("event_alerts").update({"emailed_at": db.iso(db.now())}).in_("id", alert_ids).execute()
                    counts["sent"] += 1
                except smtplib.SMTPException as err:
                    counts["failed"] += 1
                    print(f"notify: send failed for one user: {type(err).__name__}")  # no address in logs
                    for attempts in {a["email_attempts"] for a in alerts}:
                        client.table("event_alerts").update({"email_attempts": attempts + 1}) \
                            .in_("id", [a["id"] for a in alerts if a["email_attempts"] == attempts]).execute()
    except Exception as err:
        error = f"{type(err).__name__}: {err}"
    db.finish_job(job, counts, error)
    print(f"notify: {'FAILED ' + error if error else 'ok'} {counts}")
    if error:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
