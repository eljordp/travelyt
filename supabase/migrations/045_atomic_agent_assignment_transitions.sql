-- Make dispatch assignment and driver response one database-owned state machine.
-- The service-role RPC locks booking -> assignment -> driver -> readiness rows
-- in a stable order so concurrent dispatch and stale driver pages fail closed.

create or replace function public.transition_agent_assignment(
  p_action text,
  p_booking_id text,
  p_expected_assignment_id uuid default null,
  p_primary_driver_access_id uuid default null,
  p_backup_driver_access_id uuid default null,
  p_driver_access_id uuid default null,
  p_acceptance_minutes integer default 10,
  p_acceptance_checklist jsonb default '{}'::jsonb,
  p_reason text default null,
  p_actor_role text default 'system',
  p_actor_name text default null,
  p_ip_hash text default null,
  p_user_agent_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_now timestamptz := clock_timestamp();
  v_booking public.bookings%rowtype;
  v_assignment public.booking_agent_assignments%rowtype;
  v_current public.booking_agent_assignments%rowtype;
  v_primary public.driver_access_codes%rowtype;
  v_backup public.driver_access_codes%rowtype;
  v_primary_readiness public.agent_readiness_profiles%rowtype;
  v_backup_readiness public.agent_readiness_profiles%rowtype;
  v_primary_identity public.identity_verifications%rowtype;
  v_backup_identity public.identity_verifications%rowtype;
  v_primary_identity_id uuid;
  v_backup_identity_id uuid;
  v_lock_id uuid;
  v_primary_id uuid;
  v_backup_id uuid;
  v_reassignment boolean := false;
  v_reason text := nullif(left(btrim(coalesce(p_reason, '')), 500), '');
  v_actor_name text := nullif(left(btrim(coalesce(p_actor_name, '')), 320), '');
  v_outcome text;
begin
  if v_action not in ('assign', 'accept', 'decline', 'expire') then
    raise exception using errcode = '22023',
      message = 'Assignment action must be assign, accept, decline, or expire.';
  end if;
  if nullif(btrim(coalesce(p_booking_id, '')), '') is null then
    raise exception using errcode = '22023', message = 'Booking ID is required.';
  end if;
  if p_acceptance_checklist is null or jsonb_typeof(p_acceptance_checklist) <> 'object' then
    raise exception using errcode = '22023', message = 'Acceptance checklist must be a JSON object.';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'IP evidence hash is invalid.';
  end if;
  if p_user_agent_hash is not null and p_user_agent_hash !~ '^[0-9a-f]{64}$' then
    raise exception using errcode = '22023', message = 'User-agent evidence hash is invalid.';
  end if;

  -- Every path locks the booking first. Reassignment and driver response can
  -- therefore never advance different assignment generations concurrently.
  select * into v_booking
  from public.bookings
  where id = p_booking_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Booking not found.';
  end if;

  if v_action = 'assign' then
    if p_actor_role not in ('admin', 'dispatcher') or v_actor_name is null then
      raise exception using errcode = '42501',
        message = 'An authenticated operations actor is required for assignment.';
    end if;
    if p_primary_driver_access_id is null or p_backup_driver_access_id is null then
      raise exception using errcode = '22023',
        message = 'Primary and backup driver access IDs are required.';
    end if;
    if p_primary_driver_access_id = p_backup_driver_access_id then
      raise exception using errcode = '22023',
        message = 'Primary and backup must be different verified people.';
    end if;
    if p_acceptance_minutes is null or p_acceptance_minutes not between 5 and 60 then
      raise exception using errcode = '22023',
        message = 'Acceptance window must be between 5 and 60 minutes.';
    end if;

    select * into v_current
    from public.booking_agent_assignments
    where booking_id = p_booking_id and status in ('assigned', 'accepted')
    order by assigned_at desc
    limit 1
    for update;

    if found then
      if p_expected_assignment_id is not null and p_expected_assignment_id <> v_current.id then
        raise exception using errcode = '40001',
          message = 'The assignment changed before dispatch submitted this request.';
      end if;
      if v_current.status = 'accepted' then
        raise exception using errcode = '40001',
          message = 'An accepted assignment cannot be replaced from this checkpoint.';
      end if;
      if v_booking.status <> 'assigned' then
        raise exception using errcode = '40001',
          message = 'The booking and active assignment are out of sync.';
      end if;
      if v_reason is null then
        raise exception using errcode = '22023',
          message = 'Record a reason before replacing an awaiting assignment.';
      end if;
      v_reassignment := true;
    else
      if p_expected_assignment_id is not null then
        raise exception using errcode = '40001',
          message = 'The expected assignment is no longer active.';
      end if;
      if v_booking.status <> 'paid' then
        raise exception using errcode = '40001',
          message = 'Booking must be paid and confirmed before assignment.';
      end if;
    end if;

    v_primary_id := p_primary_driver_access_id;
    v_backup_id := p_backup_driver_access_id;
  else
    if p_expected_assignment_id is null then
      raise exception using errcode = '22023',
        message = 'The exact assignment ID is required for a driver response.';
    end if;

    select * into v_assignment
    from public.booking_agent_assignments
    where id = p_expected_assignment_id and booking_id = p_booking_id
    for update;
    if not found then
      raise exception using errcode = '40001',
        message = 'This assignment is stale or belongs to another booking.';
    end if;

    v_primary_id := v_assignment.primary_driver_access_id;
    v_backup_id := v_assignment.backup_driver_access_id;
  end if;

  -- Acquire both driver records in UUID order. Concurrent assignments on two
  -- different bookings serialize on the shared driver before schedule checks.
  for v_lock_id in
    select access.id
    from public.driver_access_codes access
    where access.id in (v_primary_id, v_backup_id)
    order by access.id
  loop
    perform 1 from public.driver_access_codes
    where id = v_lock_id
    for update;
  end loop;

  -- Readiness is locked in the same deterministic order. An operations review
  -- cannot suspend or replace evidence midway through assignment acceptance.
  for v_lock_id in
    select readiness.driver_access_id
    from public.agent_readiness_profiles readiness
    where readiness.driver_access_id in (v_primary_id, v_backup_id)
    order by readiness.driver_access_id
  loop
    perform 1 from public.agent_readiness_profiles
    where driver_access_id = v_lock_id
    for update;
  end loop;

  select * into v_primary from public.driver_access_codes where id = v_primary_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Primary driver access record was not found.';
  end if;
  select * into v_backup from public.driver_access_codes where id = v_backup_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'Backup driver access record was not found.';
  end if;
  select * into v_primary_readiness
  from public.agent_readiness_profiles where driver_access_id = v_primary_id;
  if not found then
    raise exception using errcode = '42501', message = 'Primary driver readiness evidence is missing.';
  end if;
  select * into v_backup_readiness
  from public.agent_readiness_profiles where driver_access_id = v_backup_id;
  if not found then
    raise exception using errcode = '42501', message = 'Backup driver readiness evidence is missing.';
  end if;

  if v_primary.person_key_hash = v_backup.person_key_hash or
     v_primary.canonical_driver_name = v_backup.canonical_driver_name or
     (
       nullif(lower(btrim(v_primary.driver_email)), '') is not null and
       lower(btrim(v_primary.driver_email)) = lower(btrim(v_backup.driver_email))
     ) or
     (
       nullif(regexp_replace(coalesce(v_primary.driver_phone, ''), '[^0-9+]', '', 'g'), '') is not null and
       regexp_replace(v_primary.driver_phone, '[^0-9+]', '', 'g') =
         regexp_replace(v_backup.driver_phone, '[^0-9+]', '', 'g')
     ) then
    raise exception using errcode = '42501',
      message = 'Primary and backup must be different verified people.';
  end if;

  if v_action in ('accept', 'decline') then
    if p_actor_role <> 'driver' or p_driver_access_id is null or
       p_driver_access_id <> v_primary_id then
      raise exception using errcode = '42501',
        message = 'Only the assigned primary driver can respond.';
    end if;
    v_actor_name := v_primary.driver_name;
  elsif v_action = 'expire' then
    if p_actor_role not in ('admin', 'dispatcher', 'system') then
      raise exception using errcode = '42501',
        message = 'Only operations or the system can expire an assignment.';
    end if;
    v_actor_name := coalesce(v_actor_name, 'Travelyt system');
  end if;

  if v_action = 'accept' and v_assignment.status = 'accepted' then
    if v_booking.status not in ('accepted', 'en_route', 'arrived', 'picked_up', 'in_transit', 'delivery_pending', 'delivered', 'closed', 'issue') then
      raise exception using errcode = '40001',
        message = 'The accepted assignment and booking are out of sync.';
    end if;
    return jsonb_build_object(
      'ok', true,
      'outcome', 'accepted',
      'idempotent', true,
      'assignment', to_jsonb(v_assignment),
      'booking', to_jsonb(v_booking),
      'primaryDriverName', v_primary.driver_name,
      'backupDriverName', v_backup.driver_name
    );
  end if;

  if v_action <> 'assign' and v_assignment.status <> 'assigned' then
    raise exception using errcode = '40001',
      message = 'This assignment is no longer awaiting a response.';
  end if;
  if v_action <> 'assign' and v_booking.status <> 'assigned' then
    raise exception using errcode = '40001',
      message = 'The booking is no longer awaiting driver acceptance.';
  end if;

  -- Expiry is allowed to close an already-stale assignment even if readiness
  -- expired after dispatch. Current readiness is required only for a new
  -- assignment or an on-time acceptance.
  if v_action = 'assign' or
     (v_action = 'accept' and v_assignment.acceptance_due_at > v_now) then
    if v_primary.status <> 'active' or
       (v_primary.expires_at is not null and v_primary.expires_at <= v_now) then
      raise exception using errcode = '42501', message = 'Primary driver access is not active.';
    end if;
    if v_backup.status <> 'active' or
       (v_backup.expires_at is not null and v_backup.expires_at <= v_now) then
      raise exception using errcode = '42501', message = 'Backup driver access is not active.';
    end if;

    if v_primary_readiness.status <> 'active' or
       nullif(btrim(v_primary_readiness.identity_evidence_reference), '') is null or
       v_primary_readiness.identity_evidence_reference !~ '^stripe_identity:[0-9a-fA-F-]{36}$' or
       v_primary_readiness.identity_verified_at is null or
       v_primary_readiness.identity_verified_at > v_now or
       (v_primary_readiness.identity_expires_at is not null and v_primary_readiness.identity_expires_at <= v_now) or
       nullif(btrim(v_primary_readiness.training_evidence_reference), '') is null or
       v_primary_readiness.training_completed_at is null or
       v_primary_readiness.training_completed_at > v_now or
       v_primary_readiness.training_expires_at is null or
       v_primary_readiness.training_expires_at <= v_now or
       nullif(btrim(v_primary_readiness.insurance_evidence_reference), '') is null or
       v_primary_readiness.insurance_verified_at is null or
       v_primary_readiness.insurance_verified_at > v_now or
       v_primary_readiness.insurance_expires_at is null or
       v_primary_readiness.insurance_expires_at <= v_now or
       nullif(btrim(v_primary_readiness.vehicle_make_model), '') is null or
       nullif(btrim(v_primary_readiness.license_plate), '') is null or
       nullif(btrim(v_primary_readiness.vehicle_evidence_reference), '') is null or
       v_primary_readiness.vehicle_verified_at is null or
       v_primary_readiness.vehicle_verified_at > v_now or
       v_primary_readiness.vehicle_expires_at is null or
       v_primary_readiness.vehicle_expires_at <= v_now then
      raise exception using errcode = '42501',
        message = 'Primary driver identity, training, insurance, and vehicle readiness must be current.';
    end if;
    if v_backup_readiness.status <> 'active' or
       nullif(btrim(v_backup_readiness.identity_evidence_reference), '') is null or
       v_backup_readiness.identity_evidence_reference !~ '^stripe_identity:[0-9a-fA-F-]{36}$' or
       v_backup_readiness.identity_verified_at is null or
       v_backup_readiness.identity_verified_at > v_now or
       (v_backup_readiness.identity_expires_at is not null and v_backup_readiness.identity_expires_at <= v_now) or
       nullif(btrim(v_backup_readiness.training_evidence_reference), '') is null or
       v_backup_readiness.training_completed_at is null or
       v_backup_readiness.training_completed_at > v_now or
       v_backup_readiness.training_expires_at is null or
       v_backup_readiness.training_expires_at <= v_now or
       nullif(btrim(v_backup_readiness.insurance_evidence_reference), '') is null or
       v_backup_readiness.insurance_verified_at is null or
       v_backup_readiness.insurance_verified_at > v_now or
       v_backup_readiness.insurance_expires_at is null or
       v_backup_readiness.insurance_expires_at <= v_now or
       nullif(btrim(v_backup_readiness.vehicle_make_model), '') is null or
       nullif(btrim(v_backup_readiness.license_plate), '') is null or
       nullif(btrim(v_backup_readiness.vehicle_evidence_reference), '') is null or
       v_backup_readiness.vehicle_verified_at is null or
       v_backup_readiness.vehicle_verified_at > v_now or
       v_backup_readiness.vehicle_expires_at is null or
       v_backup_readiness.vehicle_expires_at <= v_now then
      raise exception using errcode = '42501',
        message = 'Backup driver identity, training, insurance, and vehicle readiness must be current.';
    end if;

    begin
      v_primary_identity_id := split_part(v_primary_readiness.identity_evidence_reference, ':', 2)::uuid;
      v_backup_identity_id := split_part(v_backup_readiness.identity_evidence_reference, ':', 2)::uuid;
    exception when invalid_text_representation then
      raise exception using errcode = '42501', message = 'Driver identity evidence reference is invalid.';
    end;

    -- Identity rows are also held while their readiness snapshots are used.
    for v_lock_id in
      select identity.id
      from public.identity_verifications identity
      where identity.id in (v_primary_identity_id, v_backup_identity_id)
      order by identity.id
    loop
      perform 1 from public.identity_verifications where id = v_lock_id for share;
    end loop;

    select * into v_primary_identity
    from public.identity_verifications
    where id = v_primary_identity_id
      and status = 'verified'
      and provider = 'stripe_identity'
      and role in ('driver', 'employee')
      and verified_at is not null and verified_at <= v_now
      and (expires_at is null or expires_at > v_now)
      and lower(btrim(email)) = lower(btrim(v_primary.driver_email))
      and metadata->>'driver_access_id' = v_primary.id::text;
    if not found or jsonb_typeof(v_primary_identity.raw_document_paths) <> 'array' or
       not exists (
         select 1 from jsonb_array_elements(v_primary_identity.raw_document_paths) item
         where item->>'kind' = 'document'
       ) or not exists (
         select 1 from jsonb_array_elements(v_primary_identity.raw_document_paths) item
         where item->>'kind' = 'selfie'
       ) then
      raise exception using errcode = '42501',
        message = 'Primary readiness is not bound to current document and selfie identity evidence.';
    end if;

    select * into v_backup_identity
    from public.identity_verifications
    where id = v_backup_identity_id
      and status = 'verified'
      and provider = 'stripe_identity'
      and role in ('driver', 'employee')
      and verified_at is not null and verified_at <= v_now
      and (expires_at is null or expires_at > v_now)
      and lower(btrim(email)) = lower(btrim(v_backup.driver_email))
      and metadata->>'driver_access_id' = v_backup.id::text;
    if not found or jsonb_typeof(v_backup_identity.raw_document_paths) <> 'array' or
       not exists (
         select 1 from jsonb_array_elements(v_backup_identity.raw_document_paths) item
         where item->>'kind' = 'document'
       ) or not exists (
         select 1 from jsonb_array_elements(v_backup_identity.raw_document_paths) item
         where item->>'kind' = 'selfie'
       ) then
      raise exception using errcode = '42501',
        message = 'Backup readiness is not bound to current document and selfie identity evidence.';
    end if;
  end if;

  if v_action = 'assign' then
    if v_booking.paid_at is null then
      raise exception using errcode = '42501', message = 'Payment confirmation timestamp is missing.';
    end if;
    if v_booking.pilot_eligibility_status <> 'approved' or
       v_booking.pilot_eligibility_expires_at is null or
       v_booking.paid_at > v_booking.pilot_eligibility_expires_at then
      raise exception using errcode = '42501',
        message = 'Pilot approval was not used for payment before its deadline.';
    end if;
    if v_booking.restricted_items_attested_at is null then
      raise exception using errcode = '42501',
        message = 'Customer prohibited-item declaration is incomplete.';
    end if;
    if v_booking.travel_date !~ '^\d{4}-\d{2}-\d{2}$' then
      raise exception using errcode = '22023', message = 'Travel date is invalid.';
    end if;
    begin
      if v_booking.travel_date::date < current_date then
        raise exception using errcode = '22023', message = 'Travel date cannot be in the past.';
      end if;
    exception
      when invalid_datetime_format or datetime_field_overflow then
        raise exception using errcode = '22023', message = 'Travel date is invalid.';
    end;
    if jsonb_typeof(v_booking.passenger_manifest) <> 'array' or
       (
         jsonb_array_length(v_booking.passenger_manifest) = 0 and
         v_booking.customer_identity_verified_at is null
       ) or exists (
         select 1 from jsonb_array_elements(v_booking.passenger_manifest) passenger
         where
           coalesce(passenger->>'verificationMethod', '') not in (
             'primary_account', 'self_service', 'guardian', 'household_spouse'
           ) or
           (passenger->>'verificationMethod' = 'primary_account' and
             v_booking.customer_identity_verified_at is null) or
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

    -- The driver locks above make this conflict query safe against another
    -- transaction using this RPC, even though the other booking row is not
    -- locked (locking it here would invert lock order and permit deadlocks).
    if exists (
      select 1
      from public.booking_agent_assignments assignment
      join public.bookings conflict_booking on conflict_booking.id = assignment.booking_id
      where assignment.booking_id <> p_booking_id
        and assignment.status in ('assigned', 'accepted')
        and conflict_booking.travel_date = v_booking.travel_date
        and (
          assignment.primary_driver_access_id in (v_primary_id, v_backup_id) or
          assignment.backup_driver_access_id in (v_primary_id, v_backup_id)
        )
    ) then
      raise exception using errcode = '23505',
        message = 'A selected driver already has an active primary or backup assignment on this travel date.';
    end if;

    if v_reassignment then
      update public.booking_agent_assignments
      set status = 'superseded',
          decline_reason = v_reason,
          closed_at = v_now,
          updated_at = v_now
      where id = v_current.id and status = 'assigned';
      if not found then
        raise exception using errcode = '40001',
          message = 'The previous assignment changed before it could be superseded.';
      end if;
    end if;

    insert into public.booking_agent_assignments (
      booking_id,
      primary_driver_access_id,
      backup_driver_access_id,
      status,
      assigned_by,
      assigned_at,
      acceptance_due_at,
      updated_at
    ) values (
      p_booking_id,
      v_primary_id,
      v_backup_id,
      'assigned',
      v_actor_name,
      v_now,
      v_now + p_acceptance_minutes * interval '1 minute',
      v_now
    )
    returning * into v_assignment;

    update public.bookings
    set status = 'assigned',
        driver_name = v_primary.driver_name,
        assigned_at = v_now,
        accepted_at = null,
        driver_identity_verified_at = v_primary_readiness.identity_verified_at,
        status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'action', 'status_change',
          'fromStatus', v_booking.status,
          'toStatus', 'assigned',
          'actorRole', p_actor_role,
          'actorName', v_actor_name,
          'reason', coalesce(v_reason, format(
            'Assigned primary driver %s with a verified backup.', v_primary.driver_name
          )),
          'timestamp', v_now
        )),
        updated_at = v_now
    where id = p_booking_id and status = v_booking.status
    returning * into v_booking;
    if not found then
      raise exception using errcode = '40001',
        message = 'Booking status changed before assignment could complete.';
    end if;
    v_outcome := case when v_reassignment then 'reassigned' else 'assigned' end;

  elsif v_action = 'decline' then
    if v_reason is null then
      raise exception using errcode = '22023', message = 'Record a reason before declining the assignment.';
    end if;
    if v_primary.status <> 'active' or
       (v_primary.expires_at is not null and v_primary.expires_at <= v_now) then
      raise exception using errcode = '42501', message = 'Primary driver access is no longer active.';
    end if;
    update public.booking_agent_assignments
    set status = 'declined',
        decline_reason = v_reason,
        closed_at = v_now,
        updated_at = v_now
    where id = v_assignment.id and status = 'assigned'
    returning * into v_assignment;
    if not found then
      raise exception using errcode = '40001', message = 'Assignment changed before decline could complete.';
    end if;
    update public.bookings
    set status = 'paid',
        driver_name = null,
        assigned_at = null,
        accepted_at = null,
        driver_identity_verified_at = null,
        status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'action', 'status_change',
          'fromStatus', v_booking.status,
          'toStatus', 'paid',
          'actorRole', 'driver',
          'actorName', v_actor_name,
          'reason', 'Primary driver declined assignment: ' || v_reason,
          'timestamp', v_now
        )),
        updated_at = v_now
    where id = p_booking_id and status = 'assigned'
    returning * into v_booking;
    if not found then
      raise exception using errcode = '40001', message = 'Booking changed before decline could complete.';
    end if;
    v_outcome := 'declined';

  elsif v_action = 'accept' and v_assignment.acceptance_due_at <= v_now then
    update public.booking_agent_assignments
    set status = 'expired', closed_at = v_now, updated_at = v_now
    where id = v_assignment.id and status = 'assigned'
    returning * into v_assignment;
    if not found then
      raise exception using errcode = '40001', message = 'Assignment changed before expiry could complete.';
    end if;
    update public.bookings
    set status = 'paid',
        driver_name = null,
        assigned_at = null,
        accepted_at = null,
        driver_identity_verified_at = null,
        status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'action', 'status_change',
          'fromStatus', v_booking.status,
          'toStatus', 'paid',
          'actorRole', 'system',
          'actorName', 'Travelyt system',
          'reason', 'Primary-driver acceptance deadline expired; returned to dispatch queue.',
          'timestamp', v_now
        )),
        updated_at = v_now
    where id = p_booking_id and status = 'assigned'
    returning * into v_booking;
    if not found then
      raise exception using errcode = '40001', message = 'Booking changed before expiry could complete.';
    end if;
    v_outcome := 'expired';

  elsif v_action = 'expire' then
    if v_assignment.acceptance_due_at > v_now then
      raise exception using errcode = '22023', message = 'Assignment acceptance window is still open.';
    end if;
    update public.booking_agent_assignments
    set status = 'expired', closed_at = v_now, updated_at = v_now
    where id = v_assignment.id and status = 'assigned'
    returning * into v_assignment;
    if not found then
      raise exception using errcode = '40001', message = 'Assignment changed before expiry could complete.';
    end if;
    update public.bookings
    set status = 'paid',
        driver_name = null,
        assigned_at = null,
        accepted_at = null,
        driver_identity_verified_at = null,
        status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'action', 'status_change',
          'fromStatus', v_booking.status,
          'toStatus', 'paid',
          'actorRole', case when p_actor_role = 'system' then 'system' else 'admin' end,
          'actorName', v_actor_name,
          'reason', coalesce(v_reason, 'Acceptance deadline expired; returned to dispatch queue.'),
          'timestamp', v_now
        )),
        updated_at = v_now
    where id = p_booking_id and status = 'assigned'
    returning * into v_booking;
    if not found then
      raise exception using errcode = '40001', message = 'Booking changed before expiry could complete.';
    end if;
    v_outcome := 'expired';

  else
    if p_acceptance_checklist->>'availabilityConfirmed' is distinct from 'true' or
       p_acceptance_checklist->>'deviceReady' is distinct from 'true' or
       p_acceptance_checklist->>'sealKitReady' is distinct from 'true' or
       p_acceptance_checklist->>'vehicleReady' is distinct from 'true' then
      raise exception using errcode = '22023',
        message = 'Complete every acceptance confirmation.';
    end if;
    update public.booking_agent_assignments
    set status = 'accepted',
        accepted_at = v_now,
        accepted_by_driver_access_id = v_primary.id,
        acceptance_checklist = p_acceptance_checklist,
        accepted_ip_hash = p_ip_hash,
        accepted_user_agent_hash = p_user_agent_hash,
        updated_at = v_now
    where id = v_assignment.id and status = 'assigned'
    returning * into v_assignment;
    if not found then
      raise exception using errcode = '40001', message = 'Assignment changed before acceptance could complete.';
    end if;
    update public.bookings
    set status = 'accepted',
        accepted_at = v_now,
        driver_name = v_primary.driver_name,
        driver_identity_verified_at = v_primary_readiness.identity_verified_at,
        status_history = coalesce(status_history, '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
          'id', gen_random_uuid(),
          'action', 'status_change',
          'fromStatus', v_booking.status,
          'toStatus', 'accepted',
          'actorRole', 'driver',
          'actorName', v_actor_name,
          'reason', 'Primary driver accepted and confirmed availability, device, seal kit, and approved vehicle.',
          'timestamp', v_now
        )),
        updated_at = v_now
    where id = p_booking_id and status = 'assigned'
    returning * into v_booking;
    if not found then
      raise exception using errcode = '40001', message = 'Booking changed before acceptance could complete.';
    end if;
    v_outcome := 'accepted';
  end if;

  return jsonb_build_object(
    'ok', true,
    'outcome', v_outcome,
    'idempotent', false,
    'assignment', to_jsonb(v_assignment),
    'booking', to_jsonb(v_booking),
    'primaryDriverName', v_primary.driver_name,
    'backupDriverName', v_backup.driver_name
  );
end;
$$;

revoke all on function public.transition_agent_assignment(
  text, text, uuid, uuid, uuid, uuid, integer, jsonb, text, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.transition_agent_assignment(
  text, text, uuid, uuid, uuid, uuid, integer, jsonb, text, text, text, text, text
) to service_role;

comment on function public.transition_agent_assignment(
  text, text, uuid, uuid, uuid, uuid, integer, jsonb, text, text, text, text, text
) is 'Atomically assigns, reassigns, accepts, declines, or expires one driver assignment with deterministic row locks.';
