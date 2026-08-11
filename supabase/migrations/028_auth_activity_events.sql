-- Travelyt-owned successful sign-in activity.
-- Passwords, access tokens, raw provider payloads, and government ID data are
-- intentionally excluded.

create table if not exists public.auth_activity_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  user_email text,
  event_type text not null check (event_type in ('customer_login', 'admin_login')),
  auth_level text not null check (auth_level in ('aal1', 'aal2')),
  user_role text not null,
  created_at timestamptz not null default now()
);

create index if not exists auth_activity_events_user_created_idx
  on public.auth_activity_events(user_id, created_at desc);
create index if not exists auth_activity_events_created_idx
  on public.auth_activity_events(created_at desc);

alter table public.auth_activity_events enable row level security;
revoke all on table public.auth_activity_events from public;
revoke all on table public.auth_activity_events from anon;
revoke all on table public.auth_activity_events from authenticated;
grant select, insert on table public.auth_activity_events to service_role;

create or replace function public.travelyt_admin_auth_events(
  p_limit integer default 100
)
returns table (
  id uuid,
  action text,
  actor_id text,
  actor_username text,
  created_at timestamptz,
  ip_address text
)
language sql
security definer
set search_path = ''
as $$
  select
    event.id,
    event.event_type as action,
    event.user_id::text as actor_id,
    event.user_email as actor_username,
    event.created_at,
    null::text as ip_address
  from public.auth_activity_events as event
  order by event.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.travelyt_admin_auth_events(integer) from public;
revoke all on function public.travelyt_admin_auth_events(integer) from anon;
revoke all on function public.travelyt_admin_auth_events(integer) from authenticated;
grant execute on function public.travelyt_admin_auth_events(integer) to service_role;
