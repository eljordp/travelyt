-- Checkpoint 1: dispatcher assignment through verified agent acceptance.
-- These records are private operational evidence. They do not represent
-- airline, airport, TSA, insurance, or legal approval.

create table if not exists public.agent_readiness_profiles (
  driver_access_id uuid primary key references public.driver_access_codes(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'suspended')),
  identity_evidence_reference text,
  identity_verified_at timestamptz,
  identity_expires_at timestamptz,
  training_evidence_reference text,
  training_completed_at timestamptz,
  training_expires_at timestamptz,
  insurance_evidence_reference text,
  insurance_verified_at timestamptz,
  insurance_expires_at timestamptz,
  vehicle_make_model text,
  license_plate text,
  vehicle_evidence_reference text,
  vehicle_verified_at timestamptz,
  vehicle_expires_at timestamptz,
  notes text,
  updated_by text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.booking_agent_assignments (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  primary_driver_access_id uuid not null references public.driver_access_codes(id) on delete restrict,
  backup_driver_access_id uuid not null references public.driver_access_codes(id) on delete restrict,
  status text not null default 'assigned'
    check (status in ('assigned', 'accepted', 'declined', 'expired', 'superseded', 'revoked')),
  assigned_by text not null,
  assigned_at timestamptz not null default now(),
  acceptance_due_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by_driver_access_id uuid references public.driver_access_codes(id) on delete restrict,
  acceptance_checklist jsonb not null default '{}'::jsonb,
  accepted_ip_hash text,
  accepted_user_agent_hash text,
  decline_reason text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_agent_assignments_distinct_agents
    check (primary_driver_access_id <> backup_driver_access_id),
  constraint booking_agent_assignments_acceptance_shape check (
    (status <> 'accepted') or (
      accepted_at is not null and
      accepted_by_driver_access_id = primary_driver_access_id and
      coalesce((acceptance_checklist->>'availabilityConfirmed')::boolean, false) and
      coalesce((acceptance_checklist->>'deviceReady')::boolean, false) and
      coalesce((acceptance_checklist->>'sealKitReady')::boolean, false) and
      coalesce((acceptance_checklist->>'vehicleReady')::boolean, false)
    )
  )
);

create unique index if not exists booking_agent_assignments_one_active_idx
  on public.booking_agent_assignments (booking_id)
  where status in ('assigned', 'accepted');

create index if not exists booking_agent_assignments_primary_idx
  on public.booking_agent_assignments (primary_driver_access_id, status, assigned_at desc);

create index if not exists booking_agent_assignments_backup_idx
  on public.booking_agent_assignments (backup_driver_access_id, status, assigned_at desc);

create index if not exists agent_readiness_profiles_status_idx
  on public.agent_readiness_profiles (status, updated_at desc);

alter table public.agent_readiness_profiles enable row level security;
alter table public.booking_agent_assignments enable row level security;
revoke all on public.agent_readiness_profiles from anon, authenticated;
revoke all on public.booking_agent_assignments from anon, authenticated;
