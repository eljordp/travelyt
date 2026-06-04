alter table public.bookings
  add column if not exists en_route_at timestamptz,
  add column if not exists arrived_at timestamptz,
  add column if not exists delivery_pending_at timestamptz,
  add column if not exists closed_at timestamptz,
  add column if not exists delivery_confirmation_code text,
  add column if not exists customer_confirmed_at timestamptz,
  add column if not exists customer_signature_name text;

update public.bookings
set delivery_confirmation_code =
  coalesce(delivery_confirmation_code, lpad((floor(random() * 900000 + 100000))::int::text, 6, '0'));

alter table public.bookings
  alter column delivery_confirmation_code set default lpad((floor(random() * 900000 + 100000))::int::text, 6, '0');

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
      'en_route',
      'arrived',
      'picked_up',
      'in_transit',
      'delivery_pending',
      'delivered',
      'closed',
      'cancelled',
      'issue'
    )
  );
