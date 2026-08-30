-- Keep exactly one active Stripe Checkout Session per booking. The atomic
-- claim prevents concurrent customer requests from creating separate payable
-- sessions for the same booking.
create table if not exists public.booking_checkout_sessions (
  booking_id text primary key references public.bookings(id) on delete cascade,
  stripe_checkout_session_id text unique,
  status text not null check (
    status in ('creating', 'open', 'paid', 'expired', 'failed', 'manual_review')
  ),
  attempts integer not null default 1 check (attempts > 0),
  claim_token uuid,
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_checkout_sessions enable row level security;
revoke all on public.booking_checkout_sessions from anon, authenticated;

drop trigger if exists booking_checkout_sessions_set_updated_at
  on public.booking_checkout_sessions;
create trigger booking_checkout_sessions_set_updated_at
before update on public.booking_checkout_sessions
for each row execute function public.set_updated_at();

create or replace function public.claim_booking_checkout_session(
  p_booking_id text
)
returns table (
  claimed_token uuid,
  existing_session_id text,
  checkout_status text,
  checkout_attempt integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_claim_token uuid := gen_random_uuid();
  v_claimed_token uuid;
  v_existing_session_id text;
  v_checkout_status text;
  v_checkout_attempt integer;
begin
  insert into public.booking_checkout_sessions as checkout (
    booking_id,
    stripe_checkout_session_id,
    status,
    attempts,
    claim_token,
    claimed_at,
    last_error
  ) values (
    p_booking_id,
    null,
    'creating',
    1,
    v_new_claim_token,
    now(),
    null
  )
  on conflict (booking_id) do update
  set
    stripe_checkout_session_id = null,
    status = 'creating',
    attempts = checkout.attempts + 1,
    claim_token = v_new_claim_token,
    claimed_at = now(),
    last_error = null
  where
    checkout.status in ('expired', 'failed')
    or (
      checkout.status = 'creating'
      and checkout.claimed_at < now() - interval '15 minutes'
    )
  returning
    claim_token,
    stripe_checkout_session_id,
    status,
    attempts
  into
    v_claimed_token,
    v_existing_session_id,
    v_checkout_status,
    v_checkout_attempt;

  if found then
    return query select
      v_claimed_token,
      v_existing_session_id,
      v_checkout_status,
      v_checkout_attempt;
    return;
  end if;

  select
    null::uuid,
    checkout.stripe_checkout_session_id,
    checkout.status,
    checkout.attempts
  into
    v_claimed_token,
    v_existing_session_id,
    v_checkout_status,
    v_checkout_attempt
  from public.booking_checkout_sessions as checkout
  where checkout.booking_id = p_booking_id;

  return query select
    v_claimed_token,
    v_existing_session_id,
    v_checkout_status,
    v_checkout_attempt;
end;
$$;

revoke all on function public.claim_booking_checkout_session(text)
  from public, anon, authenticated;
grant execute on function public.claim_booking_checkout_session(text)
  to service_role;

comment on table public.booking_checkout_sessions is
  'One active or completed Stripe Checkout Session state per booking.';
comment on function public.claim_booking_checkout_session(text) is
  'Atomically grants one caller permission to create the booking checkout session.';
