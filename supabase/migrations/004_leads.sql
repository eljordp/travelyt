create extension if not exists pgcrypto;

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  interest text not null default 'early-access',
  source text not null default 'site',
  user_agent text,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index if not exists leads_email_idx on public.leads (email);
create index if not exists leads_created_at_idx on public.leads (created_at desc);
create index if not exists leads_interest_idx on public.leads (interest);

alter table public.leads enable row level security;

revoke all on public.leads from anon, authenticated;
