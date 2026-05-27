insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'booking-proofs',
  'booking-proofs',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "booking proof service role access" on storage.objects;
create policy "booking proof service role access"
on storage.objects
for all
to service_role
using (bucket_id = 'booking-proofs')
with check (bucket_id = 'booking-proofs');
