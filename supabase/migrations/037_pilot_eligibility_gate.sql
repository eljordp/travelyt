-- Payment is unavailable until a full admin approves a specific pilot request.
-- Eligibility is separate from the operational booking status so waitlisted and
-- declined requests stay visible without ever becoming paid bookings.
alter table public.bookings
  add column if not exists pilot_eligibility_status text not null default 'pending',
  add column if not exists pilot_eligibility_decided_at timestamptz,
  add column if not exists pilot_eligibility_decided_by text,
  add column if not exists pilot_eligibility_reason text,
  add column if not exists pilot_eligibility_expires_at timestamptz,
  add column if not exists pilot_eligibility_snapshot jsonb not null default '{}'::jsonb;

alter table public.bookings
  drop constraint if exists bookings_pilot_eligibility_status_check;
alter table public.bookings
  add constraint bookings_pilot_eligibility_status_check
  check (pilot_eligibility_status in ('pending', 'approved', 'waitlisted', 'declined', 'expired'));

create index if not exists bookings_pilot_eligibility_queue_idx
  on public.bookings (pilot_eligibility_status, travel_date, created_at desc);

alter table public.booking_exception_events
  drop constraint if exists booking_exception_events_kind_check;
alter table public.booking_exception_events
  add constraint booking_exception_events_kind_check
  check (kind in ('handoff_refused','return_started','return_completed','dispatch_no_go','group_resolution','offline_reconciled','pilot_eligibility_decision'));

-- Preserve already-paid or active historical bookings. This does not unlock
-- any pending request and expires immediately for new checkout attempts.
update public.bookings
set pilot_eligibility_status = 'approved',
    pilot_eligibility_decided_at = coalesce(paid_at, created_at),
    pilot_eligibility_decided_by = 'migration:037',
    pilot_eligibility_reason = 'Historical paid or active booking preserved during eligibility-gate launch.',
    pilot_eligibility_expires_at = coalesce(paid_at, created_at),
    pilot_eligibility_snapshot = jsonb_build_object('historicalPaidOrActive', true)
where status <> 'pending'
  and pilot_eligibility_status = 'pending';

comment on column public.bookings.pilot_eligibility_status is
  'Manual pilot admission decision. Stripe Checkout remains locked unless approved and unexpired.';
