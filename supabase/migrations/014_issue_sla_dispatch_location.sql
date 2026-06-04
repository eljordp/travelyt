alter table public.bookings
  add column if not exists issue_type text,
  add column if not exists issue_notes text,
  add column if not exists issue_opened_at timestamptz,
  add column if not exists issue_resolved_at timestamptz,
  add column if not exists issue_resolution text,
  add column if not exists location_events jsonb not null default '[]'::jsonb;

alter table public.bookings
  drop constraint if exists bookings_issue_type_check;

alter table public.bookings
  add constraint bookings_issue_type_check
  check (
    issue_type is null or issue_type in (
      'airport_hold',
      'customer_no_show',
      'missing_id',
      'wrong_bag',
      'driver_delay',
      'vehicle_issue',
      'lost_or_damaged_bag',
      'customer_unreachable',
      'airline_delay',
      'other'
    )
  );

create index if not exists bookings_issue_type_idx
  on public.bookings (issue_type);

create index if not exists bookings_issue_opened_at_idx
  on public.bookings (issue_opened_at);
