-- Private, token-gated agent onboarding. Uploading evidence never certifies an
-- agent; full admin review and the existing readiness gates remain required.

create table if not exists public.agent_onboarding_invites (
  id uuid primary key default gen_random_uuid(),
  driver_access_id uuid not null references public.driver_access_codes(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'active' check (status in ('active', 'completed', 'revoked')),
  expires_at timestamptz not null,
  first_opened_at timestamptz,
  completed_at timestamptz,
  revoked_at timestamptz,
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_onboarding_invites_driver_idx
  on public.agent_onboarding_invites (driver_access_id, created_at desc);

create table if not exists public.agent_evidence_uploads (
  id uuid primary key default gen_random_uuid(),
  driver_access_id uuid not null references public.driver_access_codes(id) on delete restrict,
  invite_id uuid not null references public.agent_onboarding_invites(id) on delete restrict,
  evidence_type text not null check (
    evidence_type in ('training', 'insurance', 'vehicle_registration', 'vehicle_photo')
  ),
  file_path text not null unique,
  original_name text not null,
  content_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  uploaded_at timestamptz not null default now()
);

create index if not exists agent_evidence_uploads_driver_idx
  on public.agent_evidence_uploads (driver_access_id, evidence_type, uploaded_at desc);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'agent-readiness-evidence',
  'agent-readiness-evidence',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.agent_onboarding_invites enable row level security;
alter table public.agent_evidence_uploads enable row level security;
revoke all on public.agent_onboarding_invites from anon, authenticated;
revoke all on public.agent_evidence_uploads from anon, authenticated;

drop policy if exists "agent readiness evidence service role access" on storage.objects;
create policy "agent readiness evidence service role access"
on storage.objects for all
to service_role
using (bucket_id = 'agent-readiness-evidence')
with check (bucket_id = 'agent-readiness-evidence');
