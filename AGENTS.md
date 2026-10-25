<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Event Discovery & Verification Rules (Strictly Enforced)

See [RULES.md](RULES.md) for full documentation. All agents must follow:
1. **Zero Hallucination Policy**: Never invent, guess, or synthesize event dates, URLs, or entities. No hardcoded or mock event files (`community_events.py` etc.).
2. **Search Real Event-Hosting Platforms**: Do NOT scrape generic college homepages/news feeds (they publish old/stale previous-year news). Search platforms where registrations are actually hosted (Unstop, StudentTribe, Devfolio, Luma, Devpost, etc.) or verified dedicated event domains (e.g. `mlritcie.in` for Equinox 2.0).
3. **If Registration Ended, Delete from Database**: On every discovery run, purge any event where `registration_deadline <= now`, `registration_status == 'closed'`, or the event has ended.
4. **If No Updation, Don't Touch It**: Only update records when event facts materially change. Never overwrite known values with nulls.
5. **Mandatory Live Link Verification**: Every link must return HTTP 200/2xx without error redirects. Broken or 404 links must never have `quality_verified_at`.
