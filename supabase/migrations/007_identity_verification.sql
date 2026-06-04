create table if not exists public.identity_verifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  email text,
  phone text,
  role text not null check (role in ('customer', 'driver', 'employee', 'admin')),
  status text not null default 'pending' check (status in ('pending', 'verified', 'rejected', 'expired', 'manual_review')),
  provider text,
  provider_session_id text,
  document_type text check (document_type in ('driver_license', 'passport', 'employee_badge', 'other')),
  liveness_required boolean not null default true,
  liveness_status text check (liveness_status in ('pending', 'passed', 'failed', 'manual_review')),
  verified_at timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists identity_verifications_user_id_idx
  on public.identity_verifications (user_id, created_at desc);

create index if not exists identity_verifications_status_idx
  on public.identity_verifications (status, role, created_at desc);

alter table public.identity_verifications enable row level security;
revoke all on public.identity_verifications from anon, authenticated;
