-- One signed-in account can coordinate a group. Adult travelers retain a
-- separate consent path; minors use guardian attestation; spouse exception is
-- logged as a household attestation. Raw identity documents are not stored in
-- this manifest.
alter table public.bookings add column if not exists passenger_manifest jsonb not null default '[]'::jsonb;
alter table public.bookings drop constraint if exists bookings_passenger_manifest_array_check;
alter table public.bookings add constraint bookings_passenger_manifest_array_check check (jsonb_typeof(passenger_manifest) = 'array');

alter table public.identity_verifications
  add column if not exists booking_id text references public.bookings(id) on delete cascade,
  add column if not exists passenger_id uuid,
  add column if not exists subject_name text,
  add column if not exists subject_type text,
  add column if not exists consent_at timestamptz,
  add column if not exists guardian_attested_at timestamptz,
  add column if not exists household_attested_at timestamptz,
  add column if not exists verification_invite_token_hash text,
  add column if not exists verification_invite_expires_at timestamptz,
  add column if not exists verification_invite_sent_at timestamptz;
alter table public.identity_verifications drop constraint if exists identity_verifications_subject_type_check;
alter table public.identity_verifications add constraint identity_verifications_subject_type_check check (subject_type is null or subject_type in ('account_holder','adult','minor'));
create index if not exists identity_verifications_booking_passenger_idx on public.identity_verifications (booking_id, passenger_id, created_at desc) where booking_id is not null and passenger_id is not null;
create index if not exists identity_verifications_account_subject_idx on public.identity_verifications (user_id, passenger_id, created_at desc) where passenger_id is not null;
create unique index if not exists identity_verifications_invite_token_hash_idx on public.identity_verifications (verification_invite_token_hash) where verification_invite_token_hash is not null;

alter table public.partner_check_in_jobs add column if not exists passenger_manifest jsonb not null default '[]'::jsonb;
alter table public.partner_check_in_jobs drop constraint if exists partner_check_in_jobs_passenger_manifest_array_check;
alter table public.partner_check_in_jobs add constraint partner_check_in_jobs_passenger_manifest_array_check check (jsonb_typeof(passenger_manifest) = 'array');
alter table public.partner_check_in_jobs drop constraint if exists partner_check_in_jobs_bag_count_check;
alter table public.partner_check_in_jobs add constraint partner_check_in_jobs_bag_count_check check (bag_count between 1 and 100);
