"""Discovery worker: import events from every enabled source into the catalogue.

Safe to re-run: rows upsert on the canonical URL, one source failing never stops the others,
and each source runs under a job lock so two runs never process it at once.
Usage: python discovery.py [source_key ...]
"""
import sys
import time
import traceback

import db
from normalize import canonical_url, normalize
from scrapers import REGISTRY

ENUMS = {"format", "fee_status", "registration_status"}


def plan_rows(raws, source_id: int, existing: dict[str, str], now) -> tuple[list[dict], dict]:
    """Normalize raw source rows into upsert payloads. Pure (no I/O) so it is easy to test."""
    counts = {"fetched": 0, "invalid": 0}
    rows: dict[str, dict] = {}  # keyed by canonical URL, so a listing repeated across pages counts once
    for raw in raws:
        counts["fetched"] += 1
        row, reason = normalize(raw, now)
        if not row:
            counts["invalid"] += 1
            print(f"  skip ({reason}): {str(raw.get('url'))[:120]}")
            continue
        row["source_id"] = source_id
        old_status = existing.get(row["url"])
        if old_status and row["registration_status"] not in ("unknown", old_status):  # verified transition only
            row["previous_registration_status"] = old_status
            row["status_changed_at"] = now.isoformat()
        # never overwrite known values with nulls (or "unknown") from a partial response;
        # new rows get the column defaults, which are null / "unknown" anyway
        rows[row["url"]] = {k: v for k, v in row.items() if v is not None and not (k in ENUMS and v == "unknown")}
    counts["imported"] = sum(u not in existing for u in rows)
    counts["updated"] = len(rows) - counts["imported"]
    return list(rows.values()), counts


def upsert(rows: list[dict]) -> int:
    """Bulk upsert grouped by key set (PostgREST needs one shape per request). Falls back row by row."""
    table, failed = db.client().table("events"), 0
    groups: dict[frozenset, list[dict]] = {}
    for r in rows:
        groups.setdefault(frozenset(r), []).append(r)
    for group in groups.values():
        for batch in db.chunks(group, 200):
            try:
                table.upsert(batch, on_conflict="url", default_to_null=False, returning="minimal").execute()
            except Exception:
                for r in batch:  # e.g. an external_id collision on one row
                    try:
                        table.upsert(r, on_conflict="url", default_to_null=False, returning="minimal").execute()
                    except Exception as err:
                        failed += 1
                        print(f"  upsert failed for {r['url'][:120]}: {str(err)[:200]}")
    return failed


def existing_statuses(urls: list[str]) -> dict[str, str]:
    out = {}
    for batch in db.chunks(urls, 100):
        for r in db.client().table("events").select("url, registration_status").in_("url", batch).execute().data:
            out[r["url"]] = r["registration_status"]
    return out


def run_source(source: dict) -> None:
    key = source["key"]
    module = REGISTRY.get(key)
    job = db.start_job("discovery", key)
    if job is None:
        print(f"{key}: another run is in progress, skipping")
        return
    started, counts, error = time.monotonic(), {}, None
    try:
        if not module:
            raise RuntimeError(f"no adapter in worker/sources for '{key}'")
        raws = list(module.fetch())
        now = db.now()
        existing = existing_statuses([u for u in {canonical_url(r.get("url")) for r in raws} if u])
        rows, counts = plan_rows(raws, source["id"], existing, now)
        counts["failed"] = upsert(rows)
    except Exception as err:
        error = f"{type(err).__name__}: {err}"
        traceback.print_exc()
    counts["seconds"] = round(time.monotonic() - started, 1)
    db.finish_job(job, counts, error)
    update = {"last_checked_at": db.iso(db.now()), "last_counts": counts, "last_error": error}
    if not error:
        update["last_success_at"] = update["last_checked_at"]
    db.client().table("event_sources").update(update).eq("id", source["id"]).execute()
    print(f"{key}: {'FAILED ' + error if error else 'ok'} {counts}")


def close_expired_events() -> int:
    """Close past events whose deadline has passed so future events searches remain accurate."""
    now_iso = db.iso(db.now())
    try:
        res = (
            db.client()
            .table("events")
            .update({"registration_status": "closed"})
            .lt("registration_deadline", now_iso)
            .neq("registration_status", "closed")
            .execute()
        )
        count = len(res.data) if res.data else 0
        if count > 0:
            print(f"Housekeeping: closed {count} expired events")
        return count
    except Exception as err:
        print(f"  close_expired_events notice: {err}")
        return 0


def main(keys: list[str]) -> None:
    close_expired_events()
    q = db.client().table("event_sources").select("id, key").eq("enabled", True)
    if keys:
        q = q.in_("key", keys)
    else:
        q = q.in_("key", list(REGISTRY.keys()))
    for source in q.order("key").execute().data:
        run_source(source)


if __name__ == "__main__":
    main(sys.argv[1:])
