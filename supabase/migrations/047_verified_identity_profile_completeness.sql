-- A provider success cannot become a Travelyt verified identity without the
-- claims and private capture archive used by booking and custody gates.
update public.identity_verifications
set
  status = 'manual_review',
  liveness_status = 'manual_review',
  verified_at = null,
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'verified_profile_complete', false,
    'manual_review_reason', 'verified_record_missing_required_profile_or_archive',
    'manual_reviewed_at', now()
  ),
  updated_at = now()
where provider = 'stripe_identity'
  and status = 'verified'
  and (
    nullif(btrim(metadata->>'verified_first_name'), '') is null
    or nullif(btrim(metadata->>'verified_last_name'), '') is null
    or coalesce(metadata->>'verified_dob', '') !~ '^\d{4}-\d{2}-\d{2}$'
    or not jsonb_path_exists(
      coalesce(raw_document_paths, '[]'::jsonb),
      '$[*] ? (@.kind == "document")'
    )
    or not jsonb_path_exists(
      coalesce(raw_document_paths, '[]'::jsonb),
      '$[*] ? (@.kind == "selfie")'
    )
  );

alter table public.identity_verifications
  drop constraint if exists identity_verifications_verified_profile_complete_check;

alter table public.identity_verifications
  add constraint identity_verifications_verified_profile_complete_check check (
    status <> 'verified'
    or provider <> 'stripe_identity'
    or (
      nullif(btrim(metadata->>'verified_first_name'), '') is not null
      and nullif(btrim(metadata->>'verified_last_name'), '') is not null
      and coalesce(metadata->>'verified_dob', '') ~ '^\d{4}-\d{2}-\d{2}$'
      and jsonb_path_exists(
        coalesce(raw_document_paths, '[]'::jsonb),
        '$[*] ? (@.kind == "document")'
      )
      and jsonb_path_exists(
        coalesce(raw_document_paths, '[]'::jsonb),
        '$[*] ? (@.kind == "selfie")'
      )
    )
  );

comment on constraint identity_verifications_verified_profile_complete_check
  on public.identity_verifications is
  'Stripe Identity rows require verified name, DOB, and Travelyt-held document/selfie originals before status verified.';
