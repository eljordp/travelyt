-- Close three fail-closed gaps:
-- 1. Bind driver access records to a deterministic person key so duplicate
--    credentials for one person cannot fill primary and backup roles.
-- 2. Preserve a versioned electronic identity/biometric consent artifact.
-- 3. Track image destruction, purpose-end deletion, and legal holds.

create extension if not exists pgcrypto;

alter table public.driver_access_codes
  add column if not exists person_key_hash text;

update public.driver_access_codes
set person_key_hash = encode(
  extensions.digest(
    case
      when nullif(lower(trim(driver_email)), '') is not null
        then 'email:' || lower(trim(driver_email))
      when nullif(regexp_replace(coalesce(driver_phone, ''), '[^0-9+]', '', 'g'), '') is not null
        then 'phone:' || regexp_replace(driver_phone, '[^0-9+]', '', 'g')
      else 'name:' || canonical_driver_name
    end,
    'sha256'
  ),
  'hex'
)
where person_key_hash is null;

alter table public.driver_access_codes
  alter column person_key_hash set not null;

alter table public.driver_access_codes
  drop constraint if exists driver_access_codes_person_key_hash_check;
alter table public.driver_access_codes
  add constraint driver_access_codes_person_key_hash_check
    check (person_key_hash ~ '^[0-9a-f]{64}$');

create index if not exists driver_access_codes_person_key_status_idx
  on public.driver_access_codes (person_key_hash, status);

create or replace function public.enforce_distinct_assignment_people()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  primary_person_key text;
  backup_person_key text;
  primary_name text;
  backup_name text;
begin
  select person_key_hash, canonical_driver_name
    into primary_person_key, primary_name
  from public.driver_access_codes
  where id = new.primary_driver_access_id;

  select person_key_hash, canonical_driver_name
    into backup_person_key, backup_name
  from public.driver_access_codes
  where id = new.backup_driver_access_id;

  if primary_person_key is null or backup_person_key is null then
    raise exception 'Primary and backup must have person-bound access records.';
  end if;

  if primary_person_key = backup_person_key or primary_name = backup_name then
    raise exception 'Primary and backup must be different verified people.';
  end if;

  return new;
end;
$$;

drop trigger if exists booking_agent_assignments_distinct_people
  on public.booking_agent_assignments;
create trigger booking_agent_assignments_distinct_people
before insert or update of primary_driver_access_id, backup_driver_access_id
on public.booking_agent_assignments
for each row execute function public.enforce_distinct_assignment_people();

alter table public.identity_verifications
  add column if not exists consent_version text,
  add column if not exists consent_signature_name text,
  add column if not exists consent_scope jsonb not null default '{}'::jsonb,
  add column if not exists consent_ip_hash text,
  add column if not exists consent_user_agent_hash text,
  add column if not exists raw_deletion_status text not null default 'not_applicable',
  add column if not exists raw_deletion_attempted_at timestamptz,
  add column if not exists raw_destroyed_at timestamptz,
  add column if not exists raw_destruction_receipt jsonb not null default '{}'::jsonb,
  add column if not exists raw_deletion_error text,
  add column if not exists raw_purpose_ended_at timestamptz,
  add column if not exists raw_legal_hold_at timestamptz,
  add column if not exists raw_legal_hold_reason text;

alter table public.identity_verifications
  drop constraint if exists identity_verifications_raw_deletion_status_check;
alter table public.identity_verifications
  add constraint identity_verifications_raw_deletion_status_check
    check (raw_deletion_status in ('not_applicable', 'scheduled', 'failed', 'destroyed'));

create index if not exists identity_verifications_raw_deletion_due_idx
  on public.identity_verifications (raw_deletion_status, raw_retention_until)
  where raw_deletion_status in ('scheduled', 'failed');
