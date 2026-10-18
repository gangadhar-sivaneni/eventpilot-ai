# EventPilot AI — Continuous Build Plan

> **Purpose:** Build a zero-cash-cost MVP for worldwide event discovery, personalized alerts, and accurate registration assistance. This is a continuous, milestone-driven plan—not a four-week schedule. Work on the next milestone only after the current milestone's acceptance criteria pass.

## 1. Product goal

Users sign in with Google, create a reusable profile, discover events around the world, save interests, receive alerts when matching events are found or registration status changes, and use an agent to prepare supported registration forms.

The system should optimize for **correctness, transparency, and safe recovery**, not promise guaranteed places. It cannot guarantee a successful registration when an event sells out, a queue rejects a session, a platform is unavailable, or eligibility requirements are not met.

### MVP user journey

1. User signs in with Google.
2. User completes and saves a profile and optional reusable answers.
3. User searches and filters event listings.
4. Discovery workers import events from permitted sources and normalize their data.
5. Matching rules identify relevant events and create deduplicated alerts.
6. User opens an event and checks its official registration URL, fee, eligibility, and dates.
7. The registration agent prepares a supported form using validated profile fields.
8. User reviews and authorizes consequential actions. Paid commitments require explicit approval of the amount and terms.
9. The agent records the real outcome as confirmed, failed, or unknown; it does not infer success from clicking Submit.

## 2. Product principles and constraints

- **Budget:** ₹0 cash spend during initial development. Use existing computer/internet, open-source tools, local workers, and free tiers within their quotas and terms.
- **No guarantee of free infrastructure:** API access, email/SMS, domains, commercial hosting, persistent workers, and some data sources may later cost money.
- **Source compliance:** Prefer official APIs, RSS/ICS feeds, and public pages whose terms permit collection. Respect robots policies, terms, rate limits, and source attribution requirements.
- **Registration safety:** Do not bypass CAPTCHAs, anti-bot controls, queues, access restrictions, or platform terms. Never use multiple accounts to jump a queue.
- **Data minimization:** Save only information needed for the service. Never store third-party passwords or payment-card details in profile records.
- **No guessing:** Uncertain fields, fees, eligibility, or outcomes must be flagged for review.
- **Idempotency:** Discovery and alert processing should tolerate retries without creating duplicates.
- **Observability:** Every worker run should record what it checked, what changed, and what failed without logging secrets or unnecessary personal data.
- **Continuous delivery:** Ship small, tested increments. No fixed calendar deadline is required.

## 3. Recommended technology stack

| Area | Choice | Use |
|---|---|---|
| Web app | Next.js App Router, TypeScript, Tailwind CSS | Pages, server routes/actions, UI |
| Authentication | Supabase Auth with Google OAuth | Identity and sessions |
| Database | Supabase PostgreSQL | Profiles, events, alerts, jobs, registration state |
| Database security | Row Level Security (RLS) and least-privilege grants | Enforce user data boundaries |
| Discovery worker | Python, Requests, BeautifulSoup, feedparser, python-dateutil | API/RSS/permitted HTML collection and normalization |
| Browser automation | Playwright | Supported registration forms and verification |
| Testing | pytest, Playwright tests, Next.js lint/type checks | Unit, integration, and security tests |
| Version control | Git and GitHub | Change history and CI |
| Scheduling | Local scheduler first; GitHub Actions or suitable free scheduler later | Periodic discovery within limits |
| Notifications | In-app alerts first; browser push later | New events, openings, deadlines, source changes |

Avoid a paid LLM API in the first iteration. Use deterministic rules and explicit field mappings. Consider a local model or an optional API only after tests show a clear need for semantic form interpretation.

## 4. Repository structure

```text
eventpilot-ai/
├── src/
│   ├── app/
│   │   ├── page.tsx
│   │   ├── events/
│   │   │   ├── page.tsx
│   │   │   └── [id]/page.tsx
│   │   ├── profile/page.tsx
│   │   ├── alerts/page.tsx
│   │   ├── registrations/page.tsx
│   │   └── auth/callback/route.ts
│   ├── components/
│   └── lib/
│       └── supabase/
├── supabase/
│   └── migrations/
├── worker/
│   ├── sources/
│   ├── discovery.py
│   ├── normalize.py
│   ├── match_users.py
│   ├── notify.py
│   ├── registration.py
│   ├── requirements.txt
│   └── tests/
├── .github/workflows/
├── .env.example
├── .gitignore
└── README.md
```

Keep the frontend and worker separate in responsibility. They share persisted state through the database and trusted server-side APIs, not process memory.

## 5. Continuous milestone roadmap

### Milestone 0 — Local development foundation

**Tasks**
- Install Node.js LTS, npm, Git, Python, and an editor.
- Create the Next.js app using a Supabase-compatible starter or the standard Next.js generator.
- Create a Git repository and `.gitignore`.
- Create a Python virtual environment and install dependencies.
- Add `.env.example` containing variable names but no secrets.
- Confirm the frontend runs locally.

**Acceptance criteria**
- `npm run dev` starts the site.
- Python environment can install `requirements.txt`.
- No secrets are tracked by Git.
- A clean clone can be configured from documented setup steps.

**Do not proceed until:** a second local setup can reproduce the development environment from the README.

### Milestone 1 — Supabase and Google authentication

**Tasks**
- Create a Supabase project and obtain project URL and publishable key.
- Configure Google OAuth in Google Cloud Console.
- Add the Supabase callback URI shown by the Supabase dashboard to the Google OAuth client.
- Configure local and production redirect allowlists in Supabase.
- Use the Supabase SSR-compatible client pattern in Next.js.
- Add sign-in, sign-out, callback, and protected-page handling.
- Keep Google client secrets and Supabase server-side secrets off the browser.

**Acceptance criteria**
- New and returning users can sign in.
- Sign-out clears the user session.
- Protected routes require authentication.
- Redirects work on localhost.
- No client bundle or Git commit contains privileged secrets.

### Milestone 2 — Database schema and security

Create migrations for:

- `profiles`: personal and professional details owned by one auth user.
- `user_preferences`: event interests, countries, formats, fee preferences, and alert preferences.
- `registration_answers`: optional reusable answers with user ownership.
- `event_sources`: source URL/type, enabled flag, last check, and last error.
- `events`: normalized public event metadata, dates, fee state, registration state, source, and last check.
- `saved_searches`: user-owned search filters.
- `event_alerts`: user-owned alert records with deduplication keys.
- `registrations`: one local registration workflow per user/event with explicit state.
- `automation_jobs`: trusted-worker job queue metadata.
- `audit_logs`: security-sensitive workflow actions with minimized personal data.

**Security requirements**
- Enable RLS on every table exposed through the API.
- Add ownership policies based on `auth.uid()` for user-specific tables.
- Restrict event-source writes and event catalogue writes to trusted server-side workers.
- Do not expose Supabase service-role/secret keys in frontend code.
- Do not allow users to set arbitrary `user_id` values to access other users' rows.
- Add retention/deletion behavior for profile data and logs.
- Test RLS using at least two independent test accounts.

**Acceptance criteria**
- User A cannot read or modify User B's profile, answers, saved searches, alerts, registrations, or jobs.
- Anonymous users can only read explicitly public event data if that is intended.
- Browser clients cannot modify the event catalogue or worker queue.
- Database constraints reject duplicate event URLs and duplicate user/event registrations.

### Milestone 3 — Website shell and profile

**Tasks**
- Build dashboard navigation.
- Build event directory, event details, profile, alerts, and registration-history screens.
- Add profile editing with server-side validation.
- Store only necessary fields: name, email from identity provider, country/location, organization, occupation, bio, portfolio, and optional reusable answers.
- Keep event-specific answers separate from general profile data.
- Add loading, empty, error, and success states.

**Acceptance criteria**
- User can save, reload, edit, and delete their profile.
- Private data remains protected by RLS and server-side auth checks.
- Profile forms do not ask for third-party passwords or payment-card details.

### Milestone 4 — Event data model and first source

**Tasks**
- Define a canonical event schema: title, event URL, registration URL, location, online flag, start/end timestamps, registration open/deadline timestamps, fee amount/currency/status, registration status, eligibility, categories, source, and last checked time.
- Start with a clearly labelled synthetic source for tests.
- Add one real, permitted API or feed as the first production source.
- Implement source-specific parsing separately from common normalization.
- Normalize timestamps to UTC; render them in the user's timezone.
- Validate URLs, dates, currencies, and status values.
- Preserve unknown values as `unknown`; never convert missing fee data to zero/free.
- Add source IDs and stable external IDs where provided.
- Use canonical URL and source ID for deduplication.
- Do not overwrite verified fields with nulls from partial source responses.
- Add request timeouts, conservative rate limits, bounded retries, and source health logs.
- Protect workers from SSRF: use a source allowlist, validate redirects, and block private/local IP ranges.

**Acceptance criteria**
- The first real source imports valid event records.
- Duplicate imports update records rather than creating duplicates.
- Invalid records are skipped with actionable logs.
- Source failures do not stop unrelated sources.
- Every event displays its source and last checked time.

### Milestone 5 — Search and event quality

**Tasks**
- Add filters for country/city, online/in-person, category, date range, fee status, and registration status.
- Add pagination and reasonable query limits.
- Show official event and registration links.
- Clearly distinguish free, paid, and unknown fees.
- Show deadline and timezone when known.
- Add a source freshness indicator.
- Add admin-only views for source health, failed imports, and suspected duplicates.

**Acceptance criteria**
- Filters combine correctly and do not leak user data.
- Unknown fees never appear as free.
- Event detail pages link to the correct source.
- Invalid, expired, or unverified data is represented honestly.

### Milestone 6 — Matching and in-app alerts

**Tasks**
- Let users save event interests and filters.
- Match categories, location, online preference, fee limit, eligibility, and timing.
- Start with deterministic rules. Add semantic matching only if measured quality justifies it.
- Create alerts for `new_event`, `registration_opened`, `deadline_reminder`, and `availability_changed` when supported by evidence.
- Add unique keys for user/event/alert type.
- Use a transactional outbox or equivalent retryable delivery pattern before adding external push delivery.
- Build an alerts page with read/unread status and event links.

**Acceptance criteria**
- A matching new event creates one alert per user/event/type.
- Re-running the same discovery job does not create duplicate alerts.
- A status-change alert is emitted only after a verified state transition.
- Users can mark alerts read and disable alert categories.
- Matching and notification failures are observable and retryable.

### Milestone 7 — Scheduled discovery

**Tasks**
- Make discovery callable as a repeatable command.
- Add concurrency control so two jobs do not process the same source simultaneously.
- Begin with local scheduling while developing.
- Add a free scheduler only after the job is idempotent and its execution limits are understood.
- Store secrets in the scheduler's secret manager.
- Record job start/end, source, imported/updated/skipped counts, errors, and duration.
- Use conservative schedules and respect source policies.

**Acceptance criteria**
- Repeated jobs are safe.
- Failed sources can be retried without duplicating records or alerts.
- Job health and last successful scan are visible.
- The product does not promise real-time discovery when the scheduler cannot guarantee it.

### Milestone 8 — Registration preparation agent

**Tasks**
- Choose one test form you control, then one real platform whose terms permit automation.
- Create a platform-specific adapter rather than a universal form-filler.
- Use accessible labels and roles where possible.
- Maintain an explicit mapping from known form labels to profile fields.
- Add confidence thresholds and pause on ambiguity.
- Validate required fields and event eligibility.
- Keep event-specific answers editable.
- Detect fee/payment steps and require explicit approval for the amount and terms.
- Do not auto-accept legal declarations, consent, or eligibility claims.
- Do not bypass CAPTCHAs, queue protections, or anti-bot controls.
- Keep submission disabled until the review and verification paths are tested.

**Acceptance criteria**
- Agent can prepare a supported test form without guessing.
- Missing or ambiguous required answers stop the workflow.
- The user can inspect all proposed answers before submission.
- Unsupported forms fail safely and link the user to the official registration page.

### Milestone 9 — Submission and outcome verification

**Tasks**
- Implement registration states: `not_started`, `prepared`, `awaiting_approval`, `submitted`, `confirmed`, `failed`, and `unknown`.
- Require authorization before consequential actions.
- Use a per-user/event lock and idempotency key for local workflow execution.
- Before retrying after a crash, inspect the current state and available confirmation evidence.
- Verify results using a platform-specific success signal, official API, confirmation reference, or authorized confirmation email where permitted.
- Record timestamps, result evidence, safe error summaries, and attempt counts.
- Do not store third-party passwords.
- If the result is ambiguous, mark `unknown` and investigate; do not blindly resubmit.
- Enable pre-authorized auto-submission only for specifically supported, low-risk free flows after thorough testing and clear user consent.

**Acceptance criteria**
- The system never reports success solely because the submit button was clicked.
- Ambiguous submissions are not automatically repeated.
- Duplicate local workflows are blocked.
- Paid registration requires explicit approval.
- User can see the actual status and next recommended action.

### Milestone 10 — Browser push and deadline monitoring

**Tasks**
- Keep in-app alerts as the source of truth.
- Add browser push only after HTTPS, service worker, subscription storage, and opt-in behavior are implemented.
- Provide a notification preference and unsubscribe path.
- Detect registration openings and deadlines only from trustworthy data or permitted checks.
- Increase polling frequency only when allowed by source terms and infrastructure capacity.
- Use timezone-aware reminders.
- Clearly state that source detection and push delivery may be delayed.

**Acceptance criteria**
- Push requires user permission.
- Expired subscriptions are removed safely.
- Notification delivery failures are logged.
- Deadline reminders are not duplicated.
- The product does not claim guaranteed instant delivery.

### Milestone 11 — Quality, privacy, and release readiness

**Tests**
- Unit tests for normalization, URL validation, fee classification, matching, and duplicate handling.
- Integration tests for database ownership policies and event upserts.
- Browser tests for sign-in, profile editing, filters, alerts, and registration preparation.
- Failure tests for source timeout, malformed data, missing fields, full event, CAPTCHA, browser crash, and ambiguous submission.
- Security tests using separate accounts.
- Recovery tests for worker restarts and repeated job execution.

**Release checklist**
- No secrets in Git or frontend bundles.
- RLS and least-privilege grants verified.
- Data export/deletion process documented.
- Terms, privacy notice, and source policies reviewed.
- Error logs do not include secrets or unnecessary personal information.
- Source attribution and last-checked timestamps are visible.
- Registration success is backed by evidence.
- Free-tier quotas and terms are documented.
- Rollback procedure exists for broken migrations and worker releases.

**Acceptance criteria**
- Critical tests pass in CI.
- No known cross-user data access bug remains.
- Failed or uncertain registration attempts are handled safely.
- A fresh setup can follow the README without undocumented secrets or steps.

## 6. Initial setup commands

Check installations:

```bash
node --version
npm --version
git --version
python --version
```

Create the web app:

```bash
npx create-next-app -e with-supabase eventpilot-ai
cd eventpilot-ai
npm run dev
```

Create the Python worker environment:

```bash
mkdir worker
cd worker
python -m venv .venv
```

Activate it:

```powershell
# Windows PowerShell
.venv\Scripts\Activate.ps1
```

```bash
# macOS/Linux
source .venv/bin/activate
```

Create `worker/requirements.txt` with the required dependencies:

```text
requests
beautifulsoup4
feedparser
python-dateutil
supabase
playwright
python-dotenv
pytest
```

Install them:

```bash
python -m pip install -r requirements.txt
python -m playwright install chromium
```

Return to the project root before creating frontend files or running npm commands.

## 7. Google OAuth setup checklist

1. Create/select a project in Google Cloud Console.
2. Configure the OAuth consent screen as required.
3. Create an OAuth client of type **Web application**.
4. Add `http://localhost:3000` as a local authorized JavaScript origin.
5. Add the exact callback URL displayed by Supabase to Google's authorized redirect URIs.
6. Enable Google under Supabase Authentication providers.
7. Enter the Google Client ID and Client Secret in Supabase.
8. Configure Supabase Site URL and allowed local redirect URLs.
9. Test sign-in, sign-out, refresh, and protected routes.
10. Add production domains and redirect URLs only when deployment is ready.

Use the current official documentation:
- Supabase Google provider: https://supabase.com/docs/guides/auth/social-login/auth-google
- Supabase Next.js SSR: https://supabase.com/docs/guides/auth/server-side/nextjs
- Google Identity: https://developers.google.com/identity

## 8. Database entities

Create versioned SQL migrations under `supabase/migrations/`. At minimum, define:

| Table | Purpose | Access |
|---|---|---|
| `profiles` | User profile | Owner only |
| `user_preferences` | Matching and notification preferences | Owner only |
| `registration_answers` | Reusable answers | Owner only |
| `event_sources` | Source registry and health | Trusted worker writes |
| `events` | Public normalized event data | Public/authenticated read as intended; worker writes |
| `saved_searches` | Saved filters | Owner only |
| `event_alerts` | Notifications | Owner only |
| `registrations` | Registration workflow and evidence | Owner only; trusted worker updates through controlled server path |
| `automation_jobs` | Background tasks | Trusted worker manages |
| `audit_logs` | Minimal audit records | Restricted server-side writes; limited reads |

Important constraints:
- Unique canonical event URL.
- Unique source/external event ID where available.
- Unique `(user_id, event_id)` registration workflow.
- Unique `(user_id, event_id, alert_type)` alert.
- Foreign keys with appropriate deletion behavior.
- Checks for allowed statuses and valid fee-state values.
- RLS on all user-facing tables.

Do not expose privileged keys or grant browser users unrestricted writes to worker-controlled tables.

## 9. Zero-budget operating policy

- Develop and test locally first.
- Use the provider's free subdomain rather than buying a domain.
- Use in-app alerts before external email/SMS.
- Use a small number of permitted sources before expanding coverage.
- Avoid paid AI APIs until a tested use case needs them.
- Use local Playwright runs for development and tests.
- Check free-tier limits, commercial-use restrictions, job quotas, and inactivity policies before deploying.
- Never promise global coverage, uninterrupted monitoring, or instant notifications from a free-tier prototype.

## 10. How to continue building

This project has no fixed four-week deadline. Work through the milestones in order and keep the next task small.

For every task:
1. State the outcome and acceptance criteria.
2. Implement the smallest complete change.
3. Add or update tests.
4. Run lint, type checks, and relevant tests.
5. Review data access and secret handling.
6. Commit the change with a descriptive Git message.
7. Update this plan with completed items, decisions, known issues, and the next task.

Suggested commit format:

```text
feat(auth): add Google sign-in
feat(events): add normalized event catalogue
feat(discovery): import events from first source
feat(alerts): create deduplicated matching alerts
feat(registration): prepare supported registration form
test(security): verify user data isolation
```

## 11. First implementation session

Complete only these items first:

- [ ] Verify Node.js, npm, Git, and Python.
- [ ] Create the Next.js project and run it locally.
- [ ] Create a Supabase project.
- [ ] Configure Google OAuth for localhost.
- [ ] Verify sign-in and sign-out.
- [ ] Commit the clean starter project without secrets.

Then move to Milestone 2. Do not start browser automation until authentication, database ownership, and the event data model are in place.

## 12. Definition of MVP

The MVP is ready for controlled testing when:

- Google authentication and secure profiles work.
- At least one real permitted source produces usable event records.
- Users can search and filter events.
- New matching events create deduplicated in-app alerts.
- Fees and unknown values are presented honestly.
- The agent prepares one supported registration form with validated field mapping.
- Submission requires the appropriate user authorization.
- Registration outcomes are verified or marked unknown.
- Cross-user data access tests pass.
- The project can be configured and run from its documentation.

**North star:** improve the breadth of event discovery and the speed of supported registration without sacrificing accuracy, user consent, platform compliance, or truthful status reporting.

## 13. Build status (updated 2026-10-18)

**Built and verified locally**
- Milestones 0–3: Next.js 16 app (TypeScript, Tailwind), Supabase SSR auth with Google, `src/proxy.ts` session refresh and route guard, profile/preferences/answers/saved searches, data export and account deletion.
- Milestone 2: one migration with all 10 tables, RLS on every table, column-level grants, constraints. `npm run test:db` applies it to real Postgres (PGlite) and passes 32 two-account security checks.
- Milestones 4–7: Python worker with 7 sources (synthetic, Devpost, Unstop, Devfolio, HackerEarth, MLH, college RSS), common normalization, SSRF guard + robots.txt, idempotent upserts, per-source job locks, source health, deterministic matching into deduplicated alerts, email outbox, retention cleanup, 2-hourly GitHub Actions schedule. A live dry run imported 482 events with 0 invalid.
- Milestones 8–9: registration agent (`worker/registration.py`) with Google Forms and local test-form adapters, explicit label mapping, pause on ambiguity, user-only consent, fee approval, write-ahead `submitted` state, outcome verified or marked `unknown`. Tested end to end in Chromium on `worker/tests/fixtures/test_form.html`.
- Tests: 26 pytest tests pass (3 live RLS tests wait for keys); lint, typecheck and production build pass.

**Decisions**
- Email digests every 2 hours were added (user request) as a retryable copy of in-app alerts.
- Cache Components is off: every page is per-user, so it only added Suspense ceremony.
- GDG source disabled: its robots.txt disallows the API.
- Submission is off by default (`ENABLE_SUBMIT=false`).

**Next tasks**
1. Add the keys (README → checklist), apply the migration, run `RLS_TEST=1 pytest -m live`.
2. Run `python discovery.py` once and check /admin source health.
3. Try the registration agent on a Google Form you own before any real event.
4. Milestone 10 (browser push) only after the above is stable.
