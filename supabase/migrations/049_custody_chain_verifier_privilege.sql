-- The application reads custody rows with the service role, but PostgreSQL
-- requires row-update privilege for SELECT ... FOR SHARE. Custody tables
-- intentionally deny that privilege to the service role, so the original
-- security-invoker verifier could never acquire its coordination lock.
--
-- Keep the tables read-only to the application and move only the verification
-- lock behind this narrowly scoped, owner-executed function.

create or replace function public.verify_custody_chain(p_bag_id uuid)
returns table (ok boolean, broken_seq integer, total integer)
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  ev public.custody_events%rowtype;
  expected_prev text := repeat('0', 64);
  recomputed text;
  payload text;
  cnt integer := 0;
begin
  -- Coordinate verification with custody inserts through the same parent-row
  -- lock while exposing no table write privilege to the caller.
  perform 1 from public.bags where id = p_bag_id for share;
  if not found then
    ok := false; broken_seq := null; total := 0; return next; return;
  end if;

  ok := true;
  broken_seq := null;
  total := 0;

  for ev in
    select * from public.custody_events where bag_id = p_bag_id order by seq asc
  loop
    cnt := cnt + 1;
    if ev.prev_hash <> expected_prev then
      ok := false; broken_seq := ev.seq; total := cnt; return next; return;
    end if;

    payload := concat_ws('|',
      ev.prev_hash, ev.bag_id::text, ev.badge_code, ev.seq::text,
      ev.event_type, ev.actor_role, coalesce(ev.actor_name, ''),
      coalesce(ev.identity_verification_id::text, ''), ev.verified_method,
      coalesce(ev.photo_path, ''), coalesce(ev.location_lat::text, ''),
      coalesce(ev.location_lng::text, ''), coalesce(ev.note, ''),
      extract(epoch from ev.created_at)::text
    );
    recomputed := pg_catalog.encode(extensions.digest(payload, 'sha256'), 'hex');

    if recomputed <> ev.event_hash then
      ok := false; broken_seq := ev.seq; total := cnt; return next; return;
    end if;
    expected_prev := ev.event_hash;
  end loop;

  total := cnt;
  return next;
end;
$$;

revoke all on function public.verify_custody_chain(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_custody_chain(uuid)
  to service_role;

