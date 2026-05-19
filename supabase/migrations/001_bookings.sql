create extension if not exists pgcrypto;

create table if not exists public.bookings (
  id text primary key,
  service text not null check (service in ('departure', 'arrival', 'both')),
  airport text not null,
  address text not null,
  travel_date text not null,
  flight text,
  bags integer not null check (bags > 0),
  customer_name text not null,
  email text not null,
  phone text not null,
  notes text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'assigned', 'picked_up', 'in_transit', 'delivered')),
  price_cents integer not null check (price_cents >= 0),
  paid_at timestamptz,
  assigned_at timestamptz,
  driver_name text,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  proofs jsonb not null default '[]'::jsonb,
  customer_access_token text not null default encode(gen_random_bytes(24), 'hex'),
  customer_user_id uuid,
  driver_user_id uuid,
  source text not null default 'quote-form',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists bookings_customer_access_token_idx on public.bookings (customer_access_token);
create index if not exists bookings_customer_user_id_idx on public.bookings (customer_user_id);
create index if not exists bookings_driver_user_id_idx on public.bookings (driver_user_id);
create index if not exists bookings_created_at_idx on public.bookings (created_at desc);
create index if not exists bookings_status_idx on public.bookings (status);
create index if not exists bookings_driver_name_idx on public.bookings (driver_name);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists bookings_set_updated_at on public.bookings;
create trigger bookings_set_updated_at
before update on public.bookings
for each row
execute function public.set_updated_at();
