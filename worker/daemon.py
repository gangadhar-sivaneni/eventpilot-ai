"""EventPilot Background Daemon

Runs event discovery and link verification continuously every 10 minutes with clockwork precision.
Run with:
    python worker/daemon.py
"""
import sys
import time
from datetime import datetime

import discovery

INTERVAL_SECONDS = 600  # Exactly 10 minutes


def run_loop():
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] EventPilot 10-Minute Background Daemon Started.")
    print("Press Ctrl+C to stop.")

    while True:
        start_time = time.time()
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        print(f"\n[{now_str}] >>> Starting scheduled discovery scan...")

        try:
            discovery.main([])
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] <<< Scan completed successfully.")
        except Exception as exc:
            print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] !!! Scan encountered an error: {exc}", file=sys.stderr)

        elapsed = time.time() - start_time
        sleep_duration = max(10, INTERVAL_SECONDS - elapsed)
        next_run_mins = int(sleep_duration // 60)
        next_run_secs = int(sleep_duration % 60)
        print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Next scan scheduled in {next_run_mins}m {next_run_secs}s.")
        time.sleep(sleep_duration)


if __name__ == "__main__":
    try:
        run_loop()
    except KeyboardInterrupt:
        print("\nDaemon stopped by user.")
