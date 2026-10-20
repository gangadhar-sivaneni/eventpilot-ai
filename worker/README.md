# EventPilot AI — Worker & Automation Engine

This directory contains the background workers, event discovery scrapers, recommendation matching engine, alert notification dispatcher, and the local browser-assisted registration agent.

---

## Architecture Overview

```
                        ┌───────────────────────────────────┐
                        │        Event Sources (APIs/RSS)   │
                        └─────────────────┬─────────────────┘
                                          │
                                          ▼
                                ┌───────────────────┐
                                │   discovery.py    │ ◄── net.py + normalize.py
                                └─────────┬─────────┘
                                          │ Upserts canonical events
                                          ▼
                                ┌───────────────────┐
                                │  Supabase Postgres│
                                └─────────┬─────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
           ┌───────────────────┐                     ┌───────────────────┐
           │   match_users.py  │                     │  registration.py  │
           └─────────┬─────────┘                     └───────────────────┘
                     │ Queues alerts                 Interactive local agent
                     ▼                               (Playwright Chromium)
           ┌───────────────────┐
           │     notify.py     │
           └─────────┬─────────┘
                     │ Sends digests (Gmail SMTP)
                     ▼
             User Inboxes
```

---

## Directory Structure

| File / Folder | Role |
|---|---|
| [`discovery.py`](discovery.py) | Scrapes and imports events from all active sources into Postgres with per-source locks. |
| [`match_users.py`](match_users.py) | Evaluates user preferences and matching keywords against newly imported events to queue deduplicated alerts. |
| [`notify.py`](notify.py) | Batches pending alerts and sends email digests via Gmail SMTP with unsubscribe links. |
| [`cleanup.py`](cleanup.py) | Cleans up stale job locks and maintains database hygiene. |
| [`registration.py`](registration.py) | Local agent that inspects registration forms in a visible Chromium window and prepares proposed answers from user profiles. |
| [`db.py`](db.py) | Supabase client setup, job concurrency locks (`start_job`, `finish_job`), and utility functions. |
| [`net.py`](net.py) | Secure network client with SSRF protection, robots.txt compliance, domain allowlist, rate limiting, and retries. |
| [`scrapers.py`](scrapers.py) | Unified scraper engine containing all platform adapters: Devpost, Unstop, Devfolio, HackerEarth, MLH, College RSS, and Tech Community summits. |
| [`tests/`](tests/) | Pytest test suite covering normalization, network safety, matching logic, and discovery pipelines. |

---

## Setup & Local Execution

### 1. Prerequisites & Virtual Environment

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

pip install -r requirements.txt
python -m playwright install chromium
```

### 2. Environment Configuration

Copy `.env.example` to `.env` and fill in your Supabase credentials:

```bash
cp .env.example .env
```

Required variables:
- `SUPABASE_URL`: Your Supabase project URL.
- `SUPABASE_SECRET_KEY`: Service role secret key (never commit this).
- `GMAIL_USER`: (Optional) Gmail address for alert notification digests.
- `GMAIL_APP_PASSWORD`: (Optional) Google App Password for SMTP delivery.

---

## Running the Pipelines

### Run Event Discovery
Fetch events from all registered sources:
```bash
python discovery.py
```
Or run a specific source:
```bash
python discovery.py devpost
python discovery.py unstop
```

### Run Matching Engine
Generate alert notifications for users whose profiles match events:
```bash
python match_users.py
```

### Dispatch Email Alerts
Deliver queued email notifications:
```bash
python notify.py
```

### Run Job & Lock Cleanup
Release timed-out locks and prune old runs:
```bash
python cleanup.py
```

---

## Running the Registration Agent

The registration agent uses Playwright with persistent browser state.

```bash
# 1. Prepare registration answers for an event
python registration.py prepare <REGISTRATION_ID>

# 2. After reviewing and approving on the website, submit:
python registration.py submit <REGISTRATION_ID>
```

---

## Running Tests

Run the test suite:
```bash
pytest -q
```

To run live Supabase RLS tests (requires `.env` configured):
```bash
RLS_TEST=1 pytest -m live
```
