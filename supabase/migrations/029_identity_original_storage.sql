-- Travelyt-held copies of identity verification originals (ID document + selfie).
-- Purpose disclosure: identity verification as the core of chain of custody.
-- Retention: 3 years from storage or until the verification purpose ends, whichever is first.

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'identity-originals',
  'identity-originals',
  false,
  26214400,
  array['image/jpeg', 'image/png']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "identity originals service role access" on storage.objects;
create policy "identity originals service role access"
on storage.objects
for all
to service_role
using (bucket_id = 'identity-originals')
with check (bucket_id = 'identity-originals');

alter table public.identity_verifications
  add column if not exists raw_document_paths jsonb not null default '[]'::jsonb,
  add column if not exists raw_stored_at timestamptz,
  add column if not exists raw_retention_until timestamptz,
  add column if not exists raw_export_status text not null default 'none'
    check (raw_export_status in ('none', 'pending_ash', 'exported')),
  add column if not exists raw_exported_at timestamptz;

create index if not exists identity_verifications_raw_export_idx
  on public.identity_verifications (raw_export_status, raw_stored_at desc);
