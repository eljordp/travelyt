-- Existing originals from migration 029 predate the explicit deletion state.
-- Preserve their existing retention dates and enroll only rows that still
-- contain stored private-object paths.
update public.identity_verifications
set raw_deletion_status = 'scheduled'
where raw_deletion_status = 'not_applicable'
  and raw_destroyed_at is null
  and jsonb_typeof(raw_document_paths) = 'array'
  and jsonb_array_length(raw_document_paths) > 0;
