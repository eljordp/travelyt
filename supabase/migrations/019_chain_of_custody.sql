-- Chain of custody: per-bag identity + tamper-evident custody ledger.
-- This is the core unlock for off-airport bag handling. Every handoff of a
-- physical bag is a scannable badge event tying a specific bag to a specific
-- ID-verified actor at a specific time and place. The ledger is append-only
-- and hash-chained, so the full custody history can be cryptographically
-- recomputed and any tampering is detectable.

create extension if not exists pgcrypto;

-- Each physical bag under a booking gets its own scannable badge.
-- `bookings.bags` is a count; this gives every bag an identity.
create table if not exists public.bags (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  badge_code text not null unique,
  label text,
  description text,
  weight_grams integer check (weight_grams is null or weight_grams >= 0),
  declared_value_cents integer check (declared_value_cents is null or declared_value_cents >= 0),
  status text not null default 'issued'
    check (status in ('issued', 'in_custody', 'handed_off', 'delivered', 'exception')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bags_booking_id_idx on public.bags (booking_id);
create index if not exists bags_badge_code_idx on public.bags (badge_code);

drop trigger if exists bags_set_updated_at on public.bags;
create trigger bags_set_updated_at
before update on public.bags
for each row
execute function public.set_updated_at();

-- Append-only custody ledger. One row per scan / handoff event.
create table if not exists public.custody_events (
  id uuid primary key default gen_random_uuid(),
  bag_id uuid not null references public.bags(id) on delete cascade,
  booking_id text not null references public.bookings(id) on delete cascade,
  badge_code text not null,
  seq integer not null,
  event_type text not null check (event_type in (
    'badge_issued',      -- badge minted, bag registered into custody
    'picked_up',         -- driver took custody at the door
    'in_transit',        -- bag is moving
    'security_handoff',  -- handed to TSA / airline security
    'delivered',         -- delivered to destination
    'exception'          -- tamper, damage, or mismatch detected
  )),
  actor_role text not null check (actor_role in (
    'customer', 'driver', 'employee', 'tsa', 'airline', 'system'
  )),
  actor_name text,
  identity_verification_id uuid references public.identity_verifications(id),
  verified_method text not null default 'none' check (verified_method in (
    'none', 'access_code', 'id_document', 'facial_liveness', 'confirmation_code'
  )),
  photo_path text,
  location_lat numeric(9, 6),
  location_lng numeric(9, 6),
  note text,
  prev_hash text not null,
  event_hash text not null,
  created_at timestamptz not null default now(),
  unique (bag_id, seq)
);

create index if not exists custody_events_bag_id_idx on public.custody_events (bag_id, seq);
create index if not exists custody_events_badge_code_idx on public.custody_events (badge_code, created_at);
create index if not exists custody_events_booking_id_idx on public.custody_events (booking_id);

-- Tamper-evident hash chaining. On insert we look up the prior event for the
-- same bag, set seq + prev_hash, then seal the whole payload into event_hash.
-- Any later edit to a sealed field breaks the recomputed chain.
create or replace function public.custody_events_chain()
returns trigger as $$
declare
  last_event public.custody_events%rowtype;
  payload text;
begin
  select * into last_event
  from public.custody_events
  where bag_id = new.bag_id
  order by seq desc
  limit 1;

  if found then
    new.seq := last_event.seq + 1;
    new.prev_hash := last_event.event_hash;
  else
    new.seq := 1;
    new.prev_hash := repeat('0', 64); -- genesis
  end if;

  payload := concat_ws('|',
    new.prev_hash,
    new.bag_id::text,
    new.badge_code,
    new.seq::text,
    new.event_type,
    new.actor_role,
    coalesce(new.actor_name, ''),
    coalesce(new.identity_verification_id::text, ''),
    new.verified_method,
    coalesce(new.photo_path, ''),
    coalesce(new.location_lat::text, ''),
    coalesce(new.location_lng::text, ''),
    coalesce(new.note, ''),
    extract(epoch from new.created_at)::text
  );

  new.event_hash := encode(digest(payload, 'sha256'), 'hex');
  return new;
end;
$$ language plpgsql;

drop trigger if exists custody_events_chain_trg on public.custody_events;
create trigger custody_events_chain_trg
before insert on public.custody_events
for each row
execute function public.custody_events_chain();

-- The ledger is append-only. Block updates and deletes even from service_role,
-- so the custody record cannot be silently rewritten after the fact.
create or replace function public.custody_events_immutable()
returns trigger as $$
begin
  raise exception 'custody_events is append-only; % is not permitted', tg_op;
end;
$$ language plpgsql;

drop trigger if exists custody_events_no_mutate on public.custody_events;
create trigger custody_events_no_mutate
before update or delete on public.custody_events
for each row
execute function public.custody_events_immutable();

-- Recompute and validate a bag's entire custody chain. Returns ok=false plus
-- the first broken sequence number if any event was tampered with.
create or replace function public.verify_custody_chain(p_bag_id uuid)
returns table (ok boolean, broken_seq integer, total integer) as $$
declare
  ev public.custody_events%rowtype;
  expected_prev text := repeat('0', 64);
  recomputed text;
  payload text;
  cnt integer := 0;
begin
  ok := true;
  broken_seq := null;
  total := 0;

  for ev in
    select * from public.custody_events where bag_id = p_bag_id order by seq asc
  loop
    cnt := cnt + 1;

    if ev.prev_hash <> expected_prev then
      ok := false; broken_seq := ev.seq; total := cnt; return next; return;
    end if;

    payload := concat_ws('|',
      ev.prev_hash, ev.bag_id::text, ev.badge_code, ev.seq::text,
      ev.event_type, ev.actor_role, coalesce(ev.actor_name, ''),
      coalesce(ev.identity_verification_id::text, ''), ev.verified_method,
      coalesce(ev.photo_path, ''), coalesce(ev.location_lat::text, ''),
      coalesce(ev.location_lng::text, ''), coalesce(ev.note, ''),
      extract(epoch from ev.created_at)::text
    );
    recomputed := encode(digest(payload, 'sha256'), 'hex');

    if recomputed <> ev.event_hash then
      ok := false; broken_seq := ev.seq; total := cnt; return next; return;
    end if;

    expected_prev := ev.event_hash;
  end loop;

  total := cnt;
  return next;
end;
$$ language plpgsql;

alter table public.bags enable row level security;
revoke all on public.bags from anon, authenticated;

alter table public.custody_events enable row level security;
revoke all on public.custody_events from anon, authenticated;
