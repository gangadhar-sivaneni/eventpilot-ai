-- Migration: Add auto_register and notify_paid to user_preferences
-- Expand alert_type constraint to support auto_registered and paid_event_review

alter table public.user_preferences
  add column if not exists auto_register boolean not null default false,
  add column if not exists notify_paid boolean not null default true;

-- Update event_alerts check constraint to support auto-registration & paid event review alerts
alter table public.event_alerts
  drop constraint if exists event_alerts_alert_type_check;

alter table public.event_alerts
  add constraint event_alerts_alert_type_check
  check (alert_type in ('new_event', 'registration_opened', 'deadline_reminder', 'availability_changed', 'registration_started', 'registration_confirmed', 'missing_info', 'auto_registered', 'paid_event_review'));
