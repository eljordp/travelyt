-- Durable proof that Supabase Auth confirmed control of a phone number.
-- Raw phone numbers and OTPs are intentionally excluded; the application
-- stores only a keyed hash plus Supabase's server-verified timestamp.
create table if not exists public.phone_verification_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_hash text not null check (length(phone_hash) = 64),
  provider text not null default 'supabase_auth'
    check (provider = 'supabase_auth'),
  verified_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  unique (user_id, phone_hash)
);

create index if not exists phone_verification_receipts_verified_idx
  on public.phone_verification_receipts(verified_at desc);

alter table public.phone_verification_receipts enable row level security;
revoke all on public.phone_verification_receipts from public, anon, authenticated;
grant select, insert, update on public.phone_verification_receipts to service_role;

comment on table public.phone_verification_receipts is
  'Server-recorded proof that Supabase Auth confirmed a phone; contains no raw phone or OTP.';
