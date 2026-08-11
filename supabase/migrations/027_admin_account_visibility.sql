-- Full-admin authentication activity feed.
-- The function exposes only the event fields needed by Travelyt operations;
-- raw Supabase audit payloads remain inside the auth schema.

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
    entry.id,
    coalesce(entry.payload ->> 'action', 'unknown') as action,
    nullif(entry.payload ->> 'actor_id', '') as actor_id,
    nullif(entry.payload ->> 'actor_username', '') as actor_username,
    entry.created_at,
    entry.ip_address::text
  from auth.audit_log_entries as entry
  order by entry.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
$$;

revoke all on function public.travelyt_admin_auth_events(integer) from public;
revoke all on function public.travelyt_admin_auth_events(integer) from anon;
revoke all on function public.travelyt_admin_auth_events(integer) from authenticated;
grant execute on function public.travelyt_admin_auth_events(integer) to service_role;
