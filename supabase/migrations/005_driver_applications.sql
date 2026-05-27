create extension if not exists pgcrypto;

create table if not exists public.driver_applications (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text not null,
  city text not null,
  state text not null,
  vehicle_make_model text not null,
  license_plate text not null,
  drivers_license_state text not null,
  drivers_license_last4 text not null,
  has_clean_record boolean not null default false,
  background_check_consent boolean not null default false,
  availability text not null,
  referral_source text,
  notes text,
  status text not null default 'pending'
    check (status in ('pending', 'reviewing', 'approved', 'rejected', 'withdrawn')),
  reviewed_at timestamptz,
  reviewed_by text,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists driver_applications_status_idx
  on public.driver_applications (status, created_at desc);
create index if not exists driver_applications_email_idx
  on public.driver_applications (email);

alter table public.driver_applications enable row level security;
revoke all on public.driver_applications from anon, authenticated;
