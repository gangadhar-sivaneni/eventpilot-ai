"""Supabase access for the trusted worker (secret key: bypasses RLS, so never ship it to a browser)."""
import os
from datetime import datetime, timedelta, timezone
from functools import cache

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

STALE_JOB = timedelta(hours=1)  # a "running" job older than this is assumed crashed


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


@cache
def client() -> Client:
    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SECRET_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SECRET_KEY (see worker/.env.example)")
    return create_client(url, key)


def start_job(kind: str, scope: str = "") -> int | None:
    """Claim the (kind, scope) slot. Returns the job id, or None if another run holds it."""
    db = client()
    db.table("automation_jobs").update({"status": "failed", "error": "stale: assumed crashed", "finished_at": iso(now())}) \
        .eq("status", "running").lt("started_at", iso(now() - STALE_JOB)).execute()
    try:
        row = db.table("automation_jobs").insert({"kind": kind, "scope": scope}).execute().data[0]
    except Exception as err:  # unique index automation_jobs_one_running
        if "23505" in str(err) or "duplicate" in str(err).lower():
            return None
        raise
    return row["id"]


def finish_job(job_id: int, counts: dict, error: str | None = None) -> None:
    client().table("automation_jobs").update({
        "status": "failed" if error else "succeeded",
        "counts": counts,
        "error": error[:1000] if error else None,
        "finished_at": iso(now()),
    }).eq("id", job_id).execute()


def last_success(kind: str) -> datetime | None:
    rows = client().table("automation_jobs").select("started_at").eq("kind", kind).eq("status", "succeeded") \
        .order("started_at", desc=True).limit(1).execute().data
    return datetime.fromisoformat(rows[0]["started_at"]) if rows else None


def audit(action: str, user_id: str | None = None, **details) -> None:
    """Security-relevant actions only. Never pass form values, tokens or emails here."""
    client().table("audit_logs").insert({"action": action, "user_id": user_id, "details": details}).execute()


def chunks(items: list, size: int = 100):
    for i in range(0, len(items), size):
        yield items[i:i + size]
