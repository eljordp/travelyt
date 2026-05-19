create table if not exists public.push_tokens (
  token text primary key,
  platform text not null default 'unknown',
  booking_id text references public.bookings(id) on delete set null,
  user_id uuid,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_tokens_booking_id_idx
  on public.push_tokens (booking_id);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

drop trigger if exists push_tokens_set_updated_at on public.push_tokens;
create trigger push_tokens_set_updated_at
before update on public.push_tokens
for each row
execute function public.set_updated_at();

alter table public.push_tokens enable row level security;

create table if not exists public.push_notification_events (
  id uuid primary key default gen_random_uuid(),
  booking_id text not null references public.bookings(id) on delete cascade,
  token text not null references public.push_tokens(token) on delete cascade,
  platform text not null default 'unknown',
  title text not null,
  body text not null,
  data jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued', 'sent', 'failed')),
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists push_notification_events_booking_id_idx
  on public.push_notification_events (booking_id);

create index if not exists push_notification_events_status_created_at_idx
  on public.push_notification_events (status, created_at);

alter table public.push_notification_events enable row level security;
