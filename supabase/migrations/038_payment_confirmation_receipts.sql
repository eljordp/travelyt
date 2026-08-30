-- Durable, retryable payment-confirmation email delivery.
-- The claim function prevents Stripe webhook and browser reconciliation from
-- sending the same customer receipt concurrently.
create table if not exists public.booking_payment_receipts (
  booking_id text primary key references public.bookings(id) on delete cascade,
  stripe_checkout_session_id text not null unique,
  recipient_email text not null,
  amount_cents integer not null check (amount_cents >= 0),
  currency text not null,
  livemode boolean not null,
  status text not null check (status in ('sending', 'sent', 'failed', 'not_configured')),
  attempts integer not null default 0 check (attempts >= 0),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  provider_status integer,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.booking_payment_receipts enable row level security;
revoke all on public.booking_payment_receipts from anon, authenticated;

drop trigger if exists booking_payment_receipts_set_updated_at
  on public.booking_payment_receipts;
create trigger booking_payment_receipts_set_updated_at
before update on public.booking_payment_receipts
for each row execute function public.set_updated_at();

create or replace function public.claim_booking_payment_receipt(
  p_booking_id text,
  p_stripe_checkout_session_id text,
  p_recipient_email text,
  p_amount_cents integer,
  p_currency text,
  p_livemode boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_claim_token uuid := gen_random_uuid();
  v_claimed_token uuid;
begin
  insert into public.booking_payment_receipts as receipt (
    booking_id,
    stripe_checkout_session_id,
    recipient_email,
    amount_cents,
    currency,
    livemode,
    status,
    attempts,
    claim_token,
    claimed_at
  ) values (
    p_booking_id,
    p_stripe_checkout_session_id,
    lower(trim(p_recipient_email)),
    p_amount_cents,
    lower(trim(p_currency)),
    p_livemode,
    'sending',
    1,
    v_new_claim_token,
    now()
  )
  on conflict (booking_id) do update
  set
    stripe_checkout_session_id = excluded.stripe_checkout_session_id,
    recipient_email = excluded.recipient_email,
    amount_cents = excluded.amount_cents,
    currency = excluded.currency,
    livemode = excluded.livemode,
    status = 'sending',
    attempts = receipt.attempts + 1,
    claim_token = v_new_claim_token,
    claimed_at = now(),
    next_attempt_at = null,
    provider_message_id = null,
    provider_status = null,
    last_error = null
  where
    (
      receipt.status in ('failed', 'not_configured')
      and coalesce(receipt.next_attempt_at, '-infinity'::timestamptz) <= now()
    )
    or (
      receipt.status = 'sending'
      and receipt.claimed_at < now() - interval '15 minutes'
    )
  returning claim_token into v_claimed_token;

  return v_claimed_token;
end;
$$;

revoke all on function public.claim_booking_payment_receipt(text, text, text, integer, text, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_booking_payment_receipt(text, text, text, integer, text, boolean)
  to service_role;

comment on table public.booking_payment_receipts is
  'One durable customer payment-confirmation receipt state per booking.';
comment on function public.claim_booking_payment_receipt(text, text, text, integer, text, boolean) is
  'Atomically claims an unsent payment receipt; failed, unconfigured, and stale claims may retry.';
