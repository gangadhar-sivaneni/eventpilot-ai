-- The bundled tech_community list was manually authored and was not backed by
-- event-specific source evidence. Retire the adapter and hide its records.
update public.events
set quality_verified_at = null
where source_id = (select id from public.event_sources where key = 'tech_community');

-- Older normalizer versions incorrectly copied registration deadlines into
-- starts_at when the source omitted an event date. Retract those records too.
update public.events
set quality_verified_at = null
where starts_at is not null
  and registration_deadline is not null
  and starts_at = registration_deadline;

-- Devpost exposes submission windows, not a confirmed event schedule. Older
-- imports labeled those submission dates as event starts; withdraw them until
-- a source provides an explicit event_start_date / starts_at.
update public.events
set quality_verified_at = null
where source_id = (select id from public.event_sources where key = 'devpost');

update public.event_sources
set enabled = false,
    last_error = 'Disabled: retired unsubstantiated hardcoded event seed list.'
where key = 'tech_community';

-- Remove ended listings from the active events table. Related alerts and
-- registrations follow the schema's ON DELETE CASCADE rules.
delete from public.events
where coalesce(ends_at, starts_at) <= now();
