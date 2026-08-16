-- Preserve one person-bound driver account while allowing ops to replace a
-- lost one-time credential. The old hash is overwritten, so it stops working
-- immediately; rotation metadata remains available for operational audit.

alter table public.driver_access_codes
  add column if not exists code_rotated_at timestamptz,
  add column if not exists code_rotated_by text,
  add column if not exists code_rotation_count integer not null default 0;

alter table public.driver_access_codes
  drop constraint if exists driver_access_codes_rotation_count_check;
alter table public.driver_access_codes
  add constraint driver_access_codes_rotation_count_check
    check (code_rotation_count >= 0);

-- Existing historical data contains a small number of duplicate active
-- records that must be reviewed rather than silently revoked. This trigger
-- blocks any new duplicate activation while leaving that cleanup auditable.
create or replace function public.prevent_duplicate_active_driver_person()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'active' and exists (
    select 1
    from public.driver_access_codes existing
    where existing.person_key_hash = new.person_key_hash
      and existing.status = 'active'
      and existing.id <> new.id
  ) then
    raise exception 'This person already has an active driver account.';
  end if;
  return new;
end;
$$;

drop trigger if exists driver_access_codes_one_active_person
  on public.driver_access_codes;
create trigger driver_access_codes_one_active_person
before insert or update of person_key_hash, status
on public.driver_access_codes
for each row execute function public.prevent_duplicate_active_driver_person();
