alter table public.bookings
  add column if not exists accepted_at timestamptz,
  add column if not exists status_history jsonb not null default '[]'::jsonb;

alter table public.bookings
  drop constraint if exists bookings_status_check;

alter table public.bookings
  add constraint bookings_status_check
  check (
    status in (
      'pending',
      'paid',
      'assigned',
      'accepted',
      'picked_up',
      'in_transit',
      'delivered',
      'cancelled',
      'issue'
    )
  );
