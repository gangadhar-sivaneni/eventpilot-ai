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

-- Allow anonymous or authenticated users to subscribe from the browser
create policy anon_subscribe on public.push_subscriptions
  for insert to anon, authenticated with check (true);

create policy anon_unsubscribe on public.push_subscriptions
  for delete to anon, authenticated using (true);

create policy public_read on public.push_subscriptions
  for select to anon, authenticated using (true);
