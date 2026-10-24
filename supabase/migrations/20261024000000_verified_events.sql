-- Existing catalogue rows have not passed the stricter event-date and tech/region checks.
-- Keep them out of public discovery until the worker fetches and verifies them again.
alter table public.events
  add column if not exists quality_verified_at timestamptz;

create index if not exists events_quality_verified_at_idx
  on public.events (quality_verified_at)
  where quality_verified_at is not null;
