create extension if not exists pgcrypto;

alter table public.bookings
  add column if not exists customer_access_token text not null default encode(gen_random_bytes(24), 'hex'),
  add column if not exists customer_user_id uuid,
  add column if not exists driver_user_id uuid;

create unique index if not exists bookings_customer_access_token_idx
  on public.bookings (customer_access_token);

create index if not exists bookings_customer_user_id_idx
  on public.bookings (customer_user_id);

create index if not exists bookings_driver_user_id_idx
  on public.bookings (driver_user_id);
