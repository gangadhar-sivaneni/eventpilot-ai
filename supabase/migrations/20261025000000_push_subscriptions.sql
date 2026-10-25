-- Web Push Subscriptions Table
create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_id     uuid references auth.users on delete cascade,
  created_at  timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

-- Authenticated users can read and manage only their own subscriptions
create policy owner_read on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());

-- Insert allows saving an anonymous subscription (user_id null) or one owned by the caller
create policy user_subscribe on public.push_subscriptions
  for insert to anon, authenticated with check (user_id is null or user_id = auth.uid());

-- Delete allows deleting own subscription, or unauthenticated cleanup
create policy owner_unsubscribe on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

create policy anon_unsubscribe on public.push_subscriptions
  for delete to anon using (user_id is null);
