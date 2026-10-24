"""Discovery worker: import events from every enabled source into the catalogue.

Safe to re-run: rows upsert on the canonical URL, one source failing never stops the others,
and each source runs under a job lock so two runs never process it at once.
Usage: python discovery.py [source_key ...]
"""
import sys
import time
import traceback
import re
from datetime import datetime

import db
from normalize import canonical_url, normalize
from scrapers import REGISTRY

ENUMS = {"format", "fee_status", "registration_status"}
TECH_EVENT = re.compile(
    r"\b(software|developer|programming|coding|hackathon|ideathon|artificial intelligence|ai|"
    r"machine learning|data science|cyber ?security|cloud computing|web development|app development|"
    r"robotics|blockchain|open source|computer science|technology|tech fest|it|iot|hardware|"
    r"devops|kubernetes|fintech|copilot|engineering|engineers?|semiconductor|photonics|"
    r"fiber optics|mechanics|structural|quantum computing|electronics|information security)\b",
    re.I,
)
TECH_EVENT_KIND = re.compile(r"\b(conference|symposium|summit|conclave|workshop|bootcamp|expo|seminar|webinar)\b", re.I)


def in_catalogue_scope(raw: dict) -> bool:
    """Only publish topic-specific technology events with Hyderabad/India or online scope."""
    title_and_categories = " ".join(str(v) for v in (
        raw.get("title"), *(raw.get("categories") or [])
    ) if v)
    description = str(raw.get("description") or "")
    title_has_tech_subject = bool(TECH_EVENT.search(title_and_categories))
    description_confirms_tech = bool(
        TECH_EVENT_KIND.search(str(raw.get("title") or "")) and TECH_EVENT.search(description)
    )
    if not title_has_tech_subject and not description_confirms_tech:
        return False

    fmt = str(raw.get("format") or "").lower()
    if fmt in {"online", "virtual", "digital", "remote"}:
        return True

    city = str(raw.get("city") or "").strip().lower()
    country = str(raw.get("country") or "").strip().lower()
    return country in {"india", "in"} or "hyderabad" in city


def plan_rows(raws, source_id: int, existing: dict[str, dict | str], now) -> tuple[list[dict], dict]:
    """Normalize raw source rows into upsert payloads. Pure (no I/O) so it is easy to test."""
    counts = {"fetched": 0, "invalid": 0}
    rows: dict[str, dict] = {}  # keyed by canonical URL, so a listing repeated across pages counts once
    counts["out_of_scope"] = 0
    for raw in raws:
        counts["fetched"] += 1
        if not in_catalogue_scope(raw):
            counts["out_of_scope"] += 1
            continue
        row, reason = normalize(raw, now)
        if not row:
            counts["invalid"] += 1
            print(f"  skip ({reason}): {str(raw.get('url'))[:120]}")
            continue
        row["source_id"] = source_id
        row["quality_verified_at"] = now.isoformat()
        old_record = existing.get(row["url"])
        old_status = old_record.get("registration_status") if isinstance(old_record, dict) else old_record
        if old_status and row["registration_status"] not in ("unknown", old_status):  # verified transition only
            row["previous_registration_status"] = old_status
            row["status_changed_at"] = now.isoformat()
        # never overwrite known values with nulls (or "unknown") from a partial response;
        # new rows get the column defaults, which are null / "unknown" anyway
        rows[row["url"]] = {k: v for k, v in row.items() if v is not None and not (k in ENUMS and v == "unknown")}
    counts["imported"] = sum(url not in existing for url in rows)
    counts["updated"] = sum(
        url in existing and not same_event_data(row, existing[url]) for url, row in rows.items()
    )
    counts["unchanged"] = len(rows) - counts["imported"] - counts["updated"]
    return list(rows.values()), counts


def same_event_data(row: dict, old: dict | str | None) -> bool:
    """Ignore check timestamps when deciding whether event facts changed."""
    if not isinstance(old, dict):
        return False
    metadata = {"last_checked_at", "quality_verified_at"}
    return all(old.get(key) == value for key, value in row.items() if key not in metadata)


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


def existing_rows(urls: list[str]) -> dict[str, dict]:
    out = {}
    for batch in db.chunks(urls, 100):
        for r in db.client().table("events").select("*").in_("url", batch).execute().data:
            out[r["url"]] = r
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
        existing = existing_rows([u for u in {canonical_url(r.get("url")) for r in raws} if u])
        rows, counts = plan_rows(raws, source["id"], existing, now)
        changed, unchanged_urls = [], []
        for row in rows:
            if same_event_data(row, existing.get(row["url"])):
                unchanged_urls.append(row["url"])
            else:
                changed.append(row)
        counts["failed"] = upsert(changed)
        stamp = db.iso(now)
        for batch in db.chunks(unchanged_urls, 100):
            try:
                db.client().table("events").update({
                    "last_checked_at": stamp,
                    "quality_verified_at": stamp,
                }).in_("url", batch).execute()
            except Exception as err:
                counts["failed"] += len(batch)
                print(f"  unchanged refresh failed: {str(err)[:200]}")
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


def expired_event_ids(events: list[dict], now: datetime) -> list[int]:
    """Select ended events using event time only; registration deadlines do not extend them."""
    expired = []
    for event in events:
        event_end = event.get("ends_at") or event.get("starts_at")
        if not event_end:
            continue
        event_end = datetime.fromisoformat(event_end.replace("Z", "+00:00"))
        if event_end <= now:
            expired.append(event["id"])
    return expired


def delete_expired_events() -> int:
    """Delete events after their end (or their start when no end was published)."""
    now = db.now()
    table = db.client().table("events")
    expired_ids, offset, page_size = [], 0, 500
    try:
        while True:
            page = table.select("id,starts_at,ends_at").range(offset, offset + page_size - 1).execute().data
            expired_ids.extend(expired_event_ids(page, now))
            if len(page) < page_size:
                break
            offset += page_size
        total_deleted = 0
        for batch in db.chunks(expired_ids, 100):
            table.delete().in_("id", batch).execute()
            total_deleted += len(batch)
        if total_deleted:
            print(f"Housekeeping: deleted {total_deleted} ended events")
        return total_deleted
    except Exception as err:
        print(f"  delete_expired_events FAILED: {err}")
        return 0


def main(keys: list[str]) -> None:
    delete_expired_events()
    q = db.client().table("event_sources").select("id, key").eq("enabled", True)
    if keys:
        q = q.in_("key", keys)
    else:
        q = q.in_("key", list(REGISTRY.keys()))
    for source in q.order("key").execute().data:
        run_source(source)


if __name__ == "__main__":
    main(sys.argv[1:])
