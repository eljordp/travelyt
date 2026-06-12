create table if not exists public.partner_integrations (
  id text primary key,
  name text not null,
  kind text not null check (kind in ('airline', 'airport', 'storage', 'courier', 'travel-platform', 'generic')),
  environment text not null default 'manual' check (environment in ('sandbox', 'production', 'manual')),
  capabilities jsonb not null default '[]'::jsonb,
  auth_type text not null default 'manual',
  active boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.partner_events (
  id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.partner_integrations(id),
  booking_id text references public.bookings(id),
  external_reference text,
  direction text not null check (direction in ('inbound', 'outbound')),
  event_type text not null,
  status text not null default 'received',
  payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

drop trigger if exists partner_integrations_set_updated_at on public.partner_integrations;
create trigger partner_integrations_set_updated_at
before update on public.partner_integrations
for each row
execute function public.set_updated_at();

alter table public.bookings
  add column if not exists external_provider text,
  add column if not exists external_reference text,
  add column if not exists external_status text,
  add column if not exists external_synced_at timestamptz;

create index if not exists partner_integrations_active_kind_idx
  on public.partner_integrations (active, kind);

create index if not exists partner_events_provider_idx
  on public.partner_events (provider_id, created_at desc);

create index if not exists partner_events_booking_idx
  on public.partner_events (booking_id, created_at desc);

create index if not exists bookings_external_provider_reference_idx
  on public.bookings (external_provider, external_reference);

alter table public.partner_integrations enable row level security;
alter table public.partner_events enable row level security;
revoke all on public.partner_integrations from anon, authenticated;
revoke all on public.partner_events from anon, authenticated;

insert into public.partner_integrations (id, name, kind, environment, capabilities, auth_type, active, notes)
values
  (
    'united',
    'United Airlines',
    'airline',
    'manual',
    '["availability", "status-sync", "handoff-proof", "webhook"]'::jsonb,
    'manual',
    false,
    'Placeholder provider record. Activate only after credentials, terms, and station approval exist.'
  ),
  (
    'royal-jordanian',
    'Royal Jordanian',
    'airline',
    'manual',
    '["availability", "status-sync", "handoff-proof", "webhook"]'::jsonb,
    'manual',
    false,
    'Placeholder provider record. Start with status/reference sync before baggage-system writeback.'
  ),
  (
    'stasher',
    'Stasher',
    'storage',
    'manual',
    '["quote", "availability", "create-order", "cancel-order", "status-sync"]'::jsonb,
    'manual',
    false,
    'Placeholder provider record for luggage-storage integrations separate from airport custody.'
  )
on conflict (id) do nothing;
