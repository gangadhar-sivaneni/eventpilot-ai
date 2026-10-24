# EventPilot AI

Find technology events in Hyderabad and India, plus online events, get alerts when a match appears, and let an
agent prepare registration forms from your saved profile. **You review and approve before anything is
submitted.** It cannot guarantee a place: events sell out, queues reject sessions, and eligibility rules apply.

Built to run on ₹0: Supabase free tier, GitHub Actions, Vercel Hobby, Gmail, and your own computer for the browser agent.
The build plan and milestones are in [plan.md](plan.md).

## How it fits together

```
Google sign-in ─► Next.js website (Vercel) ─► Supabase Postgres (RLS on every table)
                                                  ▲            ▲
       GitHub Actions, every 10 min ─► worker/discovery.py → Supabase
       GitHub Actions, every 2 h ────► match_users.py → notify.py (email)
       Your computer, on demand  ─► worker/registration.py prepare|submit <id>  (visible browser)
```

| Path | What it is |
|---|---|
| [src/app](src/app) | Pages: events, event detail, profile, alerts, registrations, admin, auth callback |
| [src/proxy.ts](src/proxy.ts) | Refreshes the session cookie and guards private pages (Next 16 renamed middleware to proxy) |
| [src/lib](src/lib) | Supabase clients, auth helpers (`requireUser`), event/profile/registration helpers |
| [supabase/migrations](supabase/migrations) | The whole schema: 10 tables, RLS policies, column grants, seed sources |
| [supabase/tests/rls.test.mjs](supabase/tests/rls.test.mjs) | Applies the migration to real Postgres (PGlite) and checks RLS with two accounts, offline |
| [worker/scrapers.py](worker/scrapers.py) | Source adapters for event platforms, college feeds and the IIT Hyderabad official events calendar |
| [worker/net.py](worker/net.py) | The only way the worker reaches the internet: allowlist, SSRF guard, robots.txt, retries, rate limit |
| [worker/normalize.py](worker/normalize.py) | Canonical URLs, UTC dates, fee/status rules ("unknown" is never "free") |
| [worker/discovery.py](worker/discovery.py) | Imports events; idempotent upserts, per-source locks and health records |
| [worker/match_users.py](worker/match_users.py) | Deterministic matching → deduplicated alerts |
| [worker/notify.py](worker/notify.py) | Email digest from the alert outbox (Gmail) |
| [worker/registration.py](worker/registration.py) | The registration agent (Playwright): Google Forms + a local test-form adapter |

## Run it locally (no keys needed for tests)

```bash
npm install
```

```bash
npm run lint && npx tsc --noEmit && npm run test:db && npm run build
```

```bash
cd worker && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements.txt
```

```bash
cd worker && .venv/Scripts/python -m playwright install chromium && .venv/Scripts/python -m pytest -q
```

On macOS/Linux use `.venv/bin/python` instead of `.venv/Scripts/python`.

**Demo mode.** While `.env.local` still has the placeholder Supabase URL, `npm run dev` runs on built-in sample data
([src/lib/demo.ts](src/lib/demo.ts)), signed in as a demo user, so every screen and form can be tried. Changes live in
memory until the server restarts. Signing out shows the signed-out views. Real keys switch demo mode off automatically.
After the keys below are in place: `npm run dev` → http://localhost:3000, and `python discovery.py` imports events.

## Catalogue quality rules

- Production discovery never uses hard-coded event listings or the synthetic test source.
- Only tech-related records with a future event start date are admitted. The current catalogue includes Hyderabad/India events and online events; other in-person locations are left out.
- Event dates, registration deadlines and registration status stay separate. Devpost submission windows are not presented as event dates or registration deadlines. Missing fields remain unknown.
- College RSS entries are imported only when the linked official page publishes a Schema.org Event start date and a Hyderabad/India venue. A college article date is not treated as the event date.
- A listing is shown only after the stricter importer has rechecked it and within 24 hours of its last source check. Legacy rows are hidden until the importer verifies them again.

Apply [the verified-events migration](supabase/migrations/20261024000000_verified_events.sql) to the connected Supabase project before starting the updated website or worker. Existing rows remain in the database and become visible again only after the importer verifies them.

Scheduled discovery runs every 10 minutes after this workflow is on the default branch and both Supabase repository secrets are configured. Each scan runs worker tests and a dependency security audit before writing to the database. GitHub may delay scheduled runs, and a source may delay or remove its own listings, so this is polling rather than real-time monitoring. Event rows are upserted by URL; unchanged facts are preserved while their check timestamp is refreshed. Events are deleted after their published end time (or start time if no end was provided), including database-linked alerts and registrations. Always open the source link before relying on a detail; scraped data cannot guarantee what a publisher has not provided.

## Using the registration agent

1. On the website, open an event → **Prepare my registration**. Note the registration ID on the Registrations page.
2. On your computer: `cd worker` then `.venv/Scripts/python registration.py prepare <ID>`.
   A browser opens, the agent reads the form, fills what it can map with certainty, and saves its proposal.
   For a Google Form that needs sign-in, sign in once in that window; the profile in `worker/.browser-profile` remembers it.
3. On the website: answer anything flagged, tick consent boxes yourself, check every value, then **Approve**.
   Paid or unknown-fee events make you type the amount you agree to pay.
4. Set `ENABLE_SUBMIT=true` in `worker/.env` (only after you have tried it on a form you control), then
   `.venv/Scripts/python registration.py submit <ID>`. The status becomes **confirmed** only when the form shows a
   confirmation; otherwise it is **unknown** and is never resubmitted automatically.

It never solves CAPTCHAs, skips queues, accepts terms for you, or pays. Platforms other than Google Forms
are marked unsupported, with a link to the official page.

## Free-tier limits to know

| Service | Free limit that matters here |
|---|---|
| Supabase | 500 MB database, 50k monthly users; **pauses after 7 days without activity** (the 2-hourly worker keeps it awake) |
| GitHub Actions | Unlimited minutes on public repos; private repo quotas depend on plan. A 10-minute scan schedule is about 4,320 runs per 30-day month. |
| Vercel Hobby | Free for personal, **non-commercial** projects |
| Gmail SMTP | About 500 recipients/day on a personal account (one digest per user per run) |
| Scheduling | GitHub may start cron runs late; every-10-minute scans are not real-time |

## Keys and accounts checklist (do this last)

Every value below is a placeholder until you fill it in. Nothing secret is committed: `.env*` files are git-ignored.

1. **Supabase project** (free) at https://supabase.com/dashboard → New project.
   - SQL Editor → paste and run the migration files in timestamp order, including [supabase/migrations/20261024000000_verified_events.sql](supabase/migrations/20261024000000_verified_events.sql) and [supabase/migrations/20261024000001_retract_unsubstantiated_seed_events.sql](supabase/migrations/20261024000001_retract_unsubstantiated_seed_events.sql)
     (or `npx supabase link` then `npx supabase db push`).
   - Project Settings → API Keys: copy the **Project URL**, the **publishable** key (`sb_publishable_…`) and the **secret** key (`sb_secret_…`).
2. **Google sign-in**
   - Google Cloud Console → APIs & Services → OAuth consent screen: External, app name, your email.
   - Credentials → Create OAuth client ID → **Web application**.
     Authorized JavaScript origins: `http://localhost:3000` (add your Vercel URL later).
     Authorized redirect URI: the callback shown in Supabase → Authentication → Providers → Google (looks like `https://<ref>.supabase.co/auth/v1/callback`).
   - Supabase → Authentication → Providers → Google: enable, paste the Client ID and Client Secret.
   - Supabase → Authentication → URL Configuration: Site URL `http://localhost:3000`; Redirect URLs `http://localhost:3000/**` (add `https://<your-app>.vercel.app/**` later).
3. **Web env**: copy [.env.example](.env.example) to `.env.local` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. **Worker env**: copy [worker/.env.example](worker/.env.example) to `worker/.env` and fill `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
   Optional live RLS check: `RLS_TEST=1 .venv/Scripts/python -m pytest -m live` (needs `SUPABASE_PUBLISHABLE_KEY` too).
5. **Email alerts (optional)**: a Gmail account with 2-Step Verification → https://myaccount.google.com/apppasswords → create an
   app password → `GMAIL_USER` and `GMAIL_APP_PASSWORD` in `worker/.env`. Use a dedicated account, not a college admin mailbox.
6. **GitHub**: push the repo. Settings → Secrets and variables → Actions:
   secrets `SUPABASE_URL`, `SUPABASE_SECRET_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`; variable `SITE_URL` (your site URL).
   Actions → worker → **Run workflow** once to test. Until the secrets exist, the scheduled job just posts a notice.
7. **Deploy the website**: https://vercel.com → Import the GitHub repo → add the two `NEXT_PUBLIC_…` env vars → Deploy.
   Then add the Vercel URL to the Google OAuth origins and the Supabase redirect URLs.
8. **Make yourself admin** (for /admin source health): in the Supabase SQL editor run
   `update auth.users set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}' where email = 'you@example.com';`
   then sign out and back in.

## Known limits (honest list)

- Discovery checks the listed platforms and college feeds in [worker/scrapers.py](worker/scrapers.py). College posts without event dates are excluded. Events posted only on Instagram or WhatsApp are not found.
- GDG community events are disabled: their robots.txt disallows the API.
- Devpost publishes submission periods, not registration deadlines, so deadlines for Devpost events show "Not announced".
- The registration agent supports single-section Google Forms. Multi-section forms, file uploads and payments are left to you.
- The agent runs with the worker's secret key, so run it only on your own machine for your own registrations.
  Per-user sign-in for the agent is the upgrade needed before other people run it.
