-- Server-owned quote provenance. New bookings store the verified Google route,
-- pricing inputs, complete breakdown, output, and a deterministic fingerprint.
-- Legacy rows remain nullable and fail closed at Checkout until re-quoted.

alter table public.bookings
  add column if not exists pricing_quote jsonb,
  add column if not exists pricing_fingerprint text;

alter table public.bookings
  drop constraint if exists bookings_pricing_quote_object_check;
alter table public.bookings
  add constraint bookings_pricing_quote_object_check check (
    pricing_quote is null or jsonb_typeof(pricing_quote) = 'object'
  );

alter table public.bookings
  drop constraint if exists bookings_pricing_fingerprint_check;
alter table public.bookings
  add constraint bookings_pricing_fingerprint_check check (
    pricing_fingerprint is null or pricing_fingerprint ~ '^[a-f0-9]{64}$'
  );

create index if not exists bookings_pricing_version_idx
  on public.bookings ((pricing_quote->>'version'))
  where pricing_quote is not null;
