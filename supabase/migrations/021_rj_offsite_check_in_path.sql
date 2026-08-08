-- Dormant, server-only job ledger for an authorized RJ off-site check-in
-- integration. It does not activate an airline integration by itself.
create table if not exists public.partner_check_in_jobs (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.partner_integrations(id),
  booking_id text not null references public.bookings(id) on delete cascade,
  idempotency_key text not null,
  request_fingerprint text not null,
  identity_verification_id uuid references public.identity_verifications(id),
  passenger_consent_at timestamptz,
  mode text not null check (mode in ('sandbox','production')),
  state text not null check (state in ('requested','reservation_verified','eligible','checked_in','tags_issued_inactive','handoff_ready','tags_activated','manual_review','failed','cancelled')),
  flight_number text not null,
  departure_airport text not null,
  travel_date text not null,
  bag_count integer not null check (bag_count > 0),
  external_check_in_reference text,
  boarding_pass_reference text,
  bag_tag_references jsonb not null default '[]'::jsonb,
  tag_activation_state text not null default 'not_issued' check (tag_activation_state in ('not_issued','inactive_until_airline_acceptance','active','voided')),
  requested_by text not null,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, idempotency_key)
);
create index if not exists partner_check_in_jobs_booking_idx on public.partner_check_in_jobs (booking_id, created_at desc);
create index if not exists partner_check_in_jobs_state_idx on public.partner_check_in_jobs (provider_id, state, created_at desc);
drop trigger if exists partner_check_in_jobs_set_updated_at on public.partner_check_in_jobs;
create trigger partner_check_in_jobs_set_updated_at before update on public.partner_check_in_jobs for each row execute function public.set_updated_at();
alter table public.partner_check_in_jobs enable row level security;
revoke all on public.partner_check_in_jobs from anon, authenticated;
