-- Atomic admission control for the controlled ORD RJ264 pilot. These values
-- are operational controls, not commercial capacity promises.
create table if not exists public.pilot_capacity_controls (
  provider_id text not null references public.partner_integrations(id),
  airport text not null,
  flight_number text not null,
  max_bookings integer not null check (max_bookings > 0),
  max_bags integer not null check (max_bags > 0),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_id, airport, flight_number)
);

insert into public.pilot_capacity_controls (provider_id, airport, flight_number, max_bookings, max_bags, active, notes)
values ('royal-jordanian', 'ORD', 'RJ264', 4, 6, true,
  'Controlled pilot ceiling. Raise only after staffing, insurance, rehearsal, and RJ station approval are updated.')
on conflict (provider_id, airport, flight_number) do nothing;

create or replace function public.enforce_pilot_booking_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  normalized_flight text;
  capacity_rule public.pilot_capacity_controls%rowtype;
  reserved_bookings integer;
  reserved_bags integer;
  capacity_key text;
begin
  normalized_flight := upper(regexp_replace(coalesce(new.flight, ''), '\\s', '', 'g'));
  if new.external_provider is null or new.airport is null or new.travel_date is null
    or new.status in ('cancelled', 'closed') or new.archived_at is not null then return new; end if;
  select * into capacity_rule from public.pilot_capacity_controls
    where provider_id = new.external_provider and airport = upper(new.airport)
      and flight_number = normalized_flight and active = true;
  if not found then return new; end if;
  capacity_key := concat_ws(':', capacity_rule.provider_id, capacity_rule.airport, capacity_rule.flight_number, new.travel_date);
  perform pg_advisory_xact_lock(hashtextextended(capacity_key, 0));
  select count(*)::integer, coalesce(sum(bags), 0)::integer into reserved_bookings, reserved_bags
    from public.bookings where external_provider = capacity_rule.provider_id
      and upper(airport) = capacity_rule.airport
      and upper(regexp_replace(coalesce(flight, ''), '\\s', '', 'g')) = capacity_rule.flight_number
      and travel_date = new.travel_date and status not in ('cancelled', 'closed')
      and archived_at is null and id <> new.id;
  if reserved_bookings + 1 > capacity_rule.max_bookings or reserved_bags + new.bags > capacity_rule.max_bags then
    raise exception using errcode = 'P0001', message = 'RJ_ORD_PILOT_CAPACITY_EXCEEDED',
      detail = format('Pilot ceiling is %s bookings/%s bags; this request would create %s bookings/%s bags.', capacity_rule.max_bookings, capacity_rule.max_bags, reserved_bookings + 1, reserved_bags + new.bags),
      hint = 'Do not create the booking. Offer the controlled waitlist or a different approved flight date.';
  end if;
  return new;
end;
$$;

drop trigger if exists bookings_enforce_pilot_capacity on public.bookings;
create trigger bookings_enforce_pilot_capacity before insert or update of external_provider, airport, flight, travel_date, bags, status, archived_at on public.bookings for each row execute function public.enforce_pilot_booking_capacity();

alter table public.bookings drop constraint if exists bookings_issue_type_check;
alter table public.bookings add constraint bookings_issue_type_check check (issue_type is null or issue_type in ('airport_hold','customer_no_show','missing_id','wrong_bag','driver_delay','vehicle_issue','seal_compromised','prohibited_item','compliance_hold','capacity_hold','lost_or_damaged_bag','customer_unreachable','airline_delay','other'));
drop trigger if exists pilot_capacity_controls_set_updated_at on public.pilot_capacity_controls;
create trigger pilot_capacity_controls_set_updated_at before update on public.pilot_capacity_controls for each row execute function public.set_updated_at();
alter table public.pilot_capacity_controls enable row level security;
revoke all on public.pilot_capacity_controls from anon, authenticated;
