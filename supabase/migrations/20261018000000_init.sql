-- EventPilot AI initial schema. Run with `supabase db push` or paste into the Supabase SQL editor.
-- Rule of thumb: browser users touch only their own rows; the worker (secret key) owns the catalogue and queue.

-- ───────────────────────── helpers ─────────────────────────
create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  user_id          uuid primary key references auth.users on delete cascade,
  email            text not null,                       -- copied from Google identity
  full_name        text check (char_length(full_name) <= 120),
  phone            text check (phone ~ '^\+?[0-9 ()-]{7,20}$'),
  date_of_birth    date check (date_of_birth > '1900-01-01'),   -- "not in the future" is checked by the app (checks must be immutable)
  gender           text check (gender in ('female', 'male', 'non_binary', 'prefer_not_to_say')),
  country          text check (char_length(country) <= 60),
  city             text check (char_length(city) <= 80),
  organization     text check (char_length(organization) <= 160),   -- college or company
  occupation       text check (char_length(occupation) <= 80),
  student_id       text check (char_length(student_id) <= 40),      -- roll number
  department       text check (char_length(department) <= 80),      -- branch
  graduation_year  int  check (graduation_year between 1950 and 2100),
  bio              text check (char_length(bio) <= 1000),
  portfolio_url    text check (portfolio_url ~ '^https?://'),
  github_url       text check (github_url ~ '^https?://'),
  linkedin_url     text check (linkedin_url ~ '^https?://'),
  resume_url       text check (resume_url ~ '^https?://'),
  tshirt_size      text check (tshirt_size in ('XS', 'S', 'M', 'L', 'XL', 'XXL')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.user_preferences (
  user_id                     uuid primary key references auth.users on delete cascade,
  categories                  text[] not null default '{}',   -- empty = any
  countries                   text[] not null default '{}',
  cities                      text[] not null default '{}',
  formats                     text[] not null default '{}' check (formats <@ array['online', 'in_person', 'hybrid']),
  max_fee                     numeric check (max_fee >= 0),   -- null = any; 0 = free only (unknown never counts as free)
  prize_only                  boolean not null default false,
  alert_new_event             boolean not null default true,
  alert_registration_opened   boolean not null default true,
  alert_deadline_reminder     boolean not null default true,
  alert_availability_changed  boolean not null default true,
  email_alerts                boolean not null default true,
  updated_at                  timestamptz not null default now()
);

create table public.registration_answers (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  question    text not null check (char_length(question) between 3 and 300),
  answer      text not null check (char_length(answer) <= 4000),
  updated_at  timestamptz not null default now(),
  unique (user_id, question)
);

-- ───────────────────────── catalogue (worker-owned) ─────────────────────────
create table public.event_sources (
  id               bigint generated always as identity primary key,
  key              text not null unique,                 -- matches worker/sources/<key>.py
  name             text not null,
  type             text not null check (type in ('api', 'rss', 'html', 'synthetic')),
  url              text not null check (url ~ '^https?://'),
  enabled          boolean not null default true,
  last_checked_at  timestamptz,
  last_success_at  timestamptz,
  last_error       text,
  last_counts      jsonb not null default '{}'
);

create table public.events (
  id                           bigint generated always as identity primary key,
  source_id                    bigint not null references public.event_sources on delete cascade,
  external_id                  text,
  url                          text not null unique check (url ~ '^https?://'),   -- canonical URL
  registration_url             text check (registration_url ~ '^https?://'),
  title                        text not null check (char_length(title) between 2 and 300),
  description                  text,
  organizer                    text,
  city                         text,
  country                      text,
  format                       text not null default 'unknown' check (format in ('online', 'in_person', 'hybrid', 'unknown')),
  starts_at                    timestamptz,
  ends_at                      timestamptz,
  registration_opens_at        timestamptz,
  registration_deadline        timestamptz,
  fee_status                   text not null default 'unknown' check (fee_status in ('free', 'paid', 'unknown')),
  fee_amount                   numeric check (fee_amount >= 0),
  fee_currency                 text check (fee_currency ~ '^[A-Z]{3}$'),
  prize_text                   text,
  registration_status          text not null default 'unknown' check (registration_status in ('upcoming', 'open', 'closed', 'unknown')),
  previous_registration_status text,
  status_changed_at            timestamptz,
  eligibility                  text,
  categories                   text[] not null default '{}',
  first_seen_at                timestamptz not null default now(),
  last_checked_at              timestamptz not null default now(),
  unique (source_id, external_id),
  check (fee_status <> 'free' or coalesce(fee_amount, 0) = 0)
);
create index events_first_seen_idx on public.events (first_seen_at desc);
create index events_deadline_idx on public.events (registration_deadline);
create index events_categories_idx on public.events using gin (categories);

-- ───────────────────────── user-owned activity ─────────────────────────
create table public.saved_searches (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references auth.users on delete cascade,
  name        text not null check (char_length(name) between 1 and 80),
  filters     jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

create table public.event_alerts (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users on delete cascade,
  event_id        bigint not null references public.events on delete cascade,
  alert_type      text not null check (alert_type in ('new_event', 'registration_opened', 'deadline_reminder', 'availability_changed')),
  message         text not null,
  read_at         timestamptz,
  emailed_at      timestamptz,          -- outbox: null = not delivered by email yet
  email_attempts  int not null default 0,
  created_at      timestamptz not null default now(),
  unique (user_id, event_id, alert_type)
);
create index event_alerts_outbox_idx on public.event_alerts (created_at) where emailed_at is null;

create table public.registrations (
  id                   bigint generated always as identity primary key,
  user_id              uuid not null default auth.uid() references auth.users on delete cascade,
  event_id             bigint not null references public.events on delete cascade,
  status               text not null default 'not_started'
                       check (status in ('not_started', 'prepared', 'awaiting_approval', 'submitted', 'confirmed', 'failed', 'unknown')),
  proposed_answers     jsonb not null default '[]',  -- [{label, value, source, confidence, required}] written by the agent
  unresolved_fields    jsonb not null default '[]',  -- labels the agent refused to guess
  approved_at          timestamptz,                  -- user's explicit go-ahead for submission
  approved_fee_amount  numeric check (approved_fee_amount >= 0),
  idempotency_key      uuid not null default gen_random_uuid(),
  locked_until         timestamptz,
  attempt_count        int not null default 0,
  submitted_at         timestamptz,
  evidence             text,                         -- confirmation text/reference proving the outcome
  error_summary        text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (user_id, event_id)
);

-- ───────────────────────── worker internals ─────────────────────────
create table public.automation_jobs (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('discovery', 'match', 'notify', 'registration', 'cleanup')),
  scope        text not null default '',     -- source key, registration id, ...
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  counts       jsonb not null default '{}',
  error        text,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz
);
-- concurrency control: at most one running job per kind+scope
create unique index automation_jobs_one_running on public.automation_jobs (kind, scope) where status = 'running';

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users on delete set null,
  action      text not null,
  details     jsonb not null default '{}',   -- never secrets or form values
  created_at  timestamptz not null default now()
);

-- ───────────────────────── triggers ─────────────────────────
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
create trigger prefs_touch before update on public.user_preferences for each row execute function public.touch_updated_at();
create trigger answers_touch before update on public.registration_answers for each row execute function public.touch_updated_at();
create trigger registrations_touch before update on public.registrations for each row execute function public.touch_updated_at();

-- every Google sign-up gets a profile + default preferences
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name');
  insert into public.user_preferences (user_id) values (new.id);
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- user-initiated account deletion; cascades to every owned row
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_logs (user_id, action) values (null, 'account_deleted');
  delete from auth.users where id = auth.uid();
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

-- ───────────────────────── row level security ─────────────────────────
alter table public.profiles             enable row level security;
alter table public.user_preferences     enable row level security;
alter table public.registration_answers enable row level security;
alter table public.event_sources        enable row level security;
alter table public.events               enable row level security;
alter table public.saved_searches       enable row level security;
alter table public.event_alerts         enable row level security;
alter table public.registrations        enable row level security;
alter table public.automation_jobs      enable row level security;
alter table public.audit_logs           enable row level security;

-- owner-only tables
create policy owner_all on public.profiles             for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on public.user_preferences     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on public.registration_answers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_all on public.saved_searches       for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- public catalogue: anyone reads, nobody writes from the browser
create policy public_read on public.events for select to anon, authenticated using (true);
create policy admin_read on public.event_sources for select to authenticated using (public.is_admin());
create policy admin_read on public.automation_jobs for select to authenticated using (public.is_admin());

-- alerts: owner reads and may only mark read
create policy owner_read on public.event_alerts for select to authenticated using (user_id = auth.uid());
create policy owner_mark_read on public.event_alerts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.event_alerts from authenticated;
grant update (read_at) on public.event_alerts to authenticated;

-- registrations: owner creates, reviews and approves; the worker writes everything else
create policy owner_read on public.registrations for select to authenticated using (user_id = auth.uid());
create policy owner_create on public.registrations for insert to authenticated with check (user_id = auth.uid() and status = 'not_started');
create policy owner_approve on public.registrations for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy owner_delete on public.registrations for delete to authenticated using (user_id = auth.uid() and status in ('not_started', 'prepared', 'awaiting_approval', 'failed'));
revoke insert, update on public.registrations from authenticated;
grant insert (event_id) on public.registrations to authenticated;
-- the worker re-validates answers and approval before it submits anything, so these edits cannot bypass review
grant update (proposed_answers, unresolved_fields, approved_at, approved_fee_amount) on public.registrations to authenticated;

-- audit log: owner may read their own trail
create policy owner_read on public.audit_logs for select to authenticated using (user_id = auth.uid());

-- profiles: rows come from the sign-up trigger; email comes from Google and the browser cannot change it
-- (a column-level revoke is ignored while a table-level grant exists, so revoke the table, then grant columns)
revoke insert, update on public.profiles from authenticated;
grant update (full_name, phone, date_of_birth, gender, country, city, organization, occupation, student_id,
              department, graduation_year, bio, portfolio_url, github_url, linkedin_url, resume_url, tshirt_size)
  on public.profiles to authenticated;
revoke insert on public.user_preferences from authenticated;

-- ───────────────────────── seed sources ─────────────────────────
insert into public.event_sources (key, name, type, url, enabled) values
  ('synthetic',   'Synthetic test events',          'synthetic', 'https://example.com/synthetic', false),
  ('devpost',     'Devpost hackathons',             'api',  'https://devpost.com/api/hackathons', true),
  ('unstop',      'Unstop opportunities',           'api',  'https://unstop.com/api/public/opportunity/search-result', true),
  ('devfolio',    'Devfolio hackathons',            'api',  'https://api.devfolio.co/api/search/hackathons', true),
  ('hackerearth', 'HackerEarth challenges',         'api',  'https://www.hackerearth.com/chrome-extension/events/', true),
  ('mlh',         'Major League Hacking',           'html', 'https://www.mlh.com/seasons', true),
  ('gdg',         'Google Developer Groups events', 'api',  'https://gdg.community.dev/api/event_slim/', false), -- robots.txt disallows /api/ (checked 2026-10-18)
  ('college_rss', 'College website feeds',          'rss',  'https://mlrit.ac.in/feed/', true);
