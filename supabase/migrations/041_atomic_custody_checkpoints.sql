-- Atomic, idempotent custody checkpoints.
--
-- This migration keeps legacy ledger values readable but permits new writes
-- only through service-role RPCs that validate assignment, authorization,
-- transition order, expected bag count, and one event per bag. PostgreSQL
-- functions run with an explicit safe search_path and the chain trigger locks
-- the parent bag row before assigning a sequence number.

alter table public.custody_events
  drop constraint if exists custody_events_event_type_check;

alter table public.custody_events
  add constraint custody_events_event_type_check check (event_type in (
    'bag_registered',
    'custody_accepted',
    'route_checkpoint',
    'traveler_return',
    'recipient_delivery',
    'recipient_confirmed',
    'operations_close_override',
    'carrier_transfer',
    'exception_opened',
    -- Legacy values remain readable because sealed history is immutable.
    'badge_issued',
    'picked_up',
    'in_transit',
    'security_handoff',
    'delivered',
    'exception'
  ));

-- Bag N is part of the evidence contract. Timestamp/UUID order is not a
-- deterministic physical-bag mapping, especially for one transactional issue.
alter table public.bags add column if not exists bag_number integer;

update public.bags
set bag_number = ((regexp_match(label, '^Bag ([0-9]+) of [0-9]+$'))[1])::integer
where bag_number is null and label ~ '^Bag [0-9]+ of [0-9]+$';

do $$
begin
  if exists (select 1 from public.bags where bag_number is null) then
    raise exception 'Existing bag labels need manual reconciliation before deterministic bag numbers can be added.';
  end if;
end;
$$;

alter table public.bags alter column bag_number set not null;
alter table public.bags drop constraint if exists bags_bag_number_check;
alter table public.bags add constraint bags_bag_number_check
  check (bag_number between 1 and 20);
create unique index if not exists bags_booking_bag_number_idx
  on public.bags (booking_id, bag_number);

-- Arrival release is a distinct external authority gate. These fields remain
-- pending unless operations records the exact authorization and public release
-- location for this booking; software alone cannot infer permission.
alter table public.bookings
  add column if not exists arrival_release_status text not null default 'pending',
  add column if not exists arrival_release_reference text,
  add column if not exists arrival_release_location text,
  add column if not exists arrival_release_authorized_at timestamptz,
  add column if not exists arrival_release_authorized_by text;

alter table public.bookings
  drop constraint if exists bookings_arrival_release_status_check;
alter table public.bookings
  add constraint bookings_arrival_release_status_check
  check (arrival_release_status in ('pending', 'authorized', 'revoked'));

create table if not exists public.custody_checkpoints (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  checkpoint_key text not null,
  expected_bag_count integer not null check (expected_bag_count between 1 and 20),
  event_type text not null,
  actor_role text not null,
  actor_name text,
  verified_method text not null,
  driver_access_id uuid references public.driver_access_codes(id) on delete restrict,
  request_fingerprint text not null,
  booking_status_before text,
  booking_status_after text,
  bag_ids uuid[] not null,
  event_ids uuid[] not null,
  created_at timestamptz not null default now(),
  constraint custody_checkpoints_modern_event check (event_type in (
    'bag_registered', 'custody_accepted',
    'traveler_return', 'recipient_delivery', 'recipient_confirmed',
    'operations_close_override', 'carrier_transfer'
  )),
  constraint custody_checkpoints_key_shape
    check (checkpoint_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'),
  constraint custody_checkpoints_one_event_per_bag
    check (
      cardinality(bag_ids) = expected_bag_count and
      cardinality(event_ids) = expected_bag_count
    ),
  unique (booking_id, checkpoint_key)
);

create index if not exists custody_checkpoints_booking_created_idx
  on public.custody_checkpoints (booking_id, created_at desc);

alter table public.custody_checkpoints enable row level security;
revoke all on public.custody_checkpoints from public, anon, authenticated;

create or replace function public.custody_events_chain()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
declare
  locked_bag public.bags%rowtype;
  last_event public.custody_events%rowtype;
  payload text;
begin
  -- The parent-bag row is the per-ledger serialization lock. This also closes
  -- the empty-chain race where two concurrent genesis rows could both choose 1.
  select * into locked_bag
  from public.bags
  where id = new.bag_id
  for update;
  if not found then
    raise exception using errcode = '23503', message = 'Custody bag does not exist.';
  end if;
  if new.booking_id <> locked_bag.booking_id or new.badge_code <> locked_bag.badge_code then
    raise exception using errcode = '23514',
      message = 'Custody event booking and badge must match the locked bag record.';
  end if;
  -- Ledger time is server-owned. Offline capture time remains separately
  -- preserved inside the immutable proof details hashed into `note`.
  new.created_at := clock_timestamp();

  select * into last_event
  from public.custody_events
  where bag_id = new.bag_id
  order by seq desc
  limit 1;

  if found then
    new.seq := last_event.seq + 1;
    new.prev_hash := last_event.event_hash;
  else
    new.seq := 1;
    new.prev_hash := repeat('0', 64);
  end if;

  payload := concat_ws('|',
    new.prev_hash,
    new.bag_id::text,
    new.badge_code,
    new.seq::text,
    new.event_type,
    new.actor_role,
    coalesce(new.actor_name, ''),
    coalesce(new.identity_verification_id::text, ''),
    new.verified_method,
    coalesce(new.photo_path, ''),
    coalesce(new.location_lat::text, ''),
    coalesce(new.location_lng::text, ''),
    coalesce(new.note, ''),
    extract(epoch from new.created_at)::text
  );

  new.event_hash := pg_catalog.encode(extensions.digest(payload, 'sha256'), 'hex');
  return new;
end;
$$;

create or replace function public.custody_events_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'custody_events is append-only; % is not permitted', tg_op;
end;
$$;

create or replace function public.verify_custody_chain(p_bag_id uuid)
returns table (ok boolean, broken_seq integer, total integer)
language plpgsql
set search_path = pg_catalog
as $$
declare
  ev public.custody_events%rowtype;
  expected_prev text := repeat('0', 64);
  recomputed text;
  payload text;
  cnt integer := 0;
begin
  -- Coordinate verification with inserts by sharing the same parent-row lock.
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

create or replace function public.issue_custody_bags(
  p_booking_id text,
  p_expected_bag_count integer,
  p_badge_codes text[],
  p_actor_name text,
  p_checkpoint_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_booking_bag_count integer;
  v_existing public.custody_checkpoints%rowtype;
  v_existing_bag_count integer;
  v_bag public.bags%rowtype;
  v_event public.custody_events%rowtype;
  v_bag_ids uuid[] := '{}'::uuid[];
  v_event_ids uuid[] := '{}'::uuid[];
  v_bags jsonb;
  v_events jsonb;
  v_fingerprint text;
  v_index integer;
begin
  if p_expected_bag_count is null or p_expected_bag_count not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Expected bag count must be between 1 and 20.';
  end if;
  if p_badge_codes is null or cardinality(p_badge_codes) <> p_expected_bag_count then
    raise exception using errcode = '22023', message = 'Badge code count does not match expected bag count.';
  end if;
  if p_checkpoint_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$' then
    raise exception using errcode = '22023', message = 'Checkpoint key is invalid.';
  end if;
  if nullif(btrim(p_actor_name), '') is null then
    raise exception using errcode = '22023', message = 'Issuing administrator identity is required.';
  end if;
  if exists (
    select 1 from unnest(p_badge_codes) as u(code)
    where code !~ '^TVT-B-[A-HJ-NP-Z2-9]{6}$'
  ) or (select count(distinct code) from unnest(p_badge_codes) as u(code)) <> p_expected_bag_count then
    raise exception using errcode = '22023', message = 'Badge codes are invalid or duplicated.';
  end if;

  select b.bags into v_booking_bag_count
  from public.bookings b
  where b.id = p_booking_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found.';
  end if;
  if v_booking_bag_count <> p_expected_bag_count then
    raise exception using errcode = '22023', message = 'Booking bag count does not match expected bag count.';
  end if;

  v_fingerprint := pg_catalog.encode(extensions.digest(concat_ws('|',
    p_booking_id, p_checkpoint_key, p_expected_bag_count::text,
    'bag_registered', 'operations', btrim(p_actor_name), 'account_session',
    array_to_string(p_badge_codes, ',')
  ), 'sha256'), 'hex');

  select * into v_existing from public.custody_checkpoints
  where booking_id = p_booking_id and checkpoint_key = p_checkpoint_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Checkpoint key was already used for a different custody request.';
    end if;
    select coalesce(jsonb_agg(to_jsonb(b) order by b.bag_number), '[]'::jsonb)
      into v_bags from public.bags b where b.id = any(v_existing.bag_ids);
    select coalesce(jsonb_agg(to_jsonb(e) order by e.badge_code), '[]'::jsonb)
      into v_events from public.custody_events e where e.id = any(v_existing.event_ids);
    if jsonb_array_length(v_bags) <> p_expected_bag_count or
       jsonb_array_length(v_events) <> p_expected_bag_count then
      raise exception using errcode = 'P0001', message = 'Stored badge issuance checkpoint is incomplete.';
    end if;
    return jsonb_build_object('ok', true, 'idempotent', true, 'bags', v_bags, 'events', v_events);
  end if;

  select count(*) into v_existing_bag_count from public.bags where booking_id = p_booking_id;
  if v_existing_bag_count <> 0 then
    raise exception using errcode = '23505', message = 'Booking already has bag records outside this issuance checkpoint.';
  end if;

  for v_index in 1..p_expected_bag_count loop
    insert into public.bags (booking_id, badge_code, bag_number, label)
    values (p_booking_id, p_badge_codes[v_index], v_index, format('Bag %s of %s', v_index, p_expected_bag_count))
    returning * into v_bag;

    insert into public.custody_events (
      bag_id, booking_id, badge_code, seq, event_type, actor_role, actor_name,
      verified_method, note, prev_hash, event_hash
    ) values (
      v_bag.id, p_booking_id, v_bag.badge_code, 0, 'bag_registered',
      'operations', btrim(p_actor_name), 'account_session',
      'Bag registered into the Travelyt custody protocol', '', ''
    ) returning * into v_event;

    v_bag_ids := array_append(v_bag_ids, v_bag.id);
    v_event_ids := array_append(v_event_ids, v_event.id);
  end loop;

  insert into public.custody_checkpoints (
    booking_id, checkpoint_key, expected_bag_count, event_type, actor_role,
    actor_name, verified_method, request_fingerprint, bag_ids, event_ids
  ) values (
    p_booking_id, p_checkpoint_key, p_expected_bag_count, 'bag_registered',
    'operations', btrim(p_actor_name), 'account_session', v_fingerprint,
    v_bag_ids, v_event_ids
  );

  select coalesce(jsonb_agg(to_jsonb(b) order by b.bag_number), '[]'::jsonb)
    into v_bags from public.bags b where b.id = any(v_bag_ids);
  select coalesce(jsonb_agg(to_jsonb(e) order by e.badge_code), '[]'::jsonb)
    into v_events from public.custody_events e where e.id = any(v_event_ids);
  return jsonb_build_object('ok', true, 'idempotent', false, 'bags', v_bags, 'events', v_events);
end;
$$;

create or replace function public.record_custody_checkpoint(
  p_booking_id text,
  p_checkpoint_key text,
  p_expected_bag_count integer,
  p_event_type text,
  p_actor_role text,
  p_actor_name text,
  p_verified_method text,
  p_driver_access_id uuid,
  p_identity_verification_id uuid,
  p_photo_path text,
  p_location_lat numeric,
  p_location_lng numeric,
  p_note text,
  p_seals jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  v_booking public.bookings%rowtype;
  v_assignment public.booking_agent_assignments%rowtype;
  v_access public.driver_access_codes%rowtype;
  v_readiness public.agent_readiness_profiles%rowtype;
  v_identity public.identity_verifications%rowtype;
  v_existing public.custody_checkpoints%rowtype;
  v_bag public.bags%rowtype;
  v_event public.custody_events%rowtype;
  v_last_event_type text;
  v_actor_role text := p_actor_role;
  v_actor_name text := nullif(btrim(p_actor_name), '');
  v_verified_method text := p_verified_method;
  v_identity_verification_id uuid;
  v_bag_count integer;
  v_index integer := 0;
  v_seal jsonb;
  v_submitted_seal jsonb;
  v_event_proof jsonb;
  v_effective_proof jsonb;
  v_canonical_seals jsonb := '[]'::jsonb;
  v_seal_proofs jsonb := '[]'::jsonb;
  v_proof_kind text;
  v_event_photo_path text;
  v_event_lat numeric;
  v_event_lng numeric;
  v_note text;
  v_status text;
  v_expected_booking_status text;
  v_next_booking_status text;
  v_checkpoint_created_at timestamptz := now();
  v_fingerprint text;
  v_bag_ids uuid[] := '{}'::uuid[];
  v_event_ids uuid[] := '{}'::uuid[];
  v_events jsonb;
begin
  if p_event_type not in (
    'custody_accepted', 'traveler_return',
    'recipient_delivery', 'recipient_confirmed', 'operations_close_override',
    'carrier_transfer'
  ) then
    raise exception using errcode = '22023', message = 'Legacy or unsupported custody event type.';
  end if;
  if p_expected_bag_count is null or p_expected_bag_count not between 1 and 20 then
    raise exception using errcode = '22023', message = 'Expected bag count must be between 1 and 20.';
  end if;
  if p_checkpoint_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$' then
    raise exception using errcode = '22023', message = 'Checkpoint key is invalid.';
  end if;
  if p_seals is null or jsonb_typeof(p_seals) <> 'array' then
    raise exception using errcode = '22023', message = 'Seal evidence must be a JSON array.';
  end if;
  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then
    raise exception using errcode = '22023', message = 'Latitude is invalid.';
  end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then
    raise exception using errcode = '22023', message = 'Longitude is invalid.';
  end if;
  if p_event_type in ('custody_accepted', 'traveler_return', 'recipient_delivery', 'carrier_transfer') then
    if jsonb_array_length(p_seals) <> p_expected_bag_count or
       (select count(distinct (value->>'bagIndex')) from jsonb_array_elements(p_seals) value) <> p_expected_bag_count or
       (select count(distinct upper(btrim(value->>'sealId'))) from jsonb_array_elements(p_seals) value) <> p_expected_bag_count or
       exists (
         select 1 from jsonb_array_elements(p_seals) value
         where coalesce(value->>'sealStatus', '') <> 'intact'
           or coalesce(value->>'sealMethod', '') not in ('zipper', 'latch_label', 'handle')
           or nullif(btrim(value->>'sealId'), '') is null
           or upper(btrim(value->>'sealId')) !~ '^[A-Z0-9][A-Z0-9-]{2,63}$'
           or coalesce(value->>'bagIndex', '') !~ '^([1-9]|1[0-9]|20)$'
           or case
             when coalesce(value->>'bagIndex', '') ~ '^([1-9]|1[0-9]|20)$'
               then (value->>'bagIndex')::integer > p_expected_bag_count
             else false
           end
           or coalesce(value->>'proofCheckpointKey', '') !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
           or length(coalesce(value->>'proofStoragePath', '')) not between 3 and 1000
       ) then
      raise exception using errcode = '22023',
        message = 'Every custody acceptance or transfer needs one exact durable intact-seal proof per bag.';
    end if;
  end if;

  select coalesce(jsonb_agg(value order by (value->>'bagIndex')::integer), '[]'::jsonb)
    into v_canonical_seals
  from jsonb_array_elements(p_seals) value;

  select * into v_booking from public.bookings where id = p_booking_id for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found.';
  end if;
  if v_booking.bags <> p_expected_bag_count then
    raise exception using errcode = '22023', message = 'Booking bag count does not match expected bag count.';
  end if;

  if p_driver_access_id is not null then
    select * into v_access from public.driver_access_codes
    where id = p_driver_access_id and status = 'active'
      and (expires_at is null or expires_at > now())
    for share;
    if not found then
      raise exception using errcode = '42501', message = 'Individual driver access is not active.';
    end if;

    select * into v_readiness from public.agent_readiness_profiles
    where driver_access_id = p_driver_access_id
    for share;
    if not found or v_readiness.status <> 'active' or
       nullif(btrim(v_readiness.identity_evidence_reference), '') is null or
       v_readiness.identity_evidence_reference !~ '^stripe_identity:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' or
       v_readiness.identity_verified_at is null or v_readiness.identity_verified_at > now() or
       (v_readiness.identity_expires_at is not null and v_readiness.identity_expires_at <= now()) or
       nullif(btrim(v_readiness.training_evidence_reference), '') is null or
       v_readiness.training_completed_at is null or v_readiness.training_completed_at > now() or
       v_readiness.training_expires_at is null or v_readiness.training_expires_at <= now() or
       nullif(btrim(v_readiness.insurance_evidence_reference), '') is null or
       v_readiness.insurance_verified_at is null or v_readiness.insurance_verified_at > now() or
       v_readiness.insurance_expires_at is null or v_readiness.insurance_expires_at <= now() or
       nullif(btrim(v_readiness.vehicle_make_model), '') is null or
       nullif(btrim(v_readiness.license_plate), '') is null or
       nullif(btrim(v_readiness.vehicle_evidence_reference), '') is null or
       v_readiness.vehicle_verified_at is null or v_readiness.vehicle_verified_at > now() or
       v_readiness.vehicle_expires_at is null or v_readiness.vehicle_expires_at <= now() then
      raise exception using errcode = '42501',
        message = 'Current certified driver identity, training, insurance, and vehicle readiness are required.';
    end if;

    v_identity_verification_id := split_part(v_readiness.identity_evidence_reference, ':', 2)::uuid;
    select * into v_identity from public.identity_verifications
    where id = v_identity_verification_id
      and status = 'verified'
      and provider = 'stripe_identity'
      and role in ('driver', 'employee')
      and verified_at is not null and verified_at <= now()
      and (expires_at is null or expires_at > now())
      and nullif(btrim(email), '') is not null
      and lower(btrim(email)) = lower(btrim(v_access.driver_email))
    for share;
    if not found then
      raise exception using errcode = '42501',
        message = 'The active readiness file is not bound to a current verified driver identity.';
    end if;
    if p_identity_verification_id is not null and
       p_identity_verification_id <> v_identity_verification_id then
      raise exception using errcode = '42501',
        message = 'Client identity evidence does not match the server-certified driver identity.';
    end if;

    select * into v_assignment from public.booking_agent_assignments
    where booking_id = p_booking_id
      and status = 'accepted'
      and primary_driver_access_id = p_driver_access_id
      and accepted_by_driver_access_id = p_driver_access_id
    order by accepted_at desc
    limit 1
    for share;
    if not found then
      raise exception using errcode = '42501', message = 'Only the accepted primary driver may write this custody checkpoint.';
    end if;
    v_actor_role := 'agent';
    v_actor_name := v_access.driver_name;
    if p_verified_method not in ('access_code', 'account_session') then
      raise exception using errcode = '22023', message = 'Driver verification method is invalid.';
    end if;
    v_verified_method := p_verified_method;
  elsif p_event_type = 'recipient_confirmed' then
    if p_actor_role <> 'traveler' or p_verified_method not in ('account_session', 'confirmation_code') then
      raise exception using errcode = '42501', message = 'Recipient confirmation requires the traveler account or confirmation code.';
    end if;
  elsif p_event_type = 'operations_close_override' then
    if p_actor_role <> 'operations' or p_verified_method <> 'manual_record' then
      raise exception using errcode = '42501', message = 'Operations override requires an administrator manual record.';
    end if;
  else
    raise exception using errcode = '42501', message = 'A database-backed accepted primary driver is required.';
  end if;
  if v_actor_name is null then
    raise exception using errcode = '22023', message = 'Actor identity is required.';
  end if;

  -- Idempotency compares only immutable request inputs. Stored proof snapshots
  -- are sealed into the event rows below; later evidence uploads must not make
  -- an exact retry conflict with an already-committed checkpoint.
  v_fingerprint := pg_catalog.encode(extensions.digest(concat_ws('|',
    p_booking_id, p_checkpoint_key, p_expected_bag_count::text, p_event_type,
    v_actor_role, coalesce(v_actor_name, ''), v_verified_method,
    coalesce(p_driver_access_id::text, ''), coalesce(v_identity_verification_id::text, ''),
    coalesce(p_photo_path, ''), coalesce(p_location_lat::text, ''),
    coalesce(p_location_lng::text, ''), coalesce(p_note, ''), v_canonical_seals::text
  ), 'sha256'), 'hex');

  select * into v_existing from public.custody_checkpoints
  where booking_id = p_booking_id and checkpoint_key = p_checkpoint_key;
  if found then
    if v_existing.request_fingerprint <> v_fingerprint then
      raise exception using errcode = '23505', message = 'Checkpoint key was already used for a different custody request.';
    end if;
    select coalesce(jsonb_agg(to_jsonb(e) order by e.badge_code), '[]'::jsonb)
      into v_events from public.custody_events e where e.id = any(v_existing.event_ids);
    if jsonb_array_length(v_events) <> p_expected_bag_count then
      raise exception using errcode = 'P0001', message = 'Stored custody checkpoint is incomplete.';
    end if;
    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'events', v_events,
      'bookingStatus', v_existing.booking_status_after
    );
  end if;

  if v_booking.pilot_eligibility_status <> 'approved' or
     v_booking.pilot_eligibility_expires_at is null or
     v_booking.paid_at is null or
     v_booking.paid_at > v_booking.pilot_eligibility_expires_at then
    raise exception using errcode = '42501',
      message = 'Pilot eligibility was not used for payment before its deadline.';
  end if;
  if v_booking.customer_identity_verified_at is null or
     v_booking.driver_identity_verified_at is null or
     v_booking.restricted_items_attested_at is null then
    raise exception using errcode = '42501',
      message = 'Customer identity, driver identity, and prohibited-item declaration are required.';
  end if;
  if jsonb_typeof(v_booking.passenger_manifest) <> 'array' or
     jsonb_array_length(v_booking.passenger_manifest) = 0 or exists (
    select 1 from jsonb_array_elements(v_booking.passenger_manifest) passenger
    where
      coalesce(passenger->>'verificationMethod', '') not in (
        'primary_account', 'self_service', 'guardian', 'household_spouse'
      ) or
      (passenger->>'verificationMethod' = 'primary_account' and v_booking.customer_identity_verified_at is null) or
      (passenger->>'verificationMethod' = 'self_service' and (
        passenger->>'verificationStatus' <> 'verified' or
        nullif(passenger->>'identityVerifiedAt', '') is null
      )) or
      (passenger->>'verificationMethod' = 'guardian' and (
        passenger->>'verificationStatus' not in ('guardian_attested', 'verified') or
        nullif(passenger->>'guardianAttestedAt', '') is null
      )) or
      (passenger->>'verificationMethod' = 'household_spouse' and (
        passenger->>'verificationStatus' not in ('household_attested', 'verified') or
        nullif(passenger->>'householdAttestedAt', '') is null
      ))
  ) then
    raise exception using errcode = '42501', message = 'Traveler manifest verification is incomplete.';
  end if;
  if jsonb_typeof(v_booking.proofs) <> 'array' then
    raise exception using errcode = '42501', message = 'Stored booking proof evidence is invalid.';
  end if;

  if p_driver_access_id is not null then
    v_proof_kind := case p_event_type
      when 'custody_accepted' then 'seal'
      when 'traveler_return' then 'customer_handoff'
      when 'carrier_transfer' then 'airline_handoff'
      when 'recipient_delivery' then 'delivery'
      else null
    end;
    if v_proof_kind is null then
      raise exception using errcode = '42501',
        message = 'This driver checkpoint has no activated stored-proof workflow.';
    end if;
    select proof into v_event_proof
    from jsonb_array_elements(v_booking.proofs) proof
    where proof->>'kind' = v_proof_kind
      and proof->>'custodyCheckpointKey' = p_checkpoint_key
    order by proof->>'timestamp' desc
    limit 1;
    if v_event_proof is null or
       nullif(v_event_proof->>'storagePath', '') is null or
       jsonb_typeof(v_event_proof->'location') <> 'object' or
       coalesce(v_event_proof->'location'->>'latitude', '') !~ '^-?[0-9]+([.][0-9]+)?$' or
       coalesce(v_event_proof->'location'->>'longitude', '') !~ '^-?[0-9]+([.][0-9]+)?$' then
      raise exception using errcode = '42501',
        message = 'The checkpoint key is not bound to durable stored photo and GPS evidence.';
    end if;
    if p_event_type in ('traveler_return', 'carrier_transfer') and (
      jsonb_typeof(v_event_proof->'handoff') <> 'object' or
      nullif(btrim(v_event_proof->'handoff'->>'recipientName'), '') is null or
      nullif(btrim(v_event_proof->'handoff'->>'organization'), '') is null or
      nullif(btrim(v_event_proof->'handoff'->>'badgeOrReference'), '') is null or
      coalesce(v_event_proof->'handoff'->>'verificationMethod', '') not in (
        'employee_badge', 'driver_license', 'passport', 'manual'
      )
    ) then
      raise exception using errcode = '42501',
        message = 'Stored handoff proof must identify the receiving party and verification method.';
    end if;
  end if;

  if p_event_type = 'carrier_transfer' and not (
    nullif(btrim(v_booking.external_provider), '') is not null and
    nullif(btrim(v_booking.external_reference), '') is not null and
    lower(coalesce(v_booking.external_status, '')) in ('carrier_handoff_authorized', 'handoff_ready')
  ) then
    raise exception using errcode = '42501', message = 'Carrier and station authorization is not recorded for this booking.';
  end if;
  if v_booking.service = 'arrival' and p_event_type in ('custody_accepted', 'route_checkpoint', 'recipient_delivery') and not (
    v_booking.arrival_release_status = 'authorized' and
    nullif(btrim(v_booking.arrival_release_reference), '') is not null and
    nullif(btrim(v_booking.arrival_release_location), '') is not null and
    v_booking.arrival_release_authorized_at is not null and
    nullif(btrim(v_booking.arrival_release_authorized_by), '') is not null
  ) then
    raise exception using errcode = '42501',
      message = 'Airport-release authority, reference, location, time, and approver are required for arrival custody.';
  end if;

  v_expected_booking_status := case p_event_type
    when 'custody_accepted' then 'arrived'
    when 'traveler_return' then 'picked_up'
    when 'carrier_transfer' then 'picked_up'
    when 'recipient_delivery' then 'in_transit'
    when 'recipient_confirmed' then 'delivery_pending'
    when 'operations_close_override' then v_booking.status
  end;
  v_next_booking_status := case p_event_type
    when 'custody_accepted' then case when v_booking.service = 'arrival' then 'in_transit' else 'picked_up' end
    when 'traveler_return' then 'delivery_pending'
    when 'carrier_transfer' then 'delivered'
    when 'recipient_delivery' then 'delivery_pending'
    when 'recipient_confirmed' then 'closed'
    when 'operations_close_override' then 'closed'
  end;
  select count(*) into v_bag_count from public.bags where booking_id = p_booking_id;
  if v_bag_count = 0 or v_bag_count <> p_expected_bag_count then
    raise exception using errcode = '22023', message = 'Actual bag records do not match expected bag count.';
  end if;

  -- Every submitted bag seal names its exact durable proof key and storage
  -- path. Custody acceptance binds to the current key; later transfers may use
  -- only the seal snapshot that was sealed by the completed acceptance.
  select coalesce(jsonb_agg(exact.proof order by (submitted->>'bagIndex')::integer), '[]'::jsonb)
    into v_seal_proofs
  from jsonb_array_elements(v_canonical_seals) submitted
  cross join lateral (
    select proof
    from jsonb_array_elements(v_booking.proofs) proof
    where proof->>'kind' = 'seal'
      and proof->>'bagIndex' = submitted->>'bagIndex'
      and upper(btrim(proof->>'sealId')) = upper(btrim(submitted->>'sealId'))
      and proof->>'sealMethod' = submitted->>'sealMethod'
      and proof->>'sealStatus' = submitted->>'sealStatus'
      and proof->>'custodyCheckpointKey' = submitted->>'proofCheckpointKey'
      and proof->>'storagePath' = submitted->>'proofStoragePath'
      and (
        (p_event_type = 'custody_accepted' and
          proof->>'custodyCheckpointKey' = p_checkpoint_key) or
        (p_event_type <> 'custody_accepted' and exists (
          select 1
          from public.custody_checkpoints accepted_checkpoint
          join public.custody_events accepted_event
            on accepted_event.id = any(accepted_checkpoint.event_ids)
          join public.bags accepted_bag
            on accepted_bag.id = accepted_event.bag_id
          where accepted_checkpoint.booking_id = p_booking_id
            and accepted_checkpoint.checkpoint_key = proof->>'custodyCheckpointKey'
            and accepted_checkpoint.event_type = 'custody_accepted'
            and accepted_checkpoint.expected_bag_count = p_expected_bag_count
            and accepted_event.booking_id = p_booking_id
            and accepted_event.event_type = 'custody_accepted'
            and accepted_bag.booking_id = p_booking_id
            and accepted_bag.bag_number = (proof->>'bagIndex')::integer
            and accepted_event.badge_code = accepted_bag.badge_code
            and accepted_event.note::jsonb->>'checkpointKey' = proof->>'custodyCheckpointKey'
            and accepted_event.note::jsonb->'seal'->>'bagIndex' = proof->>'bagIndex'
            and upper(btrim(accepted_event.note::jsonb->'seal'->>'sealSerial')) =
              upper(btrim(proof->>'sealId'))
            and accepted_event.note::jsonb->'seal'->>'sealMethod' = proof->>'sealMethod'
            and accepted_event.note::jsonb->'seal'->>'sealStatus' = proof->>'sealStatus'
            and accepted_event.note::jsonb->'seal'->>'sealPhotoPath' = proof->>'storagePath'
            and accepted_event.note::jsonb->'seal'->>'sealProofCheckpointKey' =
              proof->>'custodyCheckpointKey'
        ))
      )
    order by proof->>'timestamp' desc
    limit 1
  ) exact;

  if p_event_type in ('custody_accepted', 'traveler_return', 'recipient_delivery', 'carrier_transfer') and (
    jsonb_array_length(v_seal_proofs) <> p_expected_bag_count or
    exists (
      select 1 from jsonb_array_elements(v_seal_proofs) proof
      where (proof->>'bagIndex')::integer not between 1 and p_expected_bag_count or
        upper(btrim(proof->>'sealId')) !~ '^[A-Z0-9][A-Z0-9-]{2,63}$' or
        coalesce(proof->>'sealMethod', '') not in ('zipper', 'latch_label', 'handle') or
        coalesce(proof->>'sealStatus', '') <> 'intact' or
        nullif(proof->>'storagePath', '') is null or
        nullif(proof->>'custodyCheckpointKey', '') is null or
        jsonb_typeof(proof->'location') <> 'object' or
        coalesce(proof->'location'->>'latitude', '') !~ '^-?[0-9]+([.][0-9]+)?$' or
        coalesce(proof->'location'->>'longitude', '') !~ '^-?[0-9]+([.][0-9]+)?$' or
        (p_event_type = 'custody_accepted' and (
          jsonb_typeof(proof->'handoff') <> 'object' or
          nullif(btrim(proof->'handoff'->>'recipientName'), '') is null or
          nullif(btrim(proof->'handoff'->>'organization'), '') is null or
          nullif(btrim(proof->'handoff'->>'badgeOrReference'), '') is null or
          coalesce(proof->'handoff'->>'verificationMethod', '') not in (
            'employee_badge', 'driver_license', 'passport', 'manual'
          )
        ))
    )
  ) then
    raise exception using errcode = '22023',
      message = 'Latest stored seal proof must bind every physical bag to an intact seal, photo, GPS, and release record.';
  end if;

  if p_event_type = 'operations_close_override' and v_booking.status not in ('delivery_pending', 'delivered') then
    raise exception using errcode = '22023', message = 'Operations close override requires delivery-pending or delivered status.';
  elsif p_event_type <> 'operations_close_override' and v_booking.status <> v_expected_booking_status then
    raise exception using errcode = '22023',
      message = format('Booking status %s cannot record %s; expected %s.', v_booking.status, p_event_type, v_expected_booking_status);
  end if;

  for v_bag in
    select * from public.bags where booking_id = p_booking_id order by bag_number for update
  loop
    v_index := v_bag.bag_number;
    select ce.event_type into v_last_event_type
    from public.custody_events ce
    where ce.bag_id = v_bag.id
    order by ce.seq desc
    limit 1;

    if
      (p_event_type = 'custody_accepted' and coalesce(v_last_event_type, '') not in ('bag_registered', 'badge_issued')) or
      (p_event_type in ('traveler_return', 'recipient_delivery', 'carrier_transfer') and coalesce(v_last_event_type, '') not in ('custody_accepted', 'route_checkpoint', 'picked_up', 'in_transit')) or
      (p_event_type = 'recipient_confirmed' and coalesce(v_last_event_type, '') not in ('traveler_return', 'recipient_delivery')) or
      (p_event_type = 'operations_close_override' and coalesce(v_last_event_type, '') not in ('traveler_return', 'recipient_delivery', 'carrier_transfer'))
    then
      raise exception using errcode = '22023',
        message = format('Invalid custody transition from %s to %s.', coalesce(v_last_event_type, 'none'), p_event_type);
    end if;

    v_submitted_seal := null;
    select value into v_submitted_seal
    from jsonb_array_elements(v_canonical_seals) value
    where coalesce(value->>'bagIndex', '') ~ '^([1-9]|1[0-9]|20)$'
      and (value->>'bagIndex')::integer = v_index
    limit 1;
    v_seal := null;
    select proof into v_seal
    from jsonb_array_elements(v_seal_proofs) proof
    where proof->>'kind' = 'seal'
      and coalesce(proof->>'bagIndex', '') ~ '^([1-9]|1[0-9]|20)$'
      and (proof->>'bagIndex')::integer = v_index
    order by proof->>'timestamp' desc
    limit 1;
    if p_event_type in ('custody_accepted', 'traveler_return', 'recipient_delivery', 'carrier_transfer') and (
      v_seal is null or v_submitted_seal is null or
      upper(btrim(v_seal->>'sealId')) <> upper(btrim(v_submitted_seal->>'sealId')) or
      v_seal->>'sealMethod' <> v_submitted_seal->>'sealMethod' or
      v_seal->>'sealStatus' <> v_submitted_seal->>'sealStatus'
    ) then
      raise exception using errcode = '22023',
        message = format('Submitted seal evidence does not match stored proof for bag %s.', v_index);
    end if;

    if p_event_type = 'custody_accepted' then
      v_event_photo_path := v_seal->>'storagePath';
      v_event_lat := (v_seal->'location'->>'latitude')::numeric;
      v_event_lng := (v_seal->'location'->>'longitude')::numeric;
    elsif v_event_proof is not null then
      v_event_photo_path := v_event_proof->>'storagePath';
      v_event_lat := (v_event_proof->'location'->>'latitude')::numeric;
      v_event_lng := (v_event_proof->'location'->>'longitude')::numeric;
    else
      v_event_photo_path := nullif(p_photo_path, '');
      v_event_lat := p_location_lat;
      v_event_lng := p_location_lng;
    end if;
    if (v_event_lat is not null and (v_event_lat < -90 or v_event_lat > 90)) or
       (v_event_lng is not null and (v_event_lng < -180 or v_event_lng > 180)) then
      raise exception using errcode = '22023', message = 'Stored proof GPS coordinates are invalid.';
    end if;

    v_effective_proof := case
      when p_event_type = 'custody_accepted' then v_seal
      else v_event_proof
    end;

    v_note := jsonb_strip_nulls(jsonb_build_object(
      'checkpointKey', p_checkpoint_key,
      'note', nullif(left(coalesce(v_effective_proof->>'note', p_note, ''), 2000), ''),
      'evidence', case when v_effective_proof is null then null else jsonb_build_object(
        'photoPath', v_event_photo_path,
        'proofTimestamp', v_effective_proof->>'timestamp',
        'gpsCapturedAt', v_effective_proof->'location'->>'capturedAt',
        'gpsAccuracyMeters', v_effective_proof->'location'->>'accuracyMeters',
        'handoff', v_effective_proof->'handoff'
      ) end,
      'seal', case when v_seal is null then null else jsonb_build_object(
        'sealSerial', upper(btrim(v_seal->>'sealId')),
        'sealMethod', v_seal->>'sealMethod',
        'sealStatus', v_seal->>'sealStatus',
        'sealPhotoPath', v_seal->>'storagePath',
        'sealProofCheckpointKey', v_seal->>'custodyCheckpointKey',
        'sealGpsCapturedAt', v_seal->'location'->>'capturedAt',
        'sealGpsAccuracyMeters', v_seal->'location'->>'accuracyMeters',
        'bagIndex', v_index,
        'bagBadge', v_bag.badge_code
      ) end
    ))::text;

    insert into public.custody_events (
      bag_id, booking_id, badge_code, seq, event_type, actor_role, actor_name,
      identity_verification_id, verified_method, photo_path, location_lat,
      location_lng, note, prev_hash, event_hash
    ) values (
      v_bag.id, p_booking_id, v_bag.badge_code, 0, p_event_type,
      v_actor_role, v_actor_name, v_identity_verification_id,
      v_verified_method, v_event_photo_path, v_event_lat,
      v_event_lng, v_note, '', ''
    ) returning * into v_event;

    v_status := case p_event_type
      when 'custody_accepted' then 'in_custody'
      when 'carrier_transfer' then 'handed_off'
      else 'delivered'
    end;
    update public.bags set status = v_status where id = v_bag.id;
    v_bag_ids := array_append(v_bag_ids, v_bag.id);
    v_event_ids := array_append(v_event_ids, v_event.id);
  end loop;

  if cardinality(v_event_ids) <> p_expected_bag_count then
    raise exception using errcode = 'P0001', message = 'Custody checkpoint did not create one event per bag.';
  end if;

  update public.bookings
  set
    status = v_next_booking_status,
    picked_up_at = case
      when p_event_type = 'custody_accepted' then coalesce(picked_up_at, v_checkpoint_created_at)
      else picked_up_at
    end,
    delivery_pending_at = case
      when p_event_type in ('traveler_return', 'recipient_delivery')
        then coalesce(delivery_pending_at, v_checkpoint_created_at)
      else delivery_pending_at
    end,
    delivered_at = case
      when p_event_type = 'carrier_transfer' then coalesce(delivered_at, v_checkpoint_created_at)
      else delivered_at
    end,
    customer_confirmed_at = case
      when p_event_type = 'recipient_confirmed' then coalesce(customer_confirmed_at, v_checkpoint_created_at)
      else customer_confirmed_at
    end,
    customer_signature_name = case
      when p_event_type = 'recipient_confirmed' then v_actor_name
      else customer_signature_name
    end,
    closed_at = case
      when p_event_type in ('recipient_confirmed', 'operations_close_override')
        then coalesce(closed_at, v_checkpoint_created_at)
      else closed_at
    end,
    status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
      'id', p_checkpoint_key,
      'action', 'status_change',
      'fromStatus', v_booking.status,
      'toStatus', v_next_booking_status,
      'actorRole', case v_actor_role
        when 'agent' then 'driver'
        when 'traveler' then 'customer'
        else 'admin'
      end,
      'actorName', v_actor_name,
      'reason', left(coalesce(
        nullif(btrim(p_note), ''),
        format('Atomic custody checkpoint: %s', p_event_type)
      ), 2000),
      'timestamp', v_checkpoint_created_at
    )),
    updated_at = v_checkpoint_created_at
  where id = p_booking_id and status = v_booking.status
  returning status into v_status;
  if not found or v_status <> v_next_booking_status then
    raise exception using errcode = '40001',
      message = 'Booking status changed before the custody transaction could complete.';
  end if;

  insert into public.custody_checkpoints (
    booking_id, checkpoint_key, expected_bag_count, event_type, actor_role,
    actor_name, verified_method, driver_access_id, request_fingerprint,
    booking_status_before, booking_status_after, bag_ids, event_ids
  ) values (
    p_booking_id, p_checkpoint_key, p_expected_bag_count, p_event_type,
    v_actor_role, v_actor_name, v_verified_method, p_driver_access_id,
    v_fingerprint, v_booking.status, v_next_booking_status, v_bag_ids, v_event_ids
  );

  select coalesce(jsonb_agg(to_jsonb(e) order by e.badge_code), '[]'::jsonb)
    into v_events from public.custody_events e where e.id = any(v_event_ids);
  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'events', v_events,
    'bookingStatus', v_next_booking_status
  );
end;
$$;

revoke all on function public.issue_custody_bags(text, integer, text[], text, text)
  from public, anon, authenticated;
grant execute on function public.issue_custody_bags(text, integer, text[], text, text)
  to service_role;

revoke all on function public.record_custody_checkpoint(
  text, text, integer, text, text, text, text, uuid, uuid, text, numeric, numeric, text, jsonb
) from public, anon, authenticated;
grant execute on function public.record_custody_checkpoint(
  text, text, integer, text, text, text, text, uuid, uuid, text, numeric, numeric, text, jsonb
) to service_role;

-- The application service role may read custody evidence and execute the
-- validated SECURITY DEFINER RPCs, but it cannot forge or partially mutate the
-- ledger tables with ordinary PostgREST writes.
revoke insert, update, delete, truncate on table
  public.bags, public.custody_events, public.custody_checkpoints
  from service_role;
grant select on table
  public.bags, public.custody_events, public.custody_checkpoints
  to service_role;
