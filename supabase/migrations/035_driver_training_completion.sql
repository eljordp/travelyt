-- Driver onboarding can be opened either from a bounded invite or from the
-- driver's own authenticated access-code session. Training completion is a
-- private, auditable submission; it does not activate readiness by itself.

alter table public.agent_evidence_uploads
  alter column invite_id drop not null;

create table if not exists public.agent_training_completions (
  id uuid primary key default gen_random_uuid(),
  driver_access_id uuid not null references public.driver_access_codes(id) on delete restrict,
  training_version text not null,
  signature_name text not null,
  module_acknowledgments jsonb not null,
  quiz_answers jsonb not null,
  score integer not null check (score between 0 and 100),
  passed boolean not null default false,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'rejected')),
  reviewed_at timestamptz,
  reviewed_by text,
  review_note text,
  completed_at timestamptz not null default now(),
  ip_hash text,
  user_agent_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (driver_access_id, training_version),
  constraint agent_training_completion_passed_score check (
    (not passed) or score = 100
  )
);

create index if not exists agent_training_completions_driver_idx
  on public.agent_training_completions (driver_access_id, completed_at desc);

alter table public.agent_training_completions enable row level security;
revoke all on public.agent_training_completions from anon, authenticated;
