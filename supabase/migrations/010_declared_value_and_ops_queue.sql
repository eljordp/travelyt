alter table public.bookings
  add column if not exists declared_value_cents integer
    check (declared_value_cents is null or declared_value_cents >= 0),
  add column if not exists coverage_election text
    check (coverage_election in ('standard', 'declared_value')),
  add column if not exists coverage_accepted_at timestamptz;

create index if not exists bookings_coverage_election_idx
  on public.bookings (coverage_election);
