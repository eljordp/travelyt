alter table public.bookings
  alter column phone drop not null;

alter table public.driver_applications
  alter column phone drop not null;
