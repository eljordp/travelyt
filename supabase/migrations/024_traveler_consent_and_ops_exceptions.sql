-- Email-control OTP for adult consent, with financial and custody exception
-- ledgers kept outside mutable booking patches.
alter table public.identity_verifications
  add column if not exists verification_invite_otp_hash text,
  add column if not exists verification_invite_otp_expires_at timestamptz,
  add column if not exists verification_invite_otp_attempts integer not null default 0,
  add column if not exists verification_invite_otp_verified_at timestamptz;

create table if not exists public.booking_financial_events (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('refund_requested','refund_succeeded','refund_failed','manual_adjustment')),
  amount_cents integer not null check (amount_cents >= 0), currency text not null default 'usd', reason text not null,
  idempotency_key text not null, stripe_refund_id text,
  status text not null check (status in ('pending','succeeded','failed','manual_review')),
  requested_by text not null, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (booking_id, idempotency_key)
);
create table if not exists public.booking_exception_events (
  id uuid primary key default gen_random_uuid(), booking_id text not null references public.bookings(id) on delete cascade,
  kind text not null check (kind in ('handoff_refused','return_started','return_completed','dispatch_no_go','group_resolution','offline_reconciled')),
  reason_code text not null, note text, actor_name text not null, payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists booking_financial_events_booking_idx on public.booking_financial_events (booking_id, created_at desc);
create index if not exists booking_exception_events_booking_idx on public.booking_exception_events (booking_id, created_at desc);
alter table public.booking_financial_events enable row level security;
alter table public.booking_exception_events enable row level security;
revoke all on public.booking_financial_events from anon, authenticated;
revoke all on public.booking_exception_events from anon, authenticated;
