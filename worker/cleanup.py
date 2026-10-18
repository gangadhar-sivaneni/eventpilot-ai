"""Retention for logs. Events are kept: deleting them would cascade away users' registration evidence.
Usage: python cleanup.py"""
from datetime import timedelta

import db

KEEP_AUDIT = timedelta(days=180)
KEEP_JOBS = timedelta(days=60)


def main() -> None:
    client, now = db.client(), db.now()
    client.table("audit_logs").delete().lt("created_at", db.iso(now - KEEP_AUDIT)).execute()
    client.table("automation_jobs").delete().neq("status", "running").lt("started_at", db.iso(now - KEEP_JOBS)).execute()
    print("cleanup: ok")


if __name__ == "__main__":
    main()
