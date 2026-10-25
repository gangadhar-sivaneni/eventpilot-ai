# EventPilot AI — Strict Event Discovery & Verification Rules

> [!IMPORTANT]
> **MANDATORY FOR ALL AI AGENTS & DEVELOPERS:**
> This repository runs a production-grade, 100% automated, truthful Event Discovery Agent. 
> You must act as a strict gatekeeper. You do not match words blindly; you audit data models.
> Under NO circumstances should you fabricate, guess, or invent event dates, registration URLs, or event entities.

---

## 1. Zero-Hallucination Policy (Strictly Enforced)

1. **No Hardcoded/Synthetic Event Files**:
   - NEVER create or maintain mock/synthetic event dictionaries or files (e.g., `community_events.py`).
   - All events must be dynamically discovered and ingested from real-time external platforms and verified API feeds.
2. **No Invented Timelines or Guesses**:
   - If an event’s official dates, schedule, or ticketing have not been officially announced and published by the organizer, it **DOES NOT EXIST** for our catalog.
   - Do NOT guess dates (e.g., assuming an annual fest like Promethean or Convergence will happen in November without an official published schedule).
   - If data is missing, conflicting, ambiguous, or lacks an explicit domain authority link, classify it as **UNVERIFIED**.

---

## 2. Event Sourcing Rules (Where to Look)

1. **DO NOT Scrape Generic College Homepages / News Blogs**:
   - College homepages and news archives (e.g., `cbit.ac.in/feed`, `mlrit.ac.in/feed`) frequently display previous-year reports, outdated press releases, or broken article links that mislead agents into pulling obsolete or 404 data.
2. **Search Active Event-Hosting & Ticketing Platforms**:
   - Scrape and verify platforms where organizers actually host active ticketing and registrations:
     - **Unstop** (`unstop.com`): Primary platform for college technical fests, hackathons, and competitions across India.
     - **Luma** (`lu.ma`): Real-time tech community meetups, workshops, and AI builder sessions.
     - **StudentTribe** (`studenttribe.in`): Real-time student fests, college hackathons, and campus passes in Hyderabad.
     - **Devfolio** (`devfolio.co`): Developer and collegiate hackathons.
     - **Devpost** (`devpost.com`): Global and enterprise hackathons.
     - **HackerEarth** (`hackerearth.com`): Innovation challenges and enterprise hiring hackathons.
     - **Major League Hacking** (`mlh.io`): Student hackathon leagues.
     - **KonfHub** (`konfhub.com`) & **Meetup** (`meetup.com`): Developer community conferences.
3. **Dedicated Standalone Summit Websites (Allowed with Verification)**:
   - Standalone dedicated domains established by college innovation cells for a specific fest edition (e.g., `https://mlritcie.in` for *The Equinox 2.0*) are permitted **only if**:
     - The domain actively resolves with **HTTP 200 OK**.
     - The event date and schedule are explicitly stated on the live site.
     - The registration link works directly.

---

## 3. Anchor Time & Past Event Rules

1. **Current Anchor Date**:
   - The current reference timestamp is strictly enforced.
   - Any event whose event dates or registration deadline have passed relative to `now` must be **rejected / dropped**.
2. **Concluded Events Classification**:
   - If an event took place yesterday or earlier (e.g., *IntelliCON 2026* which occurred on October 24, 2026), it is **`CONCLUDED_DATE`**.
   - Do NOT shift dates into the future to bypass filters.

---

## 4. "If Registration Ended, Delete from Database"

During every scan cycle (and on automated 10-minute cron triggers), the discovery worker executes `delete_expired_events()`, which permanently deletes an event from the database if:
1. `registration_deadline <= now` (Registration deadline has passed).
2. `registration_status == 'closed'` (Tickets are closed/sold out/ended).
3. `ends_at <= now` or `starts_at <= now` (The event has concluded).

---

## 5. "If No Updation, Don't Touch It" (Idempotency)

1. Fact Comparison:
   - Compare all factual fields using `same_event_data(row, existing_record)`.
   - Timestamps like `last_checked_at` and `quality_verified_at` are metadata, not event facts.
2. Non-Destructive Ingestion:
   - If an event's facts have NOT changed, **DO NOT TOUCH** the record in the database, except updating `last_checked_at`.
   - Never overwrite known, verified fields with null or "unknown" values from partial API responses.

---

## 6. Mandatory Live Link Verification (Zero 404s)

1. **No Broken Links**:
   - Every candidate URL and `registration_url` must be validated via `verify_public_link()`.
   - Any URL returning `HTTP 404`, `5xx`, connection error, or redirecting to an error page must have `quality_verified_at = None`.
2. **Catalog Quality Guard**:
   - The frontend query strictly filters on:
     ```typescript
     .not("quality_verified_at", "is", null)
     .not("registration_url", "is", null)
     .gt("starts_at", nowIso)
     .neq("registration_status", "closed")
     ```
   - Events with unverified or broken links are never shown to users.

---

## 7. Automated 10-Minute Cycle Checklist

On every 10-minute discovery scan:
- [x] Run `delete_expired_events()`: Prune ended events & passed registration deadlines.
- [x] Ingest only from verified platform adapters (Unstop, Devfolio, Devpost, etc.).
- [x] Verify live public links via `verify_public_link()`.
- [x] Upsert new or changed events. Leave unchanged events untouched.
- [x] Keep catalog 100% truthful, verifiable, and active.
