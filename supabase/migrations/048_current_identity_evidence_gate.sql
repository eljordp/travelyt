-- Denormalized booking flags are display/cache fields, not identity authority.
-- A pilot approval and custody checkpoint must revalidate a current, complete
-- provider record. This migration also invalidates stale test/manual-review
-- flags left behind when migration 047 correctly downgraded provider rows.

-- New bookings must carry a distinct traveler authorization for the airline
-- and TSA screening/search process. Legacy records remain null rather than
-- being falsely backfilled with consent that was never collected.
alter table public.bookings
  add column if not exists consent_to_search_at timestamptz,
  add column if not exists consent_to_search_version text;
alter table public.bookings
  drop constraint if exists bookings_consent_to_search_shape_check;
alter table public.bookings
  add constraint bookings_consent_to_search_shape_check check (
    (consent_to_search_at is null and consent_to_search_version is null)
    or (
      consent_to_search_at is not null
      and consent_to_search_version is not null
      and consent_to_search_version = '2026-08-30'
    )
  );

create or replace function public.enforce_booking_search_consent_immutability()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (new.consent_to_search_at is null) is distinct from
      (new.consent_to_search_version is null)
    or (
      new.consent_to_search_at is not null
      and (
        new.consent_to_search_at > clock_timestamp()
        or new.consent_to_search_version is distinct from '2026-08-30'
      )
    ) then
    raise exception using errcode = 'P0001',
      message = 'Baggage-screening consent must be paired, current, and use the approved version.';
  end if;
  if old.consent_to_search_at is not null and (
    new.consent_to_search_at is distinct from old.consent_to_search_at
    or new.consent_to_search_version is distinct from old.consent_to_search_version
  ) then
    raise exception using errcode = 'P0001',
      message = 'Recorded baggage-screening consent is immutable.';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_search_consent_immutability on public.bookings;
create trigger bookings_search_consent_immutability
before update of consent_to_search_at, consent_to_search_version on public.bookings
for each row execute function public.enforce_booking_search_consent_immutability();

create or replace function public.enforce_booking_search_consent_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.consent_to_search_at is null
    or new.consent_to_search_at > clock_timestamp()
    or new.consent_to_search_version is distinct from '2026-08-30' then
    raise exception using errcode = 'P0001',
      message = 'Current airline/TSA baggage-inspection consent is required for every new booking.';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_search_consent_required on public.bookings;
create trigger bookings_search_consent_required
before insert on public.bookings
for each row execute function public.enforce_booking_search_consent_insert();

create or replace function public.booking_has_current_search_consent(
  p_booking_id text
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.bookings booking
    where booking.id = p_booking_id
      and booking.consent_to_search_at is not null
      and booking.consent_to_search_at <= clock_timestamp()
      and booking.consent_to_search_version = '2026-08-30'
  );
$$;

revoke all on function public.enforce_booking_search_consent_immutability() from public;
revoke all on function public.enforce_booking_search_consent_immutability() from anon;
revoke all on function public.enforce_booking_search_consent_immutability() from authenticated;
revoke all on function public.enforce_booking_search_consent_insert() from public;
revoke all on function public.enforce_booking_search_consent_insert() from anon;
revoke all on function public.enforce_booking_search_consent_insert() from authenticated;
revoke all on function public.booking_has_current_search_consent(text) from public;
revoke all on function public.booking_has_current_search_consent(text) from anon;
revoke all on function public.booking_has_current_search_consent(text) from authenticated;

update public.identity_verifications
set verified_at = null, updated_at = now()
where status <> 'verified' and verified_at is not null;

update public.identity_verifications
set
  status = 'manual_review',
  liveness_status = 'manual_review',
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'manual_review_reason', 'verified_status_missing_verified_at',
    'manual_reviewed_at', now()
  ),
  updated_at = now()
where status = 'verified' and verified_at is null;

alter table public.identity_verifications
  drop constraint if exists identity_verifications_verified_at_status_check;
alter table public.identity_verifications
  add constraint identity_verifications_verified_at_status_check check (
    (status = 'verified' and verified_at is not null)
    or (status <> 'verified' and verified_at is null)
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_destroyed_not_verified_check;
alter table public.identity_verifications
  add constraint identity_verifications_destroyed_not_verified_check check (
    status <> 'verified'
    or (
      raw_purpose_ended_at is null
      and raw_destroyed_at is null
      and raw_deletion_status <> 'destroyed'
    )
  ) not valid;
alter table public.identity_verifications
  add column if not exists raw_archive_claim_token uuid,
  add column if not exists raw_archive_claimed_at timestamptz,
  add column if not exists raw_deletion_claim_token uuid,
  add column if not exists raw_deletion_claimed_at timestamptz,
  add column if not exists provider_session_claim_token uuid,
  add column if not exists provider_session_claimed_at timestamptz,
  add column if not exists provider_session_claim_livemode boolean,
  add column if not exists provider_session_livemode boolean,
  add column if not exists provider_session_creation_status text not null default 'not_requested',
  add column if not exists provider_session_creation_started_at timestamptz,
  add column if not exists provider_session_creation_error text,
  add column if not exists provider_redaction_status text not null default 'not_requested',
  add column if not exists provider_redaction_claim_token uuid,
  add column if not exists provider_redaction_claimed_at timestamptz,
  add column if not exists provider_redaction_requested_at timestamptz,
  add column if not exists provider_redaction_completed_at timestamptz,
  add column if not exists provider_redaction_error text;
alter table public.identity_verifications
  drop constraint if exists identity_verifications_archive_claim_shape_check;
alter table public.identity_verifications
  add constraint identity_verifications_archive_claim_shape_check check (
    (raw_archive_claim_token is null and raw_archive_claimed_at is null)
    or (raw_archive_claim_token is not null and raw_archive_claimed_at is not null)
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_deletion_claim_shape_check;
alter table public.identity_verifications
  add constraint identity_verifications_deletion_claim_shape_check check (
    (raw_deletion_claim_token is null and raw_deletion_claimed_at is null)
    or (raw_deletion_claim_token is not null and raw_deletion_claimed_at is not null)
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_provider_redaction_status_check;
alter table public.identity_verifications
  add constraint identity_verifications_provider_redaction_status_check check (
    provider_redaction_status in (
      'not_requested', 'requesting', 'processing', 'outcome_unknown',
      'failed', 'redacted'
    )
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_provider_redaction_claim_shape_check;
alter table public.identity_verifications
  add constraint identity_verifications_provider_redaction_claim_shape_check check (
    (provider_redaction_claim_token is null and provider_redaction_claimed_at is null)
    or (
      provider_redaction_claim_token is not null
      and provider_redaction_claimed_at is not null
    )
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_provider_session_claim_shape_check;
alter table public.identity_verifications
  add constraint identity_verifications_provider_session_claim_shape_check check (
    (
      provider_session_claim_token is null
      and provider_session_claimed_at is null
      and provider_session_claim_livemode is null
    )
    or (
      provider_session_claim_token is not null
      and provider_session_claimed_at is not null
      and provider_session_claim_livemode is not null
    )
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_provider_session_creation_status_check;
alter table public.identity_verifications
  add constraint identity_verifications_provider_session_creation_status_check check (
    provider_session_creation_status in (
      'not_requested', 'creating', 'outcome_unknown', 'bound', 'failed'
    )
  );
alter table public.identity_verifications
  drop constraint if exists identity_verifications_provider_session_creation_started_check;
update public.identity_verifications
set provider_session_creation_status = 'bound',
    provider_session_creation_started_at = coalesce(
      provider_session_creation_started_at,
      provider_session_claimed_at,
      updated_at,
      created_at
    ),
    provider_session_livemode = case
      when metadata->>'stripe_livemode' = 'true' then true
      when metadata->>'stripe_livemode' = 'false' then false
      else provider_session_livemode
    end
where provider_session_id is not null
  and provider_session_creation_status = 'not_requested';

update public.identity_verifications
set provider_session_creation_started_at = coalesce(
      provider_session_creation_started_at,
      provider_session_claimed_at,
      updated_at,
      created_at
    )
where provider_session_creation_status in ('creating', 'outcome_unknown')
  and provider_session_creation_started_at is null;
alter table public.identity_verifications
  add constraint identity_verifications_provider_session_creation_started_check check (
    provider_session_creation_status in ('not_requested', 'failed')
    or provider_session_creation_started_at is not null
  );
update public.identity_verifications
set status = 'manual_review',
    liveness_status = 'manual_review',
    verified_at = null,
    metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
      'manual_review_reason', 'verified_identity_missing_bound_provider_session',
      'manual_reviewed_at', now()
    ),
    updated_at = now()
where status = 'verified'
  and (
    provider_session_id is null
    or provider_session_creation_status <> 'bound'
    or provider_session_livemode is null
  );

-- Driver access remains attached to the same auth subject even if that person
-- later changes their login email. Email remains a recovery/backfill hint, not
-- the durable ownership key.
alter table public.driver_access_codes
  add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.driver_access_codes
  drop constraint if exists driver_access_codes_owner_user_id_fkey;
alter table public.driver_access_codes
  add constraint driver_access_codes_owner_user_id_fkey
  foreign key (owner_user_id) references auth.users(id) on delete restrict;
create index if not exists driver_access_codes_owner_user_id_idx
  on public.driver_access_codes(owner_user_id)
  where owner_user_id is not null;

update public.driver_access_codes access
set owner_user_id = (
  select auth_user.id
  from auth.users auth_user
  where nullif(btrim(coalesce(auth_user.email, '')), '') is not null
    and lower(btrim(auth_user.email)) = lower(btrim(access.driver_email))
)
where access.owner_user_id is null
  and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
  and 1 = (
    select count(*)
    from auth.users auth_user
    where nullif(btrim(coalesce(auth_user.email, '')), '') is not null
      and lower(btrim(auth_user.email)) = lower(btrim(access.driver_email))
  );

create or replace function public.bind_driver_access_owner_from_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_owner_user_id uuid;
begin
  if new.owner_user_id is not null
    or nullif(btrim(coalesce(new.driver_email, '')), '') is null then
    return new;
  end if;
  select auth_user.id into v_owner_user_id
  from auth.users auth_user
  where nullif(btrim(coalesce(auth_user.email, '')), '') is not null
    and lower(btrim(auth_user.email)) = lower(btrim(new.driver_email))
  order by auth_user.id
  limit 2;
  if (
    select count(*)
    from auth.users auth_user
    where nullif(btrim(coalesce(auth_user.email, '')), '') is not null
      and lower(btrim(auth_user.email)) = lower(btrim(new.driver_email))
  ) = 1 then
    new.owner_user_id := v_owner_user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists driver_access_codes_bind_owner on public.driver_access_codes;
create trigger driver_access_codes_bind_owner
before insert or update of driver_email on public.driver_access_codes
for each row execute function public.bind_driver_access_owner_from_email();

create or replace function public.bind_driver_access_for_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if nullif(btrim(coalesce(new.email, '')), '') is null then return new; end if;
  if (
    select count(*) from auth.users auth_user
    where nullif(btrim(coalesce(auth_user.email, '')), '') is not null
      and lower(btrim(auth_user.email)) = lower(btrim(new.email))
  ) = 1 then
    update public.driver_access_codes access
    set owner_user_id = new.id
    where access.owner_user_id is null
      and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
      and lower(btrim(access.driver_email)) = lower(btrim(new.email));
  end if;
  return new;
end;
$$;

drop trigger if exists travelyt_bind_driver_access_owner on auth.users;
create trigger travelyt_bind_driver_access_owner
after insert or update of email on auth.users
for each row execute function public.bind_driver_access_for_auth_user();

create or replace function public.enforce_driver_access_account_deletion_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if tg_op = 'UPDATE'
    and old.owner_user_id is not null
    and new.owner_user_id is distinct from old.owner_user_id
    and current_setting('travelyt.account_deletion_finalize', true) is distinct from 'on' then
    raise exception using errcode = 'P0001',
      message = 'Driver access ownership is immutable after it is bound.';
  end if;

  for v_user_id in
    select distinct candidate.user_id
    from (
      select new.owner_user_id as user_id
      union
      select case when tg_op = 'UPDATE' then old.owner_user_id else null end
      union
      select auth_user.id
      from auth.users auth_user
      where (
          nullif(btrim(coalesce(new.driver_email, '')), '') is not null
          and lower(btrim(auth_user.email)) = lower(btrim(new.driver_email))
        ) or (
          tg_op = 'UPDATE'
          and nullif(btrim(coalesce(old.driver_email, '')), '') is not null
          and lower(btrim(auth_user.email)) = lower(btrim(old.driver_email))
        )
    ) candidate
    where candidate.user_id is not null
    order by candidate.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) and not (
      (
        current_setting('travelyt.account_deletion_claim', true) = 'on'
        or current_setting('travelyt.account_deletion_finalize', true) = 'on'
      )
      and new.status = 'revoked'
      and (
        new.owner_user_id is not distinct from old.owner_user_id
        or current_setting('travelyt.account_deletion_finalize', true) = 'on'
      )
    ) then
      raise exception using errcode = 'P0001',
        message = 'Driver access cannot be created or reactivated after account deletion begins.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists driver_access_codes_account_deletion_guard
  on public.driver_access_codes;
create trigger driver_access_codes_account_deletion_guard
before insert or update on public.driver_access_codes
for each row execute function public.enforce_driver_access_account_deletion_claim();
create unique index if not exists identity_verifications_provider_session_unique
  on public.identity_verifications(provider_session_id)
  where provider_session_id is not null;

alter table public.bookings enable row level security;
revoke all on table public.bookings from public, anon, authenticated;

-- A deletion claim closes provider/account races before identity originals are
-- removed and before the auth user is deleted. Only the service role can
-- create/read these private operational claims.
create table if not exists public.account_deletion_claims (
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_at timestamptz not null default now(),
  reason text not null default 'self_service_account_deletion',
  identity_ids uuid[] not null default '{}'::uuid[],
  driver_access_ids uuid[] not null default '{}'::uuid[],
  created_at timestamptz not null default now()
);
alter table public.account_deletion_claims
  add column if not exists identity_ids uuid[] not null default '{}'::uuid[],
  add column if not exists driver_access_ids uuid[] not null default '{}'::uuid[];
alter table public.account_deletion_claims enable row level security;
revoke all on public.account_deletion_claims from public, anon, authenticated;
revoke insert, update, delete, truncate on public.account_deletion_claims from service_role;
grant select on public.account_deletion_claims to service_role;

create table if not exists public.privacy_deletion_requests (
  user_id uuid primary key,
  requested_at timestamptz not null default now(),
  status text not null default 'pending_review'
    check (status in ('pending_review', 'approved', 'completed', 'denied')),
  reason text not null,
  identity_ids uuid[] not null default '{}'::uuid[],
  driver_access_ids uuid[] not null default '{}'::uuid[],
  updated_at timestamptz not null default now()
);
alter table public.privacy_deletion_requests enable row level security;
revoke all on public.privacy_deletion_requests from public, anon, authenticated;
revoke insert, update, delete, truncate on public.privacy_deletion_requests from service_role;
grant select on public.privacy_deletion_requests to service_role;

-- Mode is absent on legacy/unreviewed rows and therefore fail-closed. It is
-- generated from the server-authored eligibility snapshot so every query uses
-- one canonical value without relabeling historical operations as tests.
alter table public.bookings
  add column if not exists operational_mode text generated always as (
    pilot_eligibility_snapshot->>'operationalMode'
  ) stored;
alter table public.bookings
  drop constraint if exists bookings_operational_mode_check;
alter table public.bookings
  add constraint bookings_operational_mode_check check (
    operational_mode is null or operational_mode in ('rehearsal', 'live')
  );

alter table public.booking_checkout_sessions
  add column if not exists stripe_payment_intent_id text,
  add column if not exists capture_authorized_at timestamptz,
  add column if not exists captured_at timestamptz,
  add column if not exists operational_mode text,
  add column if not exists stripe_livemode boolean;
alter table public.booking_checkout_sessions
  drop constraint if exists booking_checkout_sessions_operational_mode_check;
alter table public.booking_checkout_sessions
  add constraint booking_checkout_sessions_operational_mode_check check (
    operational_mode is null or operational_mode in ('rehearsal', 'live')
  );
alter table public.booking_checkout_sessions
  drop constraint if exists booking_checkout_sessions_mode_match_check;
alter table public.booking_checkout_sessions
  add constraint booking_checkout_sessions_mode_match_check check (
    status not in ('open', 'capture_authorized', 'paid') or (
      operational_mode is not null
      and operational_mode in ('rehearsal', 'live')
      and stripe_livemode is not null
      and stripe_livemode = (operational_mode = 'live')
    )
  ) not valid;
alter table public.booking_checkout_sessions
  drop constraint if exists booking_checkout_sessions_active_state_shape_check;
alter table public.booking_checkout_sessions
  add constraint booking_checkout_sessions_active_state_shape_check check (
    status not in ('open', 'capture_authorized', 'paid')
    or (
      stripe_checkout_session_id is not null
      and operational_mode is not null
      and stripe_livemode is not null
      and (
        status = 'open'
        or (
          stripe_payment_intent_id is not null
          and capture_authorized_at is not null
          and (
            status = 'capture_authorized'
            or (
              status = 'paid'
              and captured_at is not null
              and captured_at >= capture_authorized_at
            )
          )
        )
      )
    )
  ) not valid;
alter table public.booking_checkout_sessions
  drop constraint if exists booking_checkout_sessions_status_check;
alter table public.booking_checkout_sessions
  add constraint booking_checkout_sessions_status_check check (
    status in (
      'creating', 'open', 'capture_authorized', 'paid',
      'expired', 'failed', 'manual_review'
    )
  );
create unique index if not exists booking_checkout_sessions_payment_intent_idx
  on public.booking_checkout_sessions (stripe_payment_intent_id)
  where stripe_payment_intent_id is not null;

alter table public.booking_agent_assignments
  add column if not exists operational_mode text;
alter table public.booking_agent_assignments
  drop constraint if exists booking_agent_assignments_operational_mode_check;
alter table public.booking_agent_assignments
  add constraint booking_agent_assignments_operational_mode_check check (
    operational_mode is null or operational_mode in ('rehearsal', 'live')
  );

alter table public.custody_checkpoints
  add column if not exists operational_mode text;
alter table public.custody_checkpoints
  drop constraint if exists custody_checkpoints_operational_mode_check;
alter table public.custody_checkpoints
  add constraint custody_checkpoints_operational_mode_check check (
    operational_mode is null or operational_mode in ('rehearsal', 'live')
  );

create or replace function public.identity_iso_date_is_valid(p_value text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_date date;
begin
  if coalesce(p_value, '') !~ '^\d{4}-\d{2}-\d{2}$' then
    return false;
  end if;
  v_date := p_value::date;
  return to_char(v_date, 'YYYY-MM-DD') = p_value;
exception when others then
  return false;
end;
$$;

create or replace function public.identity_age_at_date(
  p_date_of_birth text,
  p_reference_date text
)
returns integer
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_birth_date date;
  v_reference_date date;
begin
  if not public.identity_iso_date_is_valid(p_date_of_birth)
    or not public.identity_iso_date_is_valid(p_reference_date) then
    return null;
  end if;
  v_birth_date := p_date_of_birth::date;
  v_reference_date := p_reference_date::date;
  if v_birth_date > v_reference_date then
    return null;
  end if;
  return extract(year from age(v_reference_date, v_birth_date))::integer;
exception when others then
  return null;
end;
$$;

create or replace function public.identity_iso_timestamp_is_valid_not_future(
  p_value text
)
returns boolean
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_timestamp timestamptz;
begin
  if nullif(btrim(coalesce(p_value, '')), '') is null then
    return false;
  end if;
  v_timestamp := p_value::timestamptz;
  return v_timestamp <= now();
exception when others then
  return false;
end;
$$;

create or replace function public.identity_name_matches(
  p_candidate text,
  p_first_name text,
  p_last_name text
)
returns boolean
language sql
immutable
set search_path = public, pg_temp
as $$
  with normalized as (
    select
      btrim(regexp_replace(lower(coalesce(p_candidate, '')), '[^[:alnum:]]+', ' ', 'g')) as candidate,
      btrim(regexp_replace(lower(coalesce(p_first_name, '')), '[^[:alnum:]]+', ' ', 'g')) as first_name,
      btrim(regexp_replace(lower(coalesce(p_last_name, '')), '[^[:alnum:]]+', ' ', 'g')) as last_name
  )
  select candidate <> '' and first_name <> '' and last_name <> '' and (
    candidate = first_name || ' ' || last_name
    or candidate like first_name || ' % ' || last_name
  )
  from normalized;
$$;

create or replace function public.identity_verification_is_current_complete_for_mode(
  p_identity_id uuid,
  p_operational_mode text
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.identity_verifications identity
    where identity.id = p_identity_id
      and identity.status = 'verified'
      and identity.verified_at is not null
      and identity.verified_at <= now()
      and (identity.expires_at is null or identity.expires_at > now())
      and identity.provider = 'stripe_identity'
      and identity.provider_session_id is not null
      and identity.provider_session_creation_status = 'bound'
      and identity.provider_session_livemode =
        case when p_operational_mode = 'live' then true else false end
      and identity.liveness_status = 'passed'
      and identity.consent_at is not null
      and identity.consent_at <= now()
      and identity.consent_version = 'identity-biometric-v1-2026-08-15'
      and nullif(btrim(identity.consent_signature_name), '') is not null
      and nullif(btrim(identity.metadata->>'verified_first_name'), '') is not null
      and nullif(btrim(identity.metadata->>'verified_last_name'), '') is not null
      and public.identity_iso_date_is_valid(identity.metadata->>'verified_dob')
      and identity.metadata->>'verified_profile_complete' = 'true'
      and p_operational_mode in ('rehearsal', 'live')
      and identity.metadata->>'stripe_livemode' =
        case when p_operational_mode = 'live' then 'true' else 'false' end
      and public.identity_name_matches(
        identity.consent_signature_name,
        identity.metadata->>'verified_first_name',
        identity.metadata->>'verified_last_name'
      )
      and identity.consent_scope @> jsonb_build_object(
        'purpose', 'identity verification tied to Travelyt custody records',
        'provider', 'stripe_identity',
        'retention', 'up_to_3_years_or_until_purpose_ends_unless_legal_hold'
      )
      and identity.consent_scope->'data' @>
        '["government_id_images", "selfie_or_liveness_capture"]'::jsonb
      and identity.consent_scope->'disclosures' @>
        '["approved_identity_verification_provider", "authorized_relevant_carrier"]'::jsonb
      and identity.metadata->>'raw_document_stored_by_travelyt' = 'true'
      and identity.raw_stored_at is not null
      and identity.raw_stored_at <= now()
      and identity.raw_retention_until is not null
      and identity.raw_retention_until > now()
      and identity.raw_purpose_ended_at is null
      and identity.raw_destroyed_at is null
      and identity.raw_deletion_status = 'scheduled'
      and (
        identity.user_id is null
        or not exists (
          select 1 from public.account_deletion_claims deletion
          where deletion.user_id = identity.user_id
        )
      )
      and jsonb_path_exists(
        coalesce(identity.raw_document_paths, '[]'::jsonb),
        '$[*] ? (@.kind == "document")'
      )
      and jsonb_path_exists(
        coalesce(identity.raw_document_paths, '[]'::jsonb),
        '$[*] ? (@.kind == "selfie")'
      )
  );
$$;

-- Profile-level callers use the strict live definition. Booking transitions
-- call the mode-aware function below so rehearsals cannot be confused with
-- live custody.
create or replace function public.identity_verification_is_current_complete(
  p_identity_id uuid
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select public.identity_verification_is_current_complete_for_mode(
    p_identity_id,
    'live'
  );
$$;

create index if not exists identity_verifications_current_account_idx
  on public.identity_verifications (user_id, verified_at desc)
  where provider = 'stripe_identity' and status = 'verified';
create index if not exists identity_verifications_current_passenger_idx
  on public.identity_verifications (booking_id, passenger_id, verified_at desc)
  where provider = 'stripe_identity' and status = 'verified';

create or replace function public.booking_has_current_identity_for_mode(
  p_booking_id text,
  p_operational_mode text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_account_current boolean := false;
  v_account_identity public.identity_verifications%rowtype;
  v_passenger_identity public.identity_verifications%rowtype;
  v_account_holder jsonb;
  v_passenger jsonb;
begin
  if p_operational_mode not in ('rehearsal', 'live') then
    return false;
  end if;
  select * into v_booking
  from public.bookings
  where id = p_booking_id;
  if not found or v_booking.customer_user_id is null then
    return false;
  end if;

  if jsonb_typeof(v_booking.passenger_manifest) is distinct from 'array'
    or jsonb_array_length(v_booking.passenger_manifest) = 0 then
    return false;
  end if;
  if (
    select count(*)
    from jsonb_array_elements(v_booking.passenger_manifest) passenger
    where passenger->>'verificationMethod' = 'primary_account'
  ) <> 1 then
    return false;
  end if;
  if (
    select count(*) <> count(distinct passenger->>'id')
    from jsonb_array_elements(v_booking.passenger_manifest) passenger
  ) then
    return false;
  end if;

  select identity.* into v_account_identity
  from public.identity_verifications identity
  where identity.user_id = v_booking.customer_user_id
    and identity.role = 'customer'
    and identity.booking_id is null
    and identity.passenger_id is null
    and lower(btrim(coalesce(identity.email, ''))) = lower(btrim(v_booking.email))
    and public.identity_verification_is_current_complete_for_mode(
      identity.id,
      p_operational_mode
    )
    and public.identity_name_matches(
      v_booking.customer_name,
      identity.metadata->>'verified_first_name',
      identity.metadata->>'verified_last_name'
    )
  order by identity.verified_at desc
  limit 1
  for share;
  v_account_current := found;
  if not v_account_current then
    return false;
  end if;

  select passenger into v_account_holder
  from jsonb_array_elements(v_booking.passenger_manifest) passenger
  where passenger->>'verificationMethod' = 'primary_account'
  limit 1;
  if v_account_holder->>'category' is distinct from 'account_holder'
    or v_account_holder->>'relationship' is distinct from 'self'
    or lower(btrim(coalesce(v_account_holder->>'email', ''))) is distinct from
      lower(btrim(v_booking.email))
    or not public.identity_name_matches(
      concat_ws(' ', v_account_holder->>'firstName', v_account_holder->>'lastName'),
      v_account_identity.metadata->>'verified_first_name',
      v_account_identity.metadata->>'verified_last_name'
    )
    or not public.identity_iso_date_is_valid(v_account_holder->>'dateOfBirth')
    or public.identity_age_at_date(
      v_account_holder->>'dateOfBirth',
      v_booking.travel_date
    ) is null
    or public.identity_age_at_date(
      v_account_holder->>'dateOfBirth',
      v_booking.travel_date
    ) < 18
    or v_account_holder->>'dateOfBirth' is distinct from
      v_account_identity.metadata->>'verified_dob' then
    return false;
  end if;

  for v_passenger in
    select value from jsonb_array_elements(coalesce(v_booking.passenger_manifest, '[]'::jsonb))
  loop
    case v_passenger->>'verificationMethod'
      when 'primary_account' then
        if not v_account_current then return false; end if;
      when 'self_service' then
        if v_passenger->>'category' is distinct from 'adult'
          or public.identity_age_at_date(
            v_passenger->>'dateOfBirth', v_booking.travel_date
          ) is null
          or public.identity_age_at_date(
            v_passenger->>'dateOfBirth', v_booking.travel_date
          ) < 18
          then
          return false;
        end if;
        select identity.* into v_passenger_identity
        from public.identity_verifications identity
        where identity.booking_id = v_booking.id
          and identity.passenger_id::text = v_passenger->>'id'
          and identity.subject_type = 'adult'
          and identity.role = 'customer'
          and identity.consent_at is not null
          and identity.verification_invite_otp_verified_at is not null
          and identity.verification_invite_otp_verified_at <= now()
          and nullif(btrim(coalesce(v_passenger->>'email', '')), '') is not null
          and nullif(btrim(coalesce(identity.email, '')), '') is not null
          and lower(btrim(coalesce(identity.email, ''))) =
            lower(btrim(coalesce(v_passenger->>'email', '')))
          and identity.metadata->>'verified_dob' = v_passenger->>'dateOfBirth'
          and identity.metadata->>'expected_dob_match' = 'true'
          and identity.metadata->>'expected_name_match' = 'true'
          and public.identity_name_matches(
            concat_ws(' ', v_passenger->>'firstName', v_passenger->>'lastName'),
            identity.metadata->>'verified_first_name',
            identity.metadata->>'verified_last_name'
          )
          and public.identity_verification_is_current_complete_for_mode(
            identity.id,
            p_operational_mode
          )
        order by identity.verified_at desc
        limit 1
        for share;
        if not found then
          return false;
        end if;
      when 'guardian' then
        if v_passenger->>'category' is distinct from 'minor'
          or public.identity_age_at_date(
            v_passenger->>'dateOfBirth', v_booking.travel_date
          ) is null
          or public.identity_age_at_date(
            v_passenger->>'dateOfBirth', v_booking.travel_date
          ) >= 18
          or not public.identity_iso_timestamp_is_valid_not_future(
            v_passenger->>'guardianAttestedAt'
          )
          or coalesce(v_passenger->>'verificationStatus', '') not in ('guardian_attested', 'verified') then
          return false;
        end if;
      when 'household_spouse' then
        if v_passenger->>'category' is distinct from 'adult'
          or v_passenger->>'relationship' is distinct from 'spouse'
          or public.identity_age_at_date(
            v_passenger->>'dateOfBirth', v_booking.travel_date
          ) is null
          or public.identity_age_at_date(
            v_passenger->>'dateOfBirth', v_booking.travel_date
          ) < 18
          or not public.identity_iso_timestamp_is_valid_not_future(
            v_passenger->>'householdAttestedAt'
          )
          or coalesce(v_passenger->>'verificationStatus', '') not in ('household_attested', 'verified') then
          return false;
        end if;
      else
        return false;
    end case;
  end loop;

  return true;
end;
$$;

create or replace function public.booking_has_current_identity(
  p_booking_id text
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select coalesce((
    select public.booking_has_current_identity_for_mode(
      booking.id,
      booking.operational_mode
    )
    from public.bookings booking
    where booking.id = p_booking_id
  ), false);
$$;

-- A copied Checkout URL may authorize a card, but it cannot capture funds.
-- The server records a fresh, identity-locked capture decision immediately
-- before calling Stripe's capture endpoint.
create or replace function public.authorize_booking_payment_capture(
  p_booking_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_stripe_livemode boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_checkout public.booking_checkout_sessions%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then return false; end if;

  perform public.lock_booking_identity_rows(v_booking.id);
  select * into v_checkout
  from public.booking_checkout_sessions
  where booking_id = v_booking.id
  for update;

  if not found
    or v_booking.status <> 'pending'
    or v_booking.pilot_eligibility_status <> 'approved'
    or v_booking.pilot_eligibility_expires_at is null
    or v_booking.pilot_eligibility_expires_at <= now()
    or v_booking.operational_mode not in ('rehearsal', 'live')
    or not public.booking_has_current_search_consent(v_booking.id)
    or not public.booking_has_current_identity(v_booking.id)
    or v_checkout.stripe_checkout_session_id is distinct from p_checkout_session_id
    or v_checkout.status not in ('open', 'capture_authorized')
    or v_checkout.operational_mode is distinct from v_booking.operational_mode
    or v_checkout.stripe_livemode is distinct from p_stripe_livemode
    or p_stripe_livemode is distinct from (v_booking.operational_mode = 'live')
    or (
      v_checkout.stripe_payment_intent_id is not null
      and v_checkout.stripe_payment_intent_id is distinct from p_payment_intent_id
    ) then
    return false;
  end if;

  update public.booking_checkout_sessions
  set status = 'capture_authorized',
      stripe_payment_intent_id = p_payment_intent_id,
      capture_authorized_at = now(),
      last_error = null
  where booking_id = v_booking.id;
  return true;
end;
$$;

create or replace function public.finalize_booking_payment_capture(
  p_booking_id text,
  p_checkout_session_id text,
  p_payment_intent_id text,
  p_stripe_livemode boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_checkout public.booking_checkout_sessions%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then return false; end if;

  perform public.lock_booking_identity_rows(v_booking.id);
  select * into v_checkout
  from public.booking_checkout_sessions
  where booking_id = v_booking.id
  for update;
  if found
    and v_booking.status = 'paid'
    and v_booking.paid_at is not null
    and v_checkout.status = 'paid'
    and v_checkout.stripe_checkout_session_id is not distinct from p_checkout_session_id
    and v_checkout.stripe_payment_intent_id is not distinct from p_payment_intent_id
    and v_checkout.capture_authorized_at is not null
    and v_checkout.captured_at is not null
    and v_checkout.captured_at >= v_checkout.capture_authorized_at
    and v_checkout.operational_mode is not distinct from v_booking.operational_mode
    and v_checkout.stripe_livemode is not distinct from p_stripe_livemode
    and p_stripe_livemode is not distinct from (v_booking.operational_mode = 'live') then
    return true;
  end if;
  if not found
    or v_booking.status <> 'pending'
    or v_booking.pilot_eligibility_status <> 'approved'
    or v_booking.pilot_eligibility_expires_at is null
    or v_booking.pilot_eligibility_expires_at <= clock_timestamp()
    or v_checkout.stripe_checkout_session_id is distinct from p_checkout_session_id
    or v_checkout.stripe_payment_intent_id is distinct from p_payment_intent_id
    or v_checkout.capture_authorized_at is null
    or v_checkout.status not in ('capture_authorized', 'paid')
    or v_booking.operational_mode not in ('rehearsal', 'live')
    or not public.booking_has_current_search_consent(v_booking.id)
    or v_checkout.operational_mode is distinct from v_booking.operational_mode
    or v_checkout.stripe_livemode is distinct from p_stripe_livemode
    or p_stripe_livemode is distinct from (v_booking.operational_mode = 'live')
    or not public.booking_has_current_identity(v_booking.id) then
    return false;
  end if;

  if v_booking.status <> 'paid' then
    update public.booking_checkout_sessions
    set status = 'paid', captured_at = coalesce(captured_at, now()),
        claim_token = null, claimed_at = null, last_error = null
    where booking_id = v_booking.id;
    update public.bookings
    set status = 'paid', paid_at = coalesce(paid_at, now()), updated_at = now()
    where id = v_booking.id and status = 'pending';
    if not found then return false; end if;
  end if;
  return true;
end;
$$;

-- Critical booking transitions hold a share lock on every relevant identity
-- row while they revalidate it. Identity updates therefore either finish
-- before the transition reads them or wait until the transition commits.
-- This helper intentionally does not update or lock the booking row, avoiding
-- an identity-row -> booking-row lock inversion.
create or replace function public.lock_booking_identity_rows(
  p_booking_id text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_customer_user_id uuid;
begin
  select customer_user_id into v_customer_user_id
  from public.bookings
  where id = p_booking_id;

  perform 1
  from public.identity_verifications identity
  where identity.user_id = v_customer_user_id
    or identity.booking_id = p_booking_id
  for share;
end;
$$;

-- Replaces migration 039's checkout claim. The booking and all potentially
-- relevant identity rows are locked before the claim is granted, closing the
-- race between approval, identity invalidation, and Checkout URL creation.
create or replace function public.claim_booking_checkout_session(
  p_booking_id text
)
returns table (
  claimed_token uuid,
  existing_session_id text,
  checkout_status text,
  checkout_attempt integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_new_claim_token uuid := gen_random_uuid();
  v_claimed_token uuid;
  v_existing_session_id text;
  v_checkout_status text;
  v_checkout_attempt integer;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then
    return query select null::uuid, null::text, 'failed'::text, 0;
    return;
  end if;

  perform public.lock_booking_identity_rows(v_booking.id);

  if v_booking.status <> 'pending'
    or v_booking.pilot_eligibility_status <> 'approved'
    or v_booking.pilot_eligibility_expires_at is null
    or v_booking.pilot_eligibility_expires_at <= now()
    or v_booking.operational_mode not in ('rehearsal', 'live')
    or not public.booking_has_current_search_consent(v_booking.id)
    or not public.booking_has_current_identity(v_booking.id) then
    if v_booking.status = 'pending'
      and v_booking.pilot_eligibility_status = 'approved' then
      update public.bookings
      set pilot_eligibility_status = 'expired',
          pilot_eligibility_expires_at = null,
          pilot_eligibility_snapshot = coalesce(pilot_eligibility_snapshot, '{}'::jsonb) ||
            jsonb_build_object(
              'eligibleTraveler', false,
              'identityEvidenceMode', 'missing_or_nonlive',
              'identityEvidenceRevalidatedAt', now()
            ),
          pilot_eligibility_reason =
            'Approval expired because current live identity evidence is missing.',
          updated_at = now()
      where id = v_booking.id;
    end if;
    insert into public.booking_checkout_sessions as checkout (
      booking_id, status, attempts, claim_token, claimed_at, last_error,
      operational_mode, stripe_livemode
    ) values (
      v_booking.id, 'expired', 1, null, null,
      'Canonical identity, operating mode, or pilot approval was not current at checkout claim.',
      v_booking.operational_mode, null
    )
    on conflict (booking_id) do update
      set status = 'expired', claim_token = null, claimed_at = null,
          operational_mode = excluded.operational_mode,
          stripe_livemode = null,
          last_error = excluded.last_error, updated_at = now()
      where checkout.status in (
        'creating', 'open', 'capture_authorized', 'expired', 'failed'
      );
    select attempts into v_checkout_attempt
    from public.booking_checkout_sessions where booking_id = v_booking.id;
    return query select null::uuid, null::text, 'expired'::text,
      coalesce(v_checkout_attempt, 1);
    return;
  end if;

  insert into public.booking_checkout_sessions as checkout (
    booking_id, stripe_checkout_session_id, status, attempts,
    claim_token, claimed_at, last_error, operational_mode, stripe_livemode
  ) values (
    p_booking_id, null, 'creating', 1,
    v_new_claim_token, now(), null, v_booking.operational_mode, null
  )
  on conflict (booking_id) do update
  set stripe_checkout_session_id = null,
      status = 'creating',
      attempts = checkout.attempts + 1,
      claim_token = v_new_claim_token,
      claimed_at = now(),
      operational_mode = v_booking.operational_mode,
      stripe_livemode = null,
      last_error = null
  where checkout.status in ('expired', 'failed')
    or (checkout.status = 'creating' and checkout.claimed_at < now() - interval '15 minutes')
  returning claim_token, stripe_checkout_session_id, status, attempts
  into v_claimed_token, v_existing_session_id, v_checkout_status, v_checkout_attempt;

  if found then
    return query select v_claimed_token, v_existing_session_id,
      v_checkout_status, v_checkout_attempt;
    return;
  end if;

  select null::uuid, checkout.stripe_checkout_session_id,
    checkout.status, checkout.attempts
  into v_claimed_token, v_existing_session_id, v_checkout_status, v_checkout_attempt
  from public.booking_checkout_sessions checkout
  where checkout.booking_id = p_booking_id;

  return query select v_claimed_token, v_existing_session_id,
    v_checkout_status, v_checkout_attempt;
end;
$$;

-- Stripe creation happens outside the database transaction. Revalidate the
-- booking, approval, identity, and mode after Stripe returns and before the URL
-- is exposed to the customer.
create or replace function public.finalize_booking_checkout_session(
  p_booking_id text,
  p_claim_token uuid,
  p_checkout_session_id text,
  p_operational_mode text,
  p_stripe_livemode boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
  v_checkout public.booking_checkout_sessions%rowtype;
begin
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then return false; end if;

  perform public.lock_booking_identity_rows(v_booking.id);
  select * into v_checkout
  from public.booking_checkout_sessions
  where booking_id = v_booking.id
  for update;
  if not found
    or v_booking.status <> 'pending'
    or v_booking.pilot_eligibility_status <> 'approved'
    or v_booking.pilot_eligibility_expires_at is null
    or v_booking.pilot_eligibility_expires_at <= now()
    or v_booking.operational_mode is distinct from p_operational_mode
    or p_stripe_livemode is distinct from (v_booking.operational_mode = 'live')
    or not public.booking_has_current_search_consent(v_booking.id)
    or not public.booking_has_current_identity(v_booking.id)
    or v_checkout.status <> 'creating'
    or v_checkout.claim_token is distinct from p_claim_token
    or v_checkout.operational_mode is distinct from v_booking.operational_mode then
    return false;
  end if;

  update public.booking_checkout_sessions
  set stripe_checkout_session_id = p_checkout_session_id,
      status = 'open',
      operational_mode = v_booking.operational_mode,
      stripe_livemode = p_stripe_livemode,
      claim_token = null,
      claimed_at = null,
      last_error = null
  where booking_id = v_booking.id;
  return true;
end;
$$;

-- Clear stale account-holder cache flags and their manifest mirrors.
with stale_account as (
  select booking.id
  from public.bookings booking
  where booking.status = 'pending'
    and booking.paid_at is null
    and booking.customer_identity_verified_at is not null
    and not exists (
      select 1
      from public.identity_verifications identity
      where identity.user_id = booking.customer_user_id
        and identity.role = 'customer'
        and identity.booking_id is null
        and identity.passenger_id is null
        and lower(btrim(coalesce(identity.email, ''))) = lower(btrim(booking.email))
        and public.identity_verification_is_current_complete_for_mode(
          identity.id,
          booking.operational_mode
        )
    )
), rewritten as (
  select booking.id,
    coalesce(jsonb_agg(
      case
        when passenger.value->>'verificationMethod' = 'primary_account'
          or passenger.value->>'category' = 'account_holder'
        then (passenger.value - 'identityVerifiedAt') ||
          jsonb_build_object('verificationStatus', 'not_started')
        else passenger.value
      end order by passenger.ordinality
    ) filter (where passenger.value is not null), '[]'::jsonb) as manifest
  from public.bookings booking
  join stale_account stale on stale.id = booking.id
  left join lateral jsonb_array_elements(booking.passenger_manifest)
    with ordinality passenger(value, ordinality) on true
  group by booking.id
)
update public.bookings booking
set customer_identity_verified_at = null,
    passenger_manifest = rewritten.manifest,
    updated_at = now()
from rewritten
where booking.id = rewritten.id;

-- Clear any stale independently verified adult passenger cache fields.
with rewritten as (
  select booking.id,
    jsonb_agg(
      case
        when passenger.value->>'verificationMethod' = 'self_service'
          and not exists (
            select 1
            from public.identity_verifications identity
            where identity.booking_id = booking.id
              and identity.passenger_id::text = passenger.value->>'id'
              and identity.consent_at is not null
              and lower(btrim(coalesce(identity.email, ''))) =
                lower(btrim(coalesce(passenger.value->>'email', '')))
              and public.identity_verification_is_current_complete_for_mode(
                identity.id,
                booking.operational_mode
              )
          )
        then (passenger.value - 'identityVerifiedAt') ||
          jsonb_build_object('verificationStatus', 'invite_required')
        else passenger.value
      end order by passenger.ordinality
    ) as manifest
  from public.bookings booking
  cross join lateral jsonb_array_elements(booking.passenger_manifest)
    with ordinality passenger(value, ordinality)
  group by booking.id
)
update public.bookings booking
set passenger_manifest = rewritten.manifest, updated_at = now()
from rewritten
where booking.id = rewritten.id
  and booking.status = 'pending'
  and booking.paid_at is null
  and booking.passenger_manifest is distinct from rewritten.manifest;

-- Any previously approved request whose provider evidence is no longer
-- current must return to a non-payable terminal state.
update public.bookings booking
set pilot_eligibility_status = 'expired',
    pilot_eligibility_expires_at = null,
    pilot_eligibility_snapshot = coalesce(pilot_eligibility_snapshot, '{}'::jsonb) ||
      jsonb_build_object('eligibleTraveler', false),
    pilot_eligibility_reason = coalesce(
      nullif(pilot_eligibility_reason, ''),
      'Approval expired because current complete identity evidence is missing.'
    ),
    updated_at = now()
where pilot_eligibility_status = 'approved'
  and booking.status = 'pending'
  and booking.paid_at is null
  and not public.booking_has_current_identity(booking.id);

-- Preserve pre-048 payment history, but close every stale fulfillment path.
-- These rows predate mode-bound identity/search consent and cannot be silently
-- relabeled as rehearsal or live work. Operations may archive/cancel them or
-- create a fresh consented booking; assignment and custody remain fail-closed.
update public.bookings booking
set pilot_eligibility_status = 'expired',
    pilot_eligibility_expires_at = null,
    pilot_eligibility_snapshot = coalesce(pilot_eligibility_snapshot, '{}'::jsonb) ||
      jsonb_build_object(
        'legacyContinuationBlocked', true,
        'identityEvidenceMode', 'missing_or_nonlive',
        'identityEvidenceRevalidatedAt', now()
      ),
    pilot_eligibility_reason =
      'Pre-048 paid history retained; fulfillment requires manual closure or a fresh consented booking.',
    updated_at = now()
where booking.paid_at is not null
  and booking.operational_mode is null
  and booking.status not in ('delivered', 'closed', 'cancelled')
  and booking.pilot_eligibility_status <> 'expired';

update public.booking_checkout_sessions checkout
set status = 'expired', claim_token = null, claimed_at = null,
    last_error = 'Current complete live identity evidence is missing.',
    updated_at = now()
from public.bookings booking
where booking.id = checkout.booking_id
  and booking.status = 'pending'
  and booking.paid_at is null
  and checkout.status in ('creating', 'open', 'capture_authorized')
  and not public.booking_has_current_identity(booking.id);

create or replace function public.enforce_booking_operational_mode_immutable()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_mode text := old.pilot_eligibility_snapshot->>'operationalMode';
  v_new_mode text := new.pilot_eligibility_snapshot->>'operationalMode';
begin
  if v_old_mode is not null and v_new_mode is distinct from v_old_mode then
    raise exception using errcode = 'P0001',
      message = 'A booking operating mode cannot change after it is assigned.';
  end if;
  if v_old_mode is null and v_new_mode is not null and not (
    (
      current_setting('travelyt.booking_mode_classification', true) = 'on'
      and old.status = 'pending'
      and old.paid_at is null
      and old.pilot_eligibility_status = 'pending'
      and new.pilot_eligibility_status = 'pending'
    )
    or (
      old.status = 'pending'
      and old.paid_at is null
      and old.pilot_eligibility_status is distinct from 'approved'
      and new.pilot_eligibility_status = 'approved'
    )
  ) then
    raise exception using errcode = 'P0001',
      message = 'A legacy booking cannot be reclassified outside the controlled approval transition.';
  end if;
  if v_new_mode is not null and v_new_mode not in ('rehearsal', 'live') then
    raise exception using errcode = 'P0001',
      message = 'Booking operating mode must be rehearsal or live.';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_operational_mode_immutable on public.bookings;
create trigger bookings_operational_mode_immutable
before update of pilot_eligibility_snapshot on public.bookings
for each row execute function public.enforce_booking_operational_mode_immutable();

-- New bookings are classified by the server at insert. This RPC safely
-- classifies a pre-048 pending booking before a grouped adult invite, closing
-- the identity-before-approval mode-binding gap without permitting a later
-- mode switch.
create or replace function public.classify_pending_booking_operational_mode(
  p_booking_id text,
  p_operational_mode text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if p_operational_mode not in ('rehearsal', 'live') then return false; end if;
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then return false; end if;
  if v_booking.operational_mode = p_operational_mode then return true; end if;
  if v_booking.operational_mode is not null
    or v_booking.status <> 'pending'
    or v_booking.paid_at is not null
    or v_booking.pilot_eligibility_status <> 'pending'
    or exists (
      select 1 from public.booking_checkout_sessions checkout
      where checkout.booking_id = v_booking.id
        and checkout.status in ('creating', 'open', 'capture_authorized', 'paid')
    )
    or exists (
      select 1 from public.booking_agent_assignments assignment
      where assignment.booking_id = v_booking.id
        and assignment.status in ('assigned', 'accepted')
    )
    or exists (
      select 1 from public.custody_checkpoints custody
      where custody.booking_id = v_booking.id
    ) then
    return false;
  end if;
  perform set_config('travelyt.booking_mode_classification', 'on', true);
  update public.bookings
  set pilot_eligibility_snapshot = coalesce(pilot_eligibility_snapshot, '{}'::jsonb) ||
        jsonb_build_object('operationalMode', p_operational_mode),
      updated_at = clock_timestamp()
  where id = v_booking.id;
  perform set_config('travelyt.booking_mode_classification', 'off', true);
  return found;
end;
$$;

revoke all on function public.classify_pending_booking_operational_mode(text, text)
  from public, anon, authenticated;
grant execute on function public.classify_pending_booking_operational_mode(text, text)
  to service_role;

create or replace function public.enforce_current_identity_on_pilot_approval()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.pilot_eligibility_status = 'approved'
    and (tg_op = 'INSERT' or old.pilot_eligibility_status is distinct from 'approved') then
    if tg_op = 'INSERT' then
      raise exception using errcode = 'P0001',
        message = 'Pilot approval must use the controlled review transition.';
    end if;
    if coalesce(new.pilot_eligibility_snapshot->>'operationalMode', '')
      not in ('rehearsal', 'live') then
      raise exception using errcode = 'P0001',
        message = 'A server-derived rehearsal or live operating mode is required before approval.';
    end if;
    if new.customer_user_id is distinct from old.customer_user_id
      or new.email is distinct from old.email
      or new.customer_name is distinct from old.customer_name
      or new.passenger_manifest is distinct from old.passenger_manifest
      or new.service is distinct from old.service
      or new.airport is distinct from old.airport
      or new.address is distinct from old.address
      or new.travel_date is distinct from old.travel_date
      or new.flight_time is distinct from old.flight_time
      or new.flight is distinct from old.flight
      or new.bags is distinct from old.bags
      or new.price_cents is distinct from old.price_cents
      or new.pricing_quote is distinct from old.pricing_quote
      or new.pricing_fingerprint is distinct from old.pricing_fingerprint
      or new.consent_to_search_at is distinct from old.consent_to_search_at
      or new.consent_to_search_version is distinct from old.consent_to_search_version then
      raise exception using errcode = 'P0001',
        message = 'Identity-bound booking fields cannot change during approval.';
    end if;
    perform public.lock_booking_identity_rows(new.id);
    if not public.booking_has_current_identity_for_mode(
      new.id,
      new.pilot_eligibility_snapshot->>'operationalMode'
    ) then
      raise exception using errcode = 'P0001',
        message = 'Current complete identity evidence is required before pilot approval.';
    end if;
    if not public.booking_has_current_search_consent(new.id) then
      raise exception using errcode = 'P0001',
        message = 'Current airline/TSA baggage-inspection consent is required before pilot approval.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_current_identity_before_approval on public.bookings;
create trigger bookings_current_identity_before_approval
before insert or update on public.bookings
for each row
when (new.pilot_eligibility_status = 'approved')
execute function public.enforce_current_identity_on_pilot_approval();

create or replace function public.enforce_current_identity_before_payment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status = 'paid'
    and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
    if tg_op = 'INSERT' then
      raise exception using errcode = 'P0001',
        message = 'Paid bookings must use the controlled payment transition.';
    end if;
    if new.paid_at is null
      or new.pilot_eligibility_status <> 'approved'
      or new.pilot_eligibility_expires_at is null
      or new.pilot_eligibility_expires_at <= clock_timestamp() then
      raise exception using errcode = 'P0001',
        message = 'Current pilot approval and an activation timestamp are required before payment activation.';
    end if;
    if new.customer_user_id is distinct from old.customer_user_id
      or new.email is distinct from old.email
      or new.customer_name is distinct from old.customer_name
      or new.passenger_manifest is distinct from old.passenger_manifest
      or new.service is distinct from old.service
      or new.airport is distinct from old.airport
      or new.address is distinct from old.address
      or new.travel_date is distinct from old.travel_date
      or new.flight_time is distinct from old.flight_time
      or new.flight is distinct from old.flight
      or new.bags is distinct from old.bags
      or new.price_cents is distinct from old.price_cents
      or new.pricing_quote is distinct from old.pricing_quote
      or new.pricing_fingerprint is distinct from old.pricing_fingerprint
      or new.pilot_eligibility_status is distinct from old.pilot_eligibility_status
      or new.pilot_eligibility_expires_at is distinct from old.pilot_eligibility_expires_at
      or new.pilot_eligibility_snapshot is distinct from old.pilot_eligibility_snapshot
      or new.consent_to_search_at is distinct from old.consent_to_search_at
      or new.consent_to_search_version is distinct from old.consent_to_search_version then
      raise exception using errcode = 'P0001',
        message = 'Identity-bound booking fields cannot change during payment.';
    end if;
    if new.price_cents > 0 and not exists (
      select 1 from public.booking_checkout_sessions checkout
      where checkout.booking_id = new.id
        and checkout.status = 'paid'
        and checkout.capture_authorized_at is not null
        and checkout.stripe_checkout_session_id is not null
        and checkout.stripe_payment_intent_id is not null
        and checkout.captured_at is not null
        and checkout.captured_at >= checkout.capture_authorized_at
        and checkout.operational_mode =
          new.pilot_eligibility_snapshot->>'operationalMode'
        and checkout.stripe_livemode = (
          new.pilot_eligibility_snapshot->>'operationalMode' = 'live'
        )
    ) then
      raise exception using errcode = 'P0001',
        message = 'Controlled Stripe capture evidence is required before paid activation.';
    end if;
    perform public.lock_booking_identity_rows(new.id);
    if not public.booking_has_current_identity(new.id) then
      raise exception using errcode = 'P0001',
        message = 'Current complete live identity evidence is required before payment activation.';
    end if;
    if not public.booking_has_current_search_consent(new.id) then
      raise exception using errcode = 'P0001',
        message = 'Current airline/TSA baggage-inspection consent is required before payment activation.';
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.driver_identity_matches_operational_mode(
  p_driver_access_id uuid,
  p_operational_mode text
)
returns boolean
language sql
volatile
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.agent_readiness_profiles readiness
    join public.driver_access_codes access
      on access.id = readiness.driver_access_id
    join public.identity_verifications identity
      on identity.id = case
        when readiness.identity_evidence_reference ~
          '^stripe_identity:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
        then split_part(readiness.identity_evidence_reference, ':', 2)::uuid
        else null
      end
    where p_operational_mode in ('rehearsal', 'live')
      and readiness.driver_access_id = p_driver_access_id
      and readiness.status = 'active'
      and access.status = 'active'
      and readiness.identity_evidence_reference ~
        '^stripe_identity:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
      and identity.provider = 'stripe_identity'
      and identity.status = 'verified'
      and identity.role in ('driver', 'employee')
      and identity.metadata->>'driver_access_id' = p_driver_access_id::text
      and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
      and nullif(btrim(coalesce(identity.email, '')), '') is not null
      and lower(btrim(identity.email)) = lower(btrim(access.driver_email))
      and identity.metadata->>'stripe_livemode' =
        case when p_operational_mode = 'live' then 'true' else 'false' end
      and public.identity_verification_is_current_complete_for_mode(
        identity.id,
        p_operational_mode
      )
  );
$$;

create or replace function public.lock_driver_identity_rows(
  p_driver_access_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1
  from public.driver_access_codes access
  where access.id = any(p_driver_access_ids)
  order by access.id
  for share;

  perform 1
  from public.agent_readiness_profiles readiness
  where readiness.driver_access_id = any(p_driver_access_ids)
  order by readiness.driver_access_id
  for share;

  perform 1
  from public.identity_verifications identity
  join public.agent_readiness_profiles readiness
    on readiness.identity_evidence_reference =
      'stripe_identity:' || identity.id::text
  where readiness.driver_access_id = any(p_driver_access_ids)
  order by identity.id
  for share of identity;
end;
$$;

drop trigger if exists bookings_current_identity_before_payment on public.bookings;
create trigger bookings_current_identity_before_payment
before insert or update on public.bookings
for each row
when (new.status = 'paid')
execute function public.enforce_current_identity_before_payment();

create or replace function public.enforce_current_identity_on_custody_checkpoint()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operational_mode text;
begin
  select operational_mode into v_operational_mode
  from public.bookings
  where id = new.booking_id
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'Booking is required before custody.';
  end if;
  if v_operational_mode is null
    or v_operational_mode not in ('rehearsal', 'live') then
    raise exception using errcode = 'P0001',
      message = 'A classified rehearsal or live booking is required before custody.';
  end if;
  if new.operational_mode is not null
    and new.operational_mode is distinct from v_operational_mode then
    raise exception using errcode = 'P0001',
      message = 'Custody checkpoint mode does not match the booking.';
  end if;
  new.operational_mode := v_operational_mode;
  if v_operational_mode = 'rehearsal'
    and new.event_type in ('carrier_transfer', 'recipient_delivery') then
    raise exception using errcode = 'P0001',
      message = 'Rehearsals cannot record airline transfer or arrival delivery.';
  end if;
  perform public.lock_booking_identity_rows(new.booking_id);
  if new.driver_access_id is not null then
    perform public.lock_driver_identity_rows(array[new.driver_access_id]);
  end if;
  if new.driver_access_id is not null
    and not public.driver_identity_matches_operational_mode(
      new.driver_access_id,
      v_operational_mode
    ) then
    raise exception using errcode = 'P0001',
      message = 'Driver identity mode does not match the custody booking.';
  end if;
  if new.event_type in (
    'custody_accepted', 'traveler_return', 'recipient_delivery',
    'recipient_confirmed', 'carrier_transfer'
  ) and not public.booking_has_current_identity(new.booking_id) then
    raise exception using errcode = 'P0001',
      message = 'Current complete traveler identity evidence is required before custody.';
  end if;
  if new.event_type in (
    'custody_accepted', 'traveler_return', 'recipient_delivery',
    'recipient_confirmed', 'carrier_transfer'
  ) and not public.booking_has_current_search_consent(new.booking_id) then
    raise exception using errcode = 'P0001',
      message = 'Current airline/TSA baggage-inspection consent is required before custody.';
  end if;
  return new;
end;
$$;

drop trigger if exists custody_checkpoints_current_identity on public.custody_checkpoints;
create trigger custody_checkpoints_current_identity
before insert on public.custody_checkpoints
for each row execute function public.enforce_current_identity_on_custody_checkpoint();

create or replace function public.enforce_current_identity_on_agent_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_operational_mode text;
begin
  select operational_mode into v_operational_mode
  from public.bookings
  where id = new.booking_id
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'Booking is required before assignment.';
  end if;
  if v_operational_mode is null
    or v_operational_mode not in ('rehearsal', 'live') then
    raise exception using errcode = 'P0001',
      message = 'A classified rehearsal or live booking is required before assignment.';
  end if;
  if tg_op = 'UPDATE' and old.operational_mode is distinct from v_operational_mode then
    raise exception using errcode = 'P0001',
      message = 'Assignment mode is immutable and must match the booking.';
  end if;
  if new.operational_mode is not null
    and new.operational_mode is distinct from v_operational_mode then
    raise exception using errcode = 'P0001',
      message = 'Assignment mode does not match the booking.';
  end if;
  new.operational_mode := v_operational_mode;
  perform public.lock_booking_identity_rows(new.booking_id);
  perform public.lock_driver_identity_rows(array[
    new.primary_driver_access_id,
    new.backup_driver_access_id
  ]);
  if not public.driver_identity_matches_operational_mode(
      new.primary_driver_access_id,
      v_operational_mode
    ) or not public.driver_identity_matches_operational_mode(
      new.backup_driver_access_id,
      v_operational_mode
    ) then
    raise exception using errcode = 'P0001',
      message = 'Primary and backup driver identity modes must match the booking.';
  end if;
  if new.status in ('assigned', 'accepted')
    and not public.booking_has_current_identity(new.booking_id) then
    raise exception using errcode = 'P0001',
      message = 'Current complete traveler identity evidence is required before assignment.';
  end if;
  if new.status in ('assigned', 'accepted')
    and not public.booking_has_current_search_consent(new.booking_id) then
    raise exception using errcode = 'P0001',
      message = 'Current airline/TSA baggage-inspection consent is required before assignment.';
  end if;
  return new;
end;
$$;

drop trigger if exists booking_agent_assignments_current_identity
  on public.booking_agent_assignments;
create trigger booking_agent_assignments_current_identity
before insert or update of status on public.booking_agent_assignments
for each row
when (new.status in ('assigned', 'accepted'))
execute function public.enforce_current_identity_on_agent_assignment();

create or replace function public.identity_owner_user_ids(p_identity_id uuid)
returns table(user_id uuid)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select distinct candidate.user_id
  from (
    select identity.user_id
    from public.identity_verifications identity
    where identity.id = p_identity_id and identity.user_id is not null
    union
    select access.owner_user_id
    from public.identity_verifications identity
    join public.driver_access_codes access
      on identity.metadata->>'driver_access_id' = access.id::text
        or (
          identity.role in ('driver', 'employee')
          and nullif(btrim(coalesce(identity.email, '')), '') is not null
          and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
          and lower(btrim(identity.email)) = lower(btrim(access.driver_email))
        )
    where identity.id = p_identity_id and access.owner_user_id is not null
    union
    select auth_user.id
    from public.identity_verifications identity
    join public.driver_access_codes access
      on identity.metadata->>'driver_access_id' = access.id::text
        or (
          identity.role in ('driver', 'employee')
          and nullif(btrim(coalesce(identity.email, '')), '') is not null
          and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
          and lower(btrim(identity.email)) = lower(btrim(access.driver_email))
        )
    join auth.users auth_user
      on nullif(btrim(coalesce(auth_user.email, '')), '') is not null
        and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
        and lower(btrim(auth_user.email)) = lower(btrim(access.driver_email))
    where identity.id = p_identity_id
  ) candidate
  where candidate.user_id is not null;
$$;

create or replace function public.enforce_identity_account_deletion_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claimed_user_id uuid;
begin
  if tg_op = 'UPDATE'
    and current_setting('travelyt.account_deletion_finalize', true) = 'on'
    and new.user_id is null
    and new.email is null
    and new.phone is null
    and (
      new.provider_session_id is null
      or new.provider_redaction_status = 'processing'
    )
    and new.subject_name is null
    and new.consent_signature_name is null
    and new.raw_deletion_status = 'destroyed'
    and new.raw_document_paths = '[]'::jsonb then
    return new;
  end if;
  for v_claimed_user_id in
    select distinct candidate.user_id
    from (
      select new.user_id
      union
      select case when tg_op = 'UPDATE' then old.user_id else null end
      union
      select access.owner_user_id
      from public.driver_access_codes access
      where access.owner_user_id is not null
        and (
          access.id::text in (
            coalesce(new.metadata->>'driver_access_id', ''),
            case when tg_op = 'UPDATE'
              then coalesce(old.metadata->>'driver_access_id', '') else '' end
          )
          or (
            new.role in ('driver', 'employee')
            and nullif(btrim(coalesce(new.email, '')), '') is not null
            and lower(btrim(coalesce(new.email, ''))) = lower(btrim(coalesce(access.driver_email, '')))
          )
          or (
            tg_op = 'UPDATE'
            and old.role in ('driver', 'employee')
            and nullif(btrim(coalesce(old.email, '')), '') is not null
            and lower(btrim(coalesce(old.email, ''))) = lower(btrim(coalesce(access.driver_email, '')))
          )
        )
      union
      select auth_user.id
      from auth.users auth_user
      join public.driver_access_codes access
        on nullif(btrim(coalesce(auth_user.email, '')), '') is not null
          and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
          and lower(btrim(coalesce(auth_user.email, ''))) =
          lower(btrim(coalesce(access.driver_email, '')))
      where access.id::text in (
          coalesce(new.metadata->>'driver_access_id', ''),
          case when tg_op = 'UPDATE'
            then coalesce(old.metadata->>'driver_access_id', '') else '' end
        )
        or (
          new.role in ('driver', 'employee')
          and nullif(btrim(coalesce(new.email, '')), '') is not null
          and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
          and lower(btrim(coalesce(new.email, ''))) =
            lower(btrim(coalesce(access.driver_email, '')))
        )
        or (
          tg_op = 'UPDATE'
          and old.role in ('driver', 'employee')
          and nullif(btrim(coalesce(old.email, '')), '') is not null
          and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
          and lower(btrim(coalesce(old.email, ''))) =
            lower(btrim(coalesce(access.driver_email, '')))
        )
    ) candidate
    where candidate.user_id is not null
    order by candidate.user_id
  loop
    -- INSERT has no pre-existing identity row lock, so serialize it against a
    -- deletion claim. UPDATE already owns the identity row; taking the
    -- advisory lock here would invert deletion's advisory->identity order.
    if tg_op = 'INSERT' then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(v_claimed_user_id::text, 8152026)
      );
    end if;
    if not exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_claimed_user_id
    ) then
      continue;
    end if;
    if tg_op = 'INSERT' then
      raise exception using errcode = 'P0001',
        message = 'Identity evidence cannot be created after account deletion begins.';
    end if;
    if new.user_id is distinct from old.user_id
      or new.raw_purpose_ended_at is null
      or new.status = 'verified'
      or new.verified_at is not null
      or new.liveness_status = 'passed' then
      raise exception using errcode = 'P0001',
        message = 'Identity evidence cannot be reactivated after account deletion begins.';
    end if;
    if new.raw_document_paths is distinct from old.raw_document_paths
      and new.raw_document_paths <> '[]'::jsonb
      and new.raw_deletion_status <> 'failed' then
      raise exception using errcode = 'P0001',
        message = 'New identity originals cannot be retained after account deletion begins.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists identity_verifications_account_deletion_guard
  on public.identity_verifications;
create trigger identity_verifications_account_deletion_guard
before insert or update on public.identity_verifications
for each row execute function public.enforce_identity_account_deletion_claim();

create or replace function public.enforce_booking_account_deletion_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  for v_user_id in
    select distinct candidate.user_id
    from unnest(array[
      new.customer_user_id,
      new.driver_user_id,
      case when tg_op = 'UPDATE' then old.customer_user_id else null end,
      case when tg_op = 'UPDATE' then old.driver_user_id else null end
    ]) candidate(user_id)
    where candidate.user_id is not null
    order by candidate.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then
      if tg_op = 'UPDATE'
        and current_setting('travelyt.account_deletion_finalize', true) = 'on'
        and (
          (old.customer_user_id = v_user_id and new.customer_user_id is null)
          or (old.driver_user_id = v_user_id and new.driver_user_id is null)
        )
        and new.customer_user_id is distinct from v_user_id
        and new.driver_user_id is distinct from v_user_id then
        continue;
      end if;
      raise exception using errcode = 'P0001',
        message = 'A booking cannot be created or reactivated after account deletion begins.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists bookings_account_deletion_guard on public.bookings;
create trigger bookings_account_deletion_guard
before insert or update on public.bookings
for each row execute function public.enforce_booking_account_deletion_claim();

/* Superseded recovery block: retained as a comment so the migration remains
   reviewable after a local mechanical edit was recovered from the clean replay.
create or replace function public.enforce_assignment_account_deletion_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if new.status not in ('assigned', 'accepted') then
    return new;
  end if;
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then
      return false;
    end if;
  end loop;

  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_legal_hold_at is not null
    or v_identity.raw_purpose_ended_at is not null
    or v_identity.raw_destroyed_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or v_identity.provider_session_id is not null
    or (
      v_identity.provider_session_claim_token is not null
      and v_identity.provider_session_claim_token is distinct from p_claim_token
      and v_identity.provider_session_claimed_at > clock_timestamp() - interval '1 hour'
    )
    or v_identity.raw_archive_claim_token is not null
    or v_identity.raw_deletion_claim_token is not null then
    return false;
  end if;

  update public.identity_verifications
  set provider_session_claim_token = p_claim_token,
      provider_session_claimed_at = clock_timestamp(),
      provider_session_creation_status = 'creating',
      provider_session_creation_error = null,
      updated_at = clock_timestamp()
  where id = p_identity_id;
  return found;
end;
$$;

*/

create or replace function public.enforce_assignment_account_deletion_claim()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid;
begin
  if new.status not in ('assigned', 'accepted') then return new; end if;
  -- Match every account-deletion and custody transition: booking row first,
  -- then owner advisory locks in sorted order. Same-kind triggers fire by name,
  -- so this guard cannot rely on another trigger running first.
  perform 1
  from public.bookings booking
  where booking.id = new.booking_id
  for update;
  if not found then
    raise exception using errcode = 'P0001',
      message = 'Assignment booking does not exist.';
  end if;
  for v_user_id in
    select distinct candidate.user_id
    from (
      select identity.user_id
      from public.identity_verifications identity
      where identity.user_id is not null
        and identity.metadata->>'driver_access_id' in (
          new.primary_driver_access_id::text,
          new.backup_driver_access_id::text
        )
      union
      select access.owner_user_id
      from public.driver_access_codes access
      where access.owner_user_id is not null
        and access.id in (
          new.primary_driver_access_id,
          new.backup_driver_access_id
        )
      union
      select auth_user.id
      from auth.users auth_user
      join public.driver_access_codes access
        on nullif(btrim(coalesce(auth_user.email, '')), '') is not null
          and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
          and lower(btrim(auth_user.email)) = lower(btrim(access.driver_email))
      where access.id in (
        new.primary_driver_access_id,
        new.backup_driver_access_id
      )
    ) candidate
    where candidate.user_id is not null
    order by candidate.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then
      raise exception using errcode = 'P0001',
        message = 'A driver under account deletion cannot be assigned to active custody.';
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists booking_agent_assignments_account_deletion_guard
  on public.booking_agent_assignments;
create trigger booking_agent_assignments_account_deletion_guard
before insert or update on public.booking_agent_assignments
for each row execute function public.enforce_assignment_account_deletion_claim();

create or replace function public.lock_identity_owner_bookings(
  p_identity_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
begin
  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id;
  if not found then return; end if;

  perform 1
  from public.bookings booking
  where booking.id = v_identity.booking_id
    or booking.customer_user_id = v_identity.user_id
    or booking.driver_user_id = v_identity.user_id
    or exists (
      select 1 from public.booking_agent_assignments assignment
      join public.driver_access_codes access
        on access.id in (
          assignment.primary_driver_access_id,
          assignment.backup_driver_access_id
        )
      where assignment.booking_id = booking.id
        and (
          v_identity.metadata->>'driver_access_id' = access.id::text
          or (
            v_identity.role in ('driver', 'employee')
            and nullif(btrim(coalesce(v_identity.email, '')), '') is not null
            and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
            and lower(btrim(v_identity.email)) = lower(btrim(access.driver_email))
          )
        )
    )
  order by booking.id
  for update;
end;
$$;

create or replace function public.claim_identity_provider_session_creation(
  p_identity_id uuid,
  p_claim_token uuid,
  p_stripe_livemode boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_user_id uuid;
begin
  if p_claim_token is null or p_stripe_livemode is null then return false; end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then return false; end if;
  end loop;

  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_legal_hold_at is not null
    or v_identity.raw_purpose_ended_at is not null
    or v_identity.raw_destroyed_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or v_identity.provider_session_id is not null
    or v_identity.metadata->>'stripe_livemode' is distinct from
      (case when p_stripe_livemode then 'true' else 'false' end)
    or (
      v_identity.provider_session_claim_token is not null
      and (
        v_identity.provider_session_claim_token is distinct from p_claim_token
        or v_identity.provider_session_claim_livemode is distinct from p_stripe_livemode
      )
    )
    or v_identity.raw_archive_claim_token is not null
    or v_identity.raw_deletion_claim_token is not null then
    return false;
  end if;

  -- Stripe only guarantees idempotency retention for a bounded period. Never
  -- replay an outcome-unknown create after that safety window, because the
  -- same key could then create a second sensitive provider session.
  if v_identity.provider_session_creation_status = 'outcome_unknown'
    and (
      v_identity.provider_session_creation_started_at is null
      or v_identity.provider_session_creation_started_at <=
        clock_timestamp() - interval '23 hours'
    ) then
    update public.identity_verifications
    set status = 'manual_review',
        liveness_status = 'manual_review',
        verified_at = null,
        provider_session_creation_error =
          'Provider creation outcome requires manual reconciliation; automatic retry window expired.',
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'provider_session_creation_reconciliation_required_at', clock_timestamp(),
          'provider_session_creation_retry_window_hours', 23
        ),
        updated_at = clock_timestamp()
    where id = p_identity_id;
    return false;
  end if;

  update public.identity_verifications
  set provider_session_claim_token = p_claim_token,
      provider_session_claimed_at = clock_timestamp(),
      provider_session_claim_livemode = p_stripe_livemode,
      provider_session_creation_status = 'creating',
      provider_session_creation_started_at = coalesce(
        provider_session_creation_started_at,
        clock_timestamp()
      ),
      provider_session_creation_error = null,
      updated_at = clock_timestamp()
  where id = p_identity_id;
  return found;
end;
$$;

create or replace function public.release_identity_provider_session_creation(
  p_identity_id uuid,
  p_claim_token uuid,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.identity_verifications
  set provider_session_claim_token = null,
      provider_session_claimed_at = null,
      provider_session_claim_livemode = null,
      provider_session_creation_status = 'failed',
      provider_session_creation_error = left(coalesce(p_error, 'Provider session creation failed.'), 1000),
      metadata = coalesce(metadata, '{}'::jsonb) || case
        when nullif(btrim(coalesce(p_error, '')), '') is null then '{}'::jsonb
        else jsonb_build_object(
          'provider_session_bind_error', left(p_error, 1000),
          'provider_session_bind_failed_at', clock_timestamp()
        )
      end,
      updated_at = clock_timestamp()
  where id = p_identity_id
    and provider_session_claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.mark_identity_provider_session_creation_unknown(
  p_identity_id uuid,
  p_claim_token uuid,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.identity_verifications
  set provider_session_creation_status = 'outcome_unknown',
      provider_session_creation_error = left(
        coalesce(p_error, 'Provider session creation outcome is unknown.'),
        1000
      ),
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_session_creation_outcome_unknown_at', clock_timestamp()
      ),
      updated_at = clock_timestamp()
  where id = p_identity_id
    and provider_session_claim_token = p_claim_token
    and provider_session_id is null;
  return found;
end;
$$;

create or replace function public.finalize_identity_provider_session_creation(
  p_identity_id uuid,
  p_claim_token uuid,
  p_provider_session_id text,
  p_metadata jsonb default '{}'::jsonb,
  p_identity_fields jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_user_id uuid;
begin
  if p_claim_token is null
    or nullif(btrim(coalesce(p_provider_session_id, '')), '') is null
    or jsonb_typeof(coalesce(p_metadata, '{}'::jsonb)) <> 'object'
    or jsonb_typeof(coalesce(p_identity_fields, '{}'::jsonb)) <> 'object'
    or (
      coalesce(p_identity_fields, '{}'::jsonb) - array[
        'provider', 'document_type', 'consent_at', 'consent_version',
        'consent_signature_name', 'consent_scope', 'consent_ip_hash',
        'consent_user_agent_hash', 'status', 'liveness_status'
      ]::text[]
    ) <> '{}'::jsonb then
    return false;
  end if;

  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then
      return false;
    end if;
  end loop;

  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.provider_session_claim_token is distinct from p_claim_token
    or v_identity.provider_session_id is not null
    or v_identity.raw_legal_hold_at is not null
    or v_identity.raw_purpose_ended_at is not null
    or v_identity.raw_destroyed_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or v_identity.raw_archive_claim_token is not null
    or v_identity.raw_deletion_claim_token is not null
    or (
      p_identity_fields ? 'consent_at'
      and v_identity.consent_at is not null
    ) then
    return false;
  end if;

  perform set_config('travelyt.provider_session_bind', 'on', true);
  update public.identity_verifications
  set provider_session_id = p_provider_session_id,
      provider_session_livemode = provider_session_claim_livemode,
      provider_session_claim_token = null,
      provider_session_claimed_at = null,
      provider_session_claim_livemode = null,
      provider_session_creation_status = 'bound',
      provider_session_creation_error = null,
      provider = case
        when p_identity_fields ? 'provider' then p_identity_fields->>'provider'
        else provider
      end,
      document_type = case
        when p_identity_fields ? 'document_type' then p_identity_fields->>'document_type'
        else document_type
      end,
      consent_at = case
        when p_identity_fields ? 'consent_at'
          then (p_identity_fields->>'consent_at')::timestamptz
        else consent_at
      end,
      consent_version = case
        when p_identity_fields ? 'consent_version' then p_identity_fields->>'consent_version'
        else consent_version
      end,
      consent_signature_name = case
        when p_identity_fields ? 'consent_signature_name'
          then p_identity_fields->>'consent_signature_name'
        else consent_signature_name
      end,
      consent_scope = case
        when p_identity_fields ? 'consent_scope' then p_identity_fields->'consent_scope'
        else consent_scope
      end,
      consent_ip_hash = case
        when p_identity_fields ? 'consent_ip_hash' then p_identity_fields->>'consent_ip_hash'
        else consent_ip_hash
      end,
      consent_user_agent_hash = case
        when p_identity_fields ? 'consent_user_agent_hash'
          then p_identity_fields->>'consent_user_agent_hash'
        else consent_user_agent_hash
      end,
      status = case
        when p_identity_fields ? 'status' then p_identity_fields->>'status'
        else status
      end,
      liveness_status = case
        when p_identity_fields ? 'liveness_status'
          then p_identity_fields->>'liveness_status'
        else liveness_status
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      updated_at = clock_timestamp()
  where id = p_identity_id
    and provider_session_claim_token = p_claim_token;
  return found;
end;
$$;

create or replace function public.quarantine_identity_provider_session_creation(
  p_identity_id uuid,
  p_claim_token uuid,
  p_provider_session_id text,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_claim_token is null
    or nullif(btrim(coalesce(p_provider_session_id, '')), '') is null then
    return false;
  end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
  end loop;
  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found then return false; end if;
  if v_identity.provider_session_id = p_provider_session_id then return true; end if;
  if v_identity.provider_session_id is not null
    or v_identity.provider_session_claim_token is distinct from p_claim_token then
    return false;
  end if;

  perform set_config('travelyt.provider_session_bind', 'on', true);
  update public.identity_verifications
  set provider_session_id = p_provider_session_id,
      provider_session_livemode = provider_session_claim_livemode,
      provider_session_claim_token = null,
      provider_session_claimed_at = null,
      provider_session_claim_livemode = null,
      provider_session_creation_status = 'bound',
      provider_session_creation_error = left(
        coalesce(p_error, 'Provider session binding failed.'),
        1000
      ),
      status = 'manual_review',
      liveness_status = 'manual_review',
      verified_at = null,
      raw_purpose_ended_at = coalesce(raw_purpose_ended_at, v_now),
      raw_deletion_status = case
        when raw_deletion_status = 'destroyed' then raw_deletion_status
        else 'scheduled'
      end,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_session_quarantined_at', v_now,
        'provider_session_quarantine_error', left(coalesce(p_error, 'Provider session binding failed.'), 1000)
      ),
      updated_at = v_now
  where id = p_identity_id
    and provider_session_claim_token = p_claim_token
    and provider_session_id is null;
  return found;
end;
$$;

create or replace function public.enforce_identity_provider_session_binding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.provider_session_id is not distinct from old.provider_session_id then
    return new;
  end if;
  if old.provider_session_id is null
    and new.provider_session_id is not null
    and current_setting('travelyt.provider_session_bind', true) = 'on' then
    return new;
  end if;
  if old.provider_session_id is not null
    and new.provider_session_id is null
    and (
      current_setting('travelyt.provider_redaction_transition', true) = 'on'
      or current_setting('travelyt.account_deletion_finalize', true) = 'on'
    ) then
    return new;
  end if;
  raise exception using errcode = 'P0001',
    message = 'Identity provider sessions must be bound by the protected claim transition.';
end;
$$;

drop trigger if exists identity_verifications_provider_session_binding_guard
  on public.identity_verifications;
create trigger identity_verifications_provider_session_binding_guard
before update of provider_session_id on public.identity_verifications
for each row execute function public.enforce_identity_provider_session_binding();

create or replace function public.claim_identity_provider_redaction(
  p_identity_id uuid,
  p_claim_token uuid,
  p_raw_deletion_claim_token uuid default null,
  p_reason text default 'purpose_ended'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_claim_token is null then return null; end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
  end loop;

  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_legal_hold_at is not null
    or v_identity.provider_session_claim_token is not null
    or v_identity.raw_archive_claim_token is not null
    or (
      v_identity.raw_deletion_claim_token is not null
      and v_identity.raw_deletion_claim_token is distinct from p_raw_deletion_claim_token
    )
    or (
      v_identity.raw_deletion_claim_token is null
      and p_raw_deletion_claim_token is not null
    )
    or (
      v_identity.provider_redaction_claim_token is not null
      and v_identity.provider_redaction_claim_token is distinct from p_claim_token
      and v_identity.provider_redaction_claimed_at > v_now - interval '1 hour'
    ) then
    return null;
  end if;
  if v_identity.provider_redaction_status = 'redacted' then
    return to_jsonb(v_identity);
  end if;
  if nullif(btrim(coalesce(v_identity.provider_session_id, '')), '') is null then
    return null;
  end if;

  perform set_config('travelyt.provider_redaction_transition', 'on', true);
  update public.identity_verifications
  set status = 'manual_review',
      liveness_status = 'manual_review',
      verified_at = null,
      raw_purpose_ended_at = coalesce(raw_purpose_ended_at, v_now),
      provider_redaction_status = 'requesting',
      provider_redaction_claim_token = p_claim_token,
      provider_redaction_claimed_at = v_now,
      provider_redaction_error = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_redaction_reason', left(coalesce(p_reason, 'purpose_ended'), 120),
        'provider_redaction_started_at', v_now
      ),
      updated_at = v_now
  where id = p_identity_id
  returning * into v_identity;
  return to_jsonb(v_identity);
end;
$$;

create or replace function public.record_identity_provider_redaction_result(
  p_identity_id uuid,
  p_claim_token uuid,
  p_provider_session_id text,
  p_outcome text,
  p_error text default null,
  p_event_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if p_claim_token is null
    or nullif(btrim(coalesce(p_provider_session_id, '')), '') is null
    or p_outcome not in ('processing', 'outcome_unknown', 'failed', 'redacted') then
    return false;
  end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
  end loop;
  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.provider_redaction_claim_token is distinct from p_claim_token
    or v_identity.provider_session_id is distinct from p_provider_session_id then
    return false;
  end if;

  perform set_config('travelyt.provider_redaction_transition', 'on', true);
  update public.identity_verifications
  set provider_redaction_status = p_outcome,
      provider_redaction_requested_at = case
        when p_outcome in ('processing', 'outcome_unknown', 'failed', 'redacted')
          then coalesce(provider_redaction_requested_at, v_now)
        else provider_redaction_requested_at
      end,
      provider_redaction_completed_at = case
        when p_outcome = 'redacted' then v_now
        else provider_redaction_completed_at
      end,
      provider_redaction_error = case
        when p_outcome in ('outcome_unknown', 'failed')
          then left(coalesce(p_error, 'Provider redaction outcome is unresolved.'), 1000)
        else null
      end,
      provider_redaction_claim_token = null,
      provider_redaction_claimed_at = null,
      provider_session_id = case
        when p_outcome = 'redacted' then null
        else provider_session_id
      end,
      metadata = coalesce(metadata, '{}'::jsonb) ||
        case
          when nullif(btrim(coalesce(p_event_id, '')), '') is null then '{}'::jsonb
          else jsonb_build_object('provider_redaction_event_id', left(p_event_id, 255))
        end ||
        jsonb_build_object('provider_redaction_result_recorded_at', v_now),
      updated_at = v_now
  where id = p_identity_id
    and provider_redaction_claim_token = p_claim_token
    and provider_session_id = p_provider_session_id;
  return found;
end;
$$;

/* Superseded recovery block; corrected definitions follow.
create or replace function public.reconcile_identity_provider_redaction(
  p_provider_session_id text,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_identity_id uuid;
  v_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(coalesce(p_provider_session_id, '')), '') is null then
    return false;
  end if;
  select id into v_identity_id
  from public.identity_verifications
  where provider_session_id = p_provider_session_id;
  if not found then return true; end if;
  perform public.lock_identity_owner_bookings(v_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then
      return false;
    end if;
  end loop;

  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_legal_hold_at is not null
    or v_identity.raw_purpose_ended_at is not null
    or v_identity.raw_destroyed_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or (
      v_identity.raw_archive_claim_token is not null
      and v_identity.raw_archive_claimed_at > clock_timestamp() - interval '1 hour'
    )
    or (
      v_identity.raw_deletion_claim_token is not null
      and v_identity.raw_deletion_claimed_at > clock_timestamp() - interval '1 hour'
    )
    or (
      v_identity.provider_session_claim_token is not null
      and v_identity.provider_session_claimed_at > clock_timestamp() - interval '1 hour'
    ) then
    return false;
  end if;

  update public.identity_verifications
  set raw_archive_claim_token = p_claim_token,
      raw_archive_claimed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_identity_id;
  return found;
end;
$$;

*/

create or replace function public.reconcile_identity_provider_redaction(
  p_provider_session_id text,
  p_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_identity_id uuid;
  v_user_id uuid;
  v_now timestamptz := clock_timestamp();
begin
  if nullif(btrim(coalesce(p_provider_session_id, '')), '') is null then return false; end if;
  select id into v_identity_id
  from public.identity_verifications
  where provider_session_id = p_provider_session_id;
  if not found then return true; end if;
  perform public.lock_identity_owner_bookings(v_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(v_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
  end loop;
  select * into v_identity
  from public.identity_verifications
  where id = v_identity_id
  for update;
  if not found or v_identity.provider_session_id is distinct from p_provider_session_id then
    return true;
  end if;

  perform set_config('travelyt.provider_redaction_transition', 'on', true);
  update public.identity_verifications
  set provider_redaction_status = 'redacted',
      provider_redaction_requested_at = coalesce(provider_redaction_requested_at, v_now),
      provider_redaction_completed_at = v_now,
      provider_redaction_error = null,
      provider_redaction_claim_token = null,
      provider_redaction_claimed_at = null,
      provider_session_id = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'provider_redacted_at', v_now,
        'provider_redaction_event_id', left(coalesce(p_event_id, ''), 255)
      ),
      updated_at = v_now
  where id = v_identity_id
    and provider_session_id = p_provider_session_id;
  return found;
end;
$$;

create or replace function public.enforce_identity_provider_redaction_transition()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if (
      new.provider_redaction_status is distinct from old.provider_redaction_status
      or new.provider_redaction_claim_token is distinct from old.provider_redaction_claim_token
      or new.provider_redaction_claimed_at is distinct from old.provider_redaction_claimed_at
      or new.provider_redaction_requested_at is distinct from old.provider_redaction_requested_at
      or new.provider_redaction_completed_at is distinct from old.provider_redaction_completed_at
      or new.provider_redaction_error is distinct from old.provider_redaction_error
    )
    and current_setting('travelyt.provider_redaction_transition', true) is distinct from 'on' then
    raise exception using errcode = 'P0001',
      message = 'Identity provider redaction state must use the protected transition.';
  end if;
  return new;
end;
$$;

drop trigger if exists identity_verifications_provider_redaction_transition_guard
  on public.identity_verifications;
create trigger identity_verifications_provider_redaction_transition_guard
before update of provider_redaction_status, provider_redaction_claim_token,
  provider_redaction_claimed_at, provider_redaction_requested_at,
  provider_redaction_completed_at, provider_redaction_error
on public.identity_verifications
for each row execute function public.enforce_identity_provider_redaction_transition();

create or replace function public.claim_identity_original_archive(
  p_identity_id uuid,
  p_claim_token uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_user_id uuid;
begin
  if p_claim_token is null then return false; end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
    if exists (
      select 1 from public.account_deletion_claims deletion
      where deletion.user_id = v_user_id
    ) then return false; end if;
  end loop;

  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_legal_hold_at is not null
    or v_identity.raw_purpose_ended_at is not null
    or v_identity.raw_destroyed_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or v_identity.raw_archive_claim_token is not null
    or v_identity.raw_deletion_claim_token is not null
    or v_identity.provider_session_claim_token is not null
    or v_identity.provider_session_creation_status = 'outcome_unknown' then
    return false;
  end if;

  update public.identity_verifications
  set raw_archive_claim_token = p_claim_token,
      raw_archive_claimed_at = clock_timestamp(),
      updated_at = clock_timestamp()
  where id = p_identity_id;
  return found;
end;
$$;

-- Convert an incomplete archive claim into either a protected deletion claim
-- or a retained legal-hold record before any storage object is removed. This
-- makes the database, not a stale worker snapshot, the destruction authority.
create or replace function public.claim_incomplete_identity_archive_cleanup(
  p_identity_id uuid,
  p_archive_claim_token uuid,
  p_paths jsonb,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if p_archive_claim_token is null
    or jsonb_typeof(coalesce(p_paths, '[]'::jsonb)) <> 'array' then
    return null;
  end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_archive_claim_token is distinct from p_archive_claim_token
    or v_identity.raw_destroyed_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or v_identity.raw_deletion_claim_token is not null then
    return null;
  end if;

  if v_identity.raw_legal_hold_at is not null then
    update public.identity_verifications
    set status = 'manual_review',
        liveness_status = 'manual_review',
        verified_at = null,
        raw_document_paths = coalesce(p_paths, '[]'::jsonb),
        raw_stored_at = coalesce(raw_stored_at, v_now),
        raw_deletion_status = 'scheduled',
        raw_archive_claim_token = null,
        raw_archive_claimed_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
          'incomplete_archive_retained_for_legal_hold_at', v_now,
          'incomplete_archive_reason', left(coalesce(p_reason, 'Incomplete identity archive.'), 1000)
        ),
        updated_at = v_now
    where id = p_identity_id;
    return 'held';
  end if;

  update public.identity_verifications
  set status = 'manual_review',
      liveness_status = 'manual_review',
      verified_at = null,
      raw_document_paths = coalesce(p_paths, '[]'::jsonb),
      raw_purpose_ended_at = coalesce(raw_purpose_ended_at, v_now),
      raw_retention_until = v_now,
      raw_deletion_status = 'scheduled',
      raw_deletion_attempted_at = v_now,
      raw_deletion_claim_token = p_archive_claim_token,
      raw_deletion_claimed_at = v_now,
      raw_archive_claim_token = null,
      raw_archive_claimed_at = null,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'raw_destruction_started_at', v_now,
        'raw_destruction_reason', 'incomplete_identity_archive',
        'incomplete_archive_reason', left(coalesce(p_reason, 'Incomplete identity archive.'), 1000)
      ),
      updated_at = v_now
  where id = p_identity_id;
  return 'delete';
end;
$$;

create or replace function public.claim_identity_original_destruction(
  p_identity_id uuid,
  p_claim_token uuid,
  p_purpose_ended_at timestamptz,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_now timestamptz := clock_timestamp();
  v_user_id uuid;
begin
  if p_claim_token is null then return null; end if;
  perform public.lock_identity_owner_bookings(p_identity_id);
  for v_user_id in
    select owner.user_id
    from public.identity_owner_user_ids(p_identity_id) owner
    order by owner.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(v_user_id::text, 8152026)
    );
  end loop;
  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_legal_hold_at is not null
    or v_identity.raw_deletion_status = 'destroyed'
    or (
      v_identity.raw_archive_claim_token is not null
      and v_identity.raw_archive_claimed_at > clock_timestamp() - interval '1 hour'
    )
    or (
      v_identity.raw_deletion_claim_token is not null
      and v_identity.raw_deletion_claimed_at > clock_timestamp() - interval '1 hour'
    )
    or (
      v_identity.provider_session_claim_token is not null
      and v_identity.provider_session_claimed_at > clock_timestamp() - interval '1 hour'
    ) then
    return null;
  end if;

  update public.identity_verifications
  set status = 'manual_review',
      liveness_status = 'manual_review',
      verified_at = null,
      raw_purpose_ended_at = coalesce(raw_purpose_ended_at, p_purpose_ended_at, v_now),
      raw_deletion_attempted_at = v_now,
      raw_deletion_claim_token = p_claim_token,
      raw_deletion_claimed_at = v_now,
      metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
        'raw_destruction_started_at', v_now,
        'raw_destruction_reason', left(coalesce(p_reason, 'purpose_ended'), 120)
      ),
      updated_at = v_now
  where id = p_identity_id
  returning * into v_identity;
  return to_jsonb(v_identity);
end;
$$;

create or replace function public.finalize_identity_original_destruction(
  p_identity_id uuid,
  p_claim_token uuid,
  p_succeeded boolean,
  p_receipt jsonb default '{}'::jsonb,
  p_error text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_identity public.identity_verifications%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  select * into v_identity
  from public.identity_verifications
  where id = p_identity_id
  for update;
  if not found
    or v_identity.raw_deletion_claim_token is distinct from p_claim_token
    or (p_succeeded and v_identity.raw_legal_hold_at is not null) then
    return false;
  end if;

  if p_succeeded then
    update public.identity_verifications
    set raw_document_paths = '[]'::jsonb,
        raw_deletion_status = 'destroyed',
        raw_deletion_attempted_at = v_now,
        raw_destroyed_at = v_now,
        raw_destruction_receipt = coalesce(p_receipt, '{}'::jsonb),
        raw_deletion_error = null,
        raw_export_status = 'none',
        raw_deletion_claim_token = null,
        raw_deletion_claimed_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
        updated_at = v_now
    where id = p_identity_id;
  else
    update public.identity_verifications
    set raw_deletion_status = 'failed',
        raw_deletion_attempted_at = v_now,
        raw_deletion_error = left(coalesce(p_error, 'Identity original deletion failed.'), 1000),
        raw_deletion_claim_token = null,
        raw_deletion_claimed_at = null,
        metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
        updated_at = v_now
    where id = p_identity_id;
  end if;
  return found;
end;
$$;

create or replace function public.enforce_identity_legal_hold_destruction_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.raw_legal_hold_at is not null
    and old.raw_legal_hold_at is null
    and (
      old.raw_deletion_claim_token is not null
      or old.provider_redaction_claim_token is not null
      or old.provider_redaction_status in ('requesting', 'processing', 'outcome_unknown')
    ) then
    raise exception using errcode = 'P0001',
      message = 'A legal hold cannot begin after irreversible identity destruction has started.';
  end if;
  return new;
end;
$$;

drop trigger if exists identity_verifications_legal_hold_destruction_order
  on public.identity_verifications;
create trigger identity_verifications_legal_hold_destruction_order
before update of raw_legal_hold_at on public.identity_verifications
for each row execute function public.enforce_identity_legal_hold_destruction_order();

create or replace function public.claim_account_deletion(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_email text;
  v_claimed_count integer := 0;
  v_identity_ids uuid[] := '{}'::uuid[];
  v_driver_access_ids uuid[] := '{}'::uuid[];
begin
  select email into v_email
  from auth.users
  where id = p_user_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'account_not_found');
  end if;

  select coalesce(array_agg(access.id order by access.id), '{}'::uuid[])
  into v_driver_access_ids
  from public.driver_access_codes access
  where access.owner_user_id = p_user_id or (
    nullif(btrim(coalesce(v_email, '')), '') is not null
    and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
    and lower(btrim(coalesce(access.driver_email, ''))) =
      lower(btrim(coalesce(v_email, '')))
  ) or exists (
      select 1 from public.identity_verifications identity
      where identity.user_id = p_user_id
        and identity.metadata->>'driver_access_id' = access.id::text
    );

  select coalesce(array_agg(identity.id order by identity.id), '{}'::uuid[])
  into v_identity_ids
  from public.identity_verifications identity
  where identity.user_id = p_user_id
    or (
      identity.role in ('driver', 'employee')
      and (
        (
          nullif(btrim(coalesce(v_email, '')), '') is not null
          and nullif(btrim(coalesce(identity.email, '')), '') is not null
          and lower(btrim(coalesce(identity.email, ''))) = lower(btrim(coalesce(v_email, '')))
        )
        or exists (
          select 1 from unnest(v_driver_access_ids) access_id
          where identity.metadata->>'driver_access_id' = access_id::text
        )
      )
    );

  -- Follow the operational lock order: every relevant booking first, then the
  -- account advisory lock, then identities. This avoids deadlocking a payment
  -- or custody transition that already owns its booking row.
  perform 1
  from public.bookings booking
  where booking.customer_user_id = p_user_id
    or booking.driver_user_id = p_user_id
    or exists (
      select 1 from public.identity_verifications identity
      where identity.id = any(v_identity_ids) and identity.booking_id = booking.id
    )
    or exists (
      select 1 from public.booking_agent_assignments assignment
      where assignment.booking_id = booking.id
        and (
          assignment.primary_driver_access_id = any(v_driver_access_ids)
          or assignment.backup_driver_access_id = any(v_driver_access_ids)
        )
    )
  order by booking.id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 8152026)
  );
  perform 1 from auth.users where id = p_user_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'account_not_found');
  end if;

  -- Re-resolve under the account lock so a just-finished onboarding write is
  -- included in the stable deletion set.
  select coalesce(array_agg(access.id order by access.id), '{}'::uuid[])
  into v_driver_access_ids
  from public.driver_access_codes access
  where access.owner_user_id = p_user_id or (
    nullif(btrim(coalesce(v_email, '')), '') is not null
    and nullif(btrim(coalesce(access.driver_email, '')), '') is not null
    and lower(btrim(coalesce(access.driver_email, ''))) =
      lower(btrim(coalesce(v_email, '')))
  ) or exists (
      select 1 from public.identity_verifications identity
      where identity.user_id = p_user_id
        and identity.metadata->>'driver_access_id' = access.id::text
    );
  select coalesce(array_agg(identity.id order by identity.id), '{}'::uuid[])
  into v_identity_ids
  from public.identity_verifications identity
  where identity.user_id = p_user_id
    or (
      identity.role in ('driver', 'employee')
      and (
        (
          nullif(btrim(coalesce(v_email, '')), '') is not null
          and nullif(btrim(coalesce(identity.email, '')), '') is not null
          and lower(btrim(coalesce(identity.email, ''))) = lower(btrim(coalesce(v_email, '')))
        )
        or exists (
          select 1 from unnest(v_driver_access_ids) access_id
          where identity.metadata->>'driver_access_id' = access_id::text
        )
      )
    );

  update public.identity_verifications
  set raw_archive_claim_token = null,
      raw_archive_claimed_at = null,
      updated_at = v_now
  where id = any(v_identity_ids)
    and raw_archive_claim_token is not null
    and raw_archive_claimed_at <= v_now - interval '1 hour';
  update public.identity_verifications
  set raw_deletion_claim_token = null,
      raw_deletion_claimed_at = null,
      updated_at = v_now
  where id = any(v_identity_ids)
    and raw_deletion_claim_token is not null
    and raw_deletion_claimed_at <= v_now - interval '1 hour';
  -- Never age-clear an ambiguous provider creation claim. A timed-out Stripe
  -- call may have created a session containing personal data even when the app
  -- never received the ID. Only a same-idempotency retry or reviewed
  -- reconciliation may bind/quarantine it.
  perform set_config('travelyt.provider_redaction_transition', 'on', true);
  update public.identity_verifications
  set provider_redaction_claim_token = null,
      provider_redaction_claimed_at = null,
      provider_redaction_status = case
        when provider_redaction_status = 'requesting' then 'outcome_unknown'
        else provider_redaction_status
      end,
      provider_redaction_error = case
        when provider_redaction_status = 'requesting'
          then coalesce(provider_redaction_error, 'Provider redaction claim expired before a durable outcome was recorded.')
        else provider_redaction_error
      end,
      updated_at = v_now
  where id = any(v_identity_ids)
    and provider_redaction_claim_token is not null
    and provider_redaction_claimed_at <= v_now - interval '1 hour';

  if exists (
    select 1 from public.identity_verifications identity
    where identity.id = any(v_identity_ids)
      and identity.raw_legal_hold_at is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'legal_hold');
  end if;
  if exists (
    select 1 from public.identity_verifications identity
    where identity.id = any(v_identity_ids)
      and identity.raw_archive_claim_token is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_archive_in_progress');
  end if;
  if exists (
    select 1 from public.identity_verifications identity
    where identity.id = any(v_identity_ids)
      and identity.raw_deletion_claim_token is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'identity_destruction_in_progress');
  end if;
  if exists (
    select 1 from public.identity_verifications identity
    where identity.id = any(v_identity_ids)
      and identity.provider_session_claim_token is not null
  ) then
    return jsonb_build_object(
      'ok', false,
      'reason', case
        when exists (
          select 1 from public.identity_verifications unresolved
          where unresolved.id = any(v_identity_ids)
            and unresolved.provider_session_creation_status = 'outcome_unknown'
        ) then 'provider_session_creation_outcome_unknown'
        else 'provider_session_creation_in_progress'
      end
    );
  end if;
  if exists (
    select 1 from public.identity_verifications identity
    where identity.id = any(v_identity_ids)
      and identity.provider_redaction_claim_token is not null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'provider_redaction_in_progress');
  end if;

  -- Driver compliance files and completed/paid custody records have separate
  -- statutory and contractual retention questions. Self-service deletion must
  -- not silently erase or orphan those records; route them to privacy review.
  if cardinality(v_driver_access_ids) > 0 or exists (
    select 1
    from public.bookings booking
    where (
        booking.customer_user_id = p_user_id
        or booking.driver_user_id = p_user_id
        or exists (
          select 1 from public.booking_agent_assignments assignment
          where assignment.booking_id = booking.id
            and (
              assignment.primary_driver_access_id = any(v_driver_access_ids)
              or assignment.backup_driver_access_id = any(v_driver_access_ids)
            )
        )
      )
      and (
        booking.paid_at is not null
        or booking.status in ('delivered', 'closed')
        or exists (
          select 1 from public.custody_events event
          where event.booking_id = booking.id
        )
        or exists (
          select 1 from public.booking_financial_events financial
          where financial.booking_id = booking.id
        )
        or exists (
          select 1 from public.partner_check_in_jobs partner_job
          where partner_job.booking_id = booking.id
        )
      )
  ) then
    insert into public.privacy_deletion_requests (
      user_id, requested_at, status, reason, identity_ids, driver_access_ids, updated_at
    ) values (
      p_user_id, v_now, 'pending_review', 'retained_record_review',
      v_identity_ids, v_driver_access_ids, v_now
    )
    on conflict (user_id) do update
    set requested_at = excluded.requested_at,
        status = 'pending_review',
        reason = excluded.reason,
        identity_ids = excluded.identity_ids,
        driver_access_ids = excluded.driver_access_ids,
        updated_at = excluded.updated_at;
    return jsonb_build_object('ok', false, 'reason', 'retained_record_review');
  end if;

  if exists (
    select 1
    from public.bookings booking
    where (
        booking.customer_user_id = p_user_id
        or booking.driver_user_id = p_user_id
        or exists (
          select 1 from public.identity_verifications identity
          where identity.id = any(v_identity_ids) and identity.booking_id = booking.id
        )
        or exists (
          select 1
          from public.custody_events event
          join public.identity_verifications identity
            on identity.id = event.identity_verification_id
          where identity.id = any(v_identity_ids)
            and event.booking_id = booking.id
        )
        or exists (
          select 1
          from public.booking_agent_assignments assignment
          where assignment.booking_id = booking.id
            and assignment.status in ('assigned', 'accepted')
            and (
              assignment.primary_driver_access_id = any(v_driver_access_ids)
              or assignment.backup_driver_access_id = any(v_driver_access_ids)
            )
        )
      )
      and (
        booking.status in (
          'paid', 'assigned', 'accepted', 'en_route', 'arrived', 'picked_up',
          'in_transit', 'delivery_pending', 'delivered', 'issue'
        )
        or exists (
          select 1 from public.booking_checkout_sessions checkout
          where checkout.booking_id = booking.id
            and checkout.status in (
              'creating', 'open', 'capture_authorized', 'manual_review'
            )
        )
      )
  ) then
    return jsonb_build_object('ok', false, 'reason', 'active_service');
  end if;

  insert into public.account_deletion_claims (
    user_id, requested_at, identity_ids, driver_access_ids
  )
  values (p_user_id, v_now, v_identity_ids, v_driver_access_ids)
  on conflict (user_id) do update
  set requested_at = excluded.requested_at,
      identity_ids = excluded.identity_ids,
      driver_access_ids = excluded.driver_access_ids;

  update public.identity_verifications
  set
    status = 'manual_review',
    liveness_status = 'manual_review',
    verified_at = null,
    raw_purpose_ended_at = coalesce(raw_purpose_ended_at, v_now),
    updated_at = v_now
  where id = any(v_identity_ids)
  ;
  get diagnostics v_claimed_count = row_count;

  update public.agent_readiness_profiles
  set status = 'suspended', updated_by = 'self_service_account_deletion', updated_at = v_now
  where driver_access_id = any(v_driver_access_ids);
  perform set_config('travelyt.account_deletion_claim', 'on', true);
  update public.driver_access_codes
  set status = 'revoked', revoked_at = coalesce(revoked_at, v_now),
      revoked_by = 'self_service_account_deletion'
  where id = any(v_driver_access_ids) and status <> 'revoked';

  return jsonb_build_object(
    'ok', true,
    'reason', 'claimed',
    'identity_count', v_claimed_count,
    'identity_ids', to_jsonb(v_identity_ids),
    'driver_access_ids', to_jsonb(v_driver_access_ids)
  );
end;
$$;

create or replace function public.finalize_account_deletion_identity_detachment(
  p_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_claim public.account_deletion_claims%rowtype;
  v_now timestamptz := clock_timestamp();
  v_booking_ids text[] := '{}'::text[];
  v_email text;
  v_redacted_email text;
begin
  select * into v_claim
  from public.account_deletion_claims
  where user_id = p_user_id;
  if not found then return false; end if;

  select email into v_email from auth.users where id = p_user_id;
  v_redacted_email := 'deleted+' || substr(
    encode(extensions.digest(convert_to(p_user_id::text, 'UTF8'), 'sha256'), 'hex'),
    1,
    20
  ) || '@privacy.invalid';
  select coalesce(array_agg(booking.id order by booking.id), '{}'::text[])
  into v_booking_ids
  from public.bookings booking
  where booking.customer_user_id = p_user_id
    or booking.driver_user_id = p_user_id
    or exists (
      select 1 from public.identity_verifications identity
      where identity.id = any(v_claim.identity_ids)
        and identity.booking_id = booking.id
    )
    or exists (
      select 1 from public.booking_agent_assignments assignment
      where assignment.booking_id = booking.id
        and (
          assignment.primary_driver_access_id = any(v_claim.driver_access_ids)
          or assignment.backup_driver_access_id = any(v_claim.driver_access_ids)
        )
    );

  perform 1
  from public.bookings booking
  where booking.id = any(v_booking_ids)
  order by booking.id
  for update;
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_user_id::text, 8152026)
  );
  select * into v_claim
  from public.account_deletion_claims
  where user_id = p_user_id
  for update;
  if not found then return false; end if;

  if exists (
    select 1 from public.identity_verifications identity
    where identity.id = any(v_claim.identity_ids)
      and (
        identity.raw_deletion_status <> 'destroyed'
        or identity.raw_document_paths <> '[]'::jsonb
        or identity.raw_archive_claim_token is not null
        or identity.raw_deletion_claim_token is not null
        or identity.provider_session_claim_token is not null
        or identity.provider_session_creation_status = 'outcome_unknown'
        or identity.provider_redaction_claim_token is not null
        or (
          identity.provider_session_id is not null
          and identity.provider_redaction_status not in ('processing', 'redacted')
        )
      )
  ) then
    return false;
  end if;

  perform set_config('travelyt.account_deletion_finalize', 'on', true);
  update public.identity_verifications
  set user_id = null,
      email = null,
      phone = null,
      provider_session_id = case
        when provider_redaction_status = 'redacted' then null
        else provider_session_id
      end,
      subject_name = null,
      consent_signature_name = null,
      consent_ip_hash = null,
      consent_user_agent_hash = null,
      verification_invite_token_hash = null,
      verification_invite_expires_at = null,
      verification_invite_sent_at = null,
      verification_invite_otp_hash = null,
      verification_invite_otp_expires_at = null,
      verification_invite_otp_verified_at = null,
      metadata = jsonb_build_object(
        'account_deleted_at', v_now,
        'identity_originals_destroyed', true,
        'audit_record_retained', true
      ),
      updated_at = v_now
  where id = any(v_claim.identity_ids);

  update public.driver_access_codes
  set owner_user_id = null,
      status = 'revoked',
      revoked_at = coalesce(revoked_at, v_now),
      revoked_by = coalesce(revoked_by, 'self_service_account_deletion')
  where id = any(v_claim.driver_access_ids);

  -- A successful self-service deletion is permitted only for accounts without
  -- retained driver/payment/custody records (enforced by the claim RPC). Purge
  -- direct contact/device data and anonymize abandoned booking records before
  -- auth deletion so old links and push channels cannot remain active.
  delete from public.push_tokens token
  where token.user_id = p_user_id or token.booking_id = any(v_booking_ids);
  update public.booking_payment_receipts receipt
  set recipient_email = v_redacted_email, updated_at = v_now
  where receipt.booking_id = any(v_booking_ids);
  update public.booking_exception_events event
  set note = null,
      actor_name = 'Deleted account',
      payload = jsonb_build_object('account_deleted_at', v_now)
  where event.booking_id = any(v_booking_ids);
  update public.ops_exceptions exception
  set message = 'Account-deletion privacy redaction applied.',
      metadata = '{}'::jsonb
  where exception.booking_id = any(v_booking_ids);
  update public.partner_events event
  set payload = jsonb_build_object('account_deleted_at', v_now),
      error_message = null
  where event.booking_id = any(v_booking_ids);
  update public.partner_check_in_jobs partner_job
  set passenger_manifest = '[]'::jsonb,
      last_error_message = null
  where partner_job.booking_id = any(v_booking_ids);
  update public.bags bag
  set label = 'Deleted account bag', description = null
  where bag.booking_id = any(v_booking_ids);
  update public.bookings booking
  set customer_user_id = case
        when booking.customer_user_id = p_user_id then null
        else booking.customer_user_id
      end,
      driver_user_id = case
        when booking.driver_user_id = p_user_id then null
        else booking.driver_user_id
      end,
      customer_name = 'Deleted customer',
      email = v_redacted_email,
      phone = null,
      address = 'Deleted account',
      travel_date = '1970-01-01',
      flight = null,
      flight_time = null,
      notes = null,
      issue_notes = null,
      issue_resolution = null,
      passenger_manifest = '[]'::jsonb,
      proofs = '[]'::jsonb,
      status_history = '[]'::jsonb,
      location_events = '[]'::jsonb,
      customer_signature_name = null,
      customer_access_token = encode(extensions.gen_random_bytes(24), 'hex'),
      delivery_confirmation_code = lpad((floor(random() * 900000 + 100000))::int::text, 6, '0'),
      restricted_items_attested_at = null,
      customer_identity_verified_at = null,
      driver_identity_verified_at = case
        when booking.driver_user_id = p_user_id then null
        else booking.driver_identity_verified_at
      end,
      pilot_eligibility_status = 'expired',
      pilot_eligibility_decided_at = v_now,
      pilot_eligibility_decided_by = 'self_service_account_deletion',
      pilot_eligibility_reason = 'Account deleted before live service.',
      pilot_eligibility_expires_at = v_now,
      pricing_quote = null,
      pricing_fingerprint = null,
      arrival_release_status = 'pending',
      arrival_release_reference = null,
      arrival_release_location = null,
      arrival_release_authorized_at = null,
      arrival_release_authorized_by = null,
      external_provider = null,
      external_reference = null,
      external_status = null,
      external_synced_at = null,
      status = 'cancelled',
      closed_at = coalesce(booking.closed_at, v_now),
      archived_at = coalesce(booking.archived_at, v_now),
      archived_by = 'self_service_account_deletion',
      updated_at = v_now
  where booking.id = any(v_booking_ids);
  if nullif(btrim(coalesce(v_email, '')), '') is not null then
    delete from public.leads lead
    where lower(btrim(lead.email)) = lower(btrim(v_email));
  end if;
  return true;
end;
$$;

revoke all on function public.identity_verification_is_current_complete(uuid)
  from public, anon, authenticated;
revoke all on function public.identity_verification_is_current_complete_for_mode(uuid, text)
  from public, anon, authenticated;
revoke all on function public.booking_has_current_identity(text)
  from public, anon, authenticated;
revoke all on function public.booking_has_current_identity_for_mode(text, text)
  from public, anon, authenticated;
grant execute on function public.booking_has_current_identity(text) to service_role;
grant execute on function public.booking_has_current_identity_for_mode(text, text)
  to service_role;
grant execute on function public.identity_verification_is_current_complete(uuid)
  to service_role;
grant execute on function public.identity_verification_is_current_complete_for_mode(uuid, text)
  to service_role;
revoke all on function public.lock_booking_identity_rows(text)
  from public, anon, authenticated;
grant execute on function public.lock_booking_identity_rows(text)
  to service_role;
revoke all on function public.authorize_booking_payment_capture(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.authorize_booking_payment_capture(text, text, text, boolean)
  to service_role;
revoke all on function public.finalize_booking_payment_capture(text, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_booking_payment_capture(text, text, text, boolean)
  to service_role;
revoke all on function public.identity_name_matches(text, text, text)
  from public, anon, authenticated;
revoke all on function public.identity_iso_date_is_valid(text)
  from public, anon, authenticated;
revoke all on function public.identity_age_at_date(text, text)
  from public, anon, authenticated;
revoke all on function public.identity_iso_timestamp_is_valid_not_future(text)
  from public, anon, authenticated;
revoke all on function public.claim_booking_checkout_session(text)
  from public, anon, authenticated;
grant execute on function public.claim_booking_checkout_session(text)
  to service_role;
revoke all on function public.finalize_booking_checkout_session(text, uuid, text, text, boolean)
  from public, anon, authenticated;
grant execute on function public.finalize_booking_checkout_session(text, uuid, text, text, boolean)
  to service_role;
revoke all on function public.enforce_booking_operational_mode_immutable()
  from public, anon, authenticated;
revoke all on function public.driver_identity_matches_operational_mode(uuid, text)
  from public, anon, authenticated;
revoke all on function public.lock_driver_identity_rows(uuid[])
  from public, anon, authenticated;
revoke all on function public.lock_identity_owner_bookings(uuid)
  from public, anon, authenticated;
revoke all on function public.identity_owner_user_ids(uuid)
  from public, anon, authenticated;
revoke all on function public.claim_identity_provider_session_creation(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_identity_provider_session_creation(uuid, uuid, boolean)
  to service_role;
revoke all on function public.release_identity_provider_session_creation(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.release_identity_provider_session_creation(uuid, uuid, text)
  to service_role;
revoke all on function public.mark_identity_provider_session_creation_unknown(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.mark_identity_provider_session_creation_unknown(uuid, uuid, text)
  to service_role;
revoke all on function public.finalize_identity_provider_session_creation(uuid, uuid, text, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_identity_provider_session_creation(uuid, uuid, text, jsonb, jsonb)
  to service_role;
revoke all on function public.quarantine_identity_provider_session_creation(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.quarantine_identity_provider_session_creation(uuid, uuid, text, text)
  to service_role;
revoke all on function public.claim_identity_provider_redaction(uuid, uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.claim_identity_provider_redaction(uuid, uuid, uuid, text)
  to service_role;
revoke all on function public.record_identity_provider_redaction_result(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_identity_provider_redaction_result(uuid, uuid, text, text, text, text)
  to service_role;
revoke all on function public.reconcile_identity_provider_redaction(text, text)
  from public, anon, authenticated;
grant execute on function public.reconcile_identity_provider_redaction(text, text)
  to service_role;
revoke all on function public.claim_account_deletion(uuid)
  from public, anon, authenticated;
grant execute on function public.claim_account_deletion(uuid)
  to service_role;
revoke all on function public.finalize_account_deletion_identity_detachment(uuid)
  from public, anon, authenticated;
grant execute on function public.finalize_account_deletion_identity_detachment(uuid)
  to service_role;
revoke all on function public.claim_identity_original_archive(uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.claim_identity_original_archive(uuid, uuid)
  to service_role;
revoke all on function public.claim_incomplete_identity_archive_cleanup(uuid, uuid, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.claim_incomplete_identity_archive_cleanup(uuid, uuid, jsonb, text)
  to service_role;
revoke all on function public.claim_identity_original_destruction(uuid, uuid, timestamptz, text)
  from public, anon, authenticated;
grant execute on function public.claim_identity_original_destruction(uuid, uuid, timestamptz, text)
  to service_role;
revoke all on function public.finalize_identity_original_destruction(uuid, uuid, boolean, jsonb, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.finalize_identity_original_destruction(uuid, uuid, boolean, jsonb, text, jsonb)
  to service_role;
revoke all on function public.enforce_identity_account_deletion_claim()
  from public, anon, authenticated;
revoke all on function public.enforce_booking_account_deletion_claim()
  from public, anon, authenticated;
revoke all on function public.enforce_assignment_account_deletion_claim()
  from public, anon, authenticated;
revoke all on function public.bind_driver_access_owner_from_email()
  from public, anon, authenticated;
revoke all on function public.bind_driver_access_for_auth_user()
  from public, anon, authenticated;
revoke all on function public.enforce_driver_access_account_deletion_claim()
  from public, anon, authenticated;
revoke all on function public.enforce_identity_legal_hold_destruction_order()
  from public, anon, authenticated;
revoke all on function public.enforce_identity_provider_session_binding()
  from public, anon, authenticated;
revoke all on function public.enforce_identity_provider_redaction_transition()
  from public, anon, authenticated;

-- Runtime code reads child rows but all mutations must go through the
-- database-owned transition/checkpoint functions, preserving booking-first
-- lock order and server-snapshotted operating mode.
revoke insert, update, delete, truncate on public.booking_agent_assignments from service_role;
grant select on public.booking_agent_assignments to service_role;
revoke insert, update, delete, truncate on public.custody_checkpoints from service_role;
grant select on public.custody_checkpoints to service_role;

comment on function public.booking_has_current_identity(text) is
  'Authoritative current identity gate for pilot approval and custody; booking cache flags alone are insufficient.';
