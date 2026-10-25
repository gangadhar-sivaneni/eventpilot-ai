# Workspace Rule: Event Discovery & Verification

All AI agents in this workspace must strictly follow these rules:

1. **Zero Hallucination Policy**:
   - Never create, hardcode, or inject synthetic/mock event files.
   - Never invent, assume, or simulate event dates, schedules, or URLs.
   - If an event is not officially published on a verified platform, it must NOT be added to the database.

2. **Search Real Event-Hosting Platforms (Not Generic College Portals)**:
   - College homepages / news archives publish stale/previous-year reports that mislead agents into pulling obsolete data or 404 links.
   - Only ingest from platforms where active registrations and ticketing are hosted:
     - Unstop (`unstop.com`)
     - Luma (`lu.ma`)
     - StudentTribe (`studenttribe.in`)
     - Devfolio (`devfolio.co`)
     - Devpost (`devpost.com`)
     - HackerEarth (`hackerearth.com`)
     - MLH (`mlh.io`)
     - Dedicated verified standalone summit domains (e.g. `mlritcie.in` for Equinox 2.0).

3. **If Registration Ended, Delete from Database**:
   - If `registration_deadline <= now`, `registration_status == 'closed'`, or the event has ended (`ends_at / starts_at <= now`), automatically delete it from the database.

4. **If No Updation, Don't Touch It**:
   - Compare factual fields with existing records. If facts have not changed, do NOT touch or rewrite the row (only update `last_checked_at`).

5. **Mandatory Live Link Verification (No 404s)**:
   - Every candidate URL and registration URL must return HTTP 200/2xx. Never stamp `quality_verified_at` if a link fails or redirects to an error page.
