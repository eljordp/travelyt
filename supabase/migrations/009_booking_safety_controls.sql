alter table public.bookings
  add column if not exists flight_time text,
  add column if not exists restricted_items_attested_at timestamptz,
  add column if not exists customer_identity_verified_at timestamptz,
  add column if not exists driver_identity_verified_at timestamptz;

create index if not exists bookings_flight_time_idx
  on public.bookings (travel_date, flight_time);

create table if not exists public.ops_exceptions (
  id uuid primary key default gen_random_uuid(),
  booking_id text references public.bookings(id) on delete cascade,
  severity text not null default 'warning'
    check (severity in ('info', 'warning', 'critical')),
  code text not null,
  status text not null default 'open'
    check (status in ('open', 'acknowledged', 'resolved')),
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists ops_exceptions_booking_id_idx
  on public.ops_exceptions (booking_id, created_at desc);

create index if not exists ops_exceptions_status_created_at_idx
  on public.ops_exceptions (status, created_at desc);

alter table public.ops_exceptions enable row level security;
revoke all on public.ops_exceptions from anon, authenticated;
