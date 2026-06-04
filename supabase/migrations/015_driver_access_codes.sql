create table if not exists public.driver_access_codes (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null,
  canonical_driver_name text not null,
  driver_email text,
  driver_phone text,
  role text not null default 'driver' check (role in ('driver', 'dispatcher', 'employee', 'admin')),
  code_hash text not null unique,
  code_preview text not null,
  status text not null default 'active' check (status in ('active', 'revoked', 'expired')),
  created_by text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists driver_access_codes_canonical_driver_name_idx
  on public.driver_access_codes (canonical_driver_name, status);

create index if not exists driver_access_codes_status_idx
  on public.driver_access_codes (status, created_at desc);

alter table public.driver_access_codes enable row level security;
revoke all on public.driver_access_codes from anon, authenticated;
