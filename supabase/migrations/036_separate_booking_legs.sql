-- New bookings must represent exactly one custody leg. Historical `both` rows
-- stay readable so operations can archive, cancel, or investigate them.
create or replace function public.reject_combined_booking_service()
returns trigger
language plpgsql
as $$
begin
  if new.service = 'both' then
    if tg_op = 'INSERT' then
      raise exception using
        errcode = '23514',
        message = 'Departure and arrival must be created as separate bookings.';
    end if;

    if old.service is distinct from new.service then
      raise exception using
        errcode = '23514',
        message = 'A booking cannot be changed to the obsolete combined service.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_reject_combined_service on public.bookings;
create trigger bookings_reject_combined_service
before insert or update of service on public.bookings
for each row
execute function public.reject_combined_booking_service();

comment on function public.reject_combined_booking_service() is
  'Prevents new combined departure/arrival bookings while preserving historical rows for read-only resolution.';
