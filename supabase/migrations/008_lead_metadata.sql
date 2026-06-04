alter table public.leads
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

create index if not exists leads_phone_idx on public.leads (phone);
