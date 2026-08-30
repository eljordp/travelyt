-- Bind each durable phone-delivery proof to the exact Supabase project and
-- provider configuration that was live when the OTP was completed. Existing
-- receipts remain nullable and therefore cannot satisfy the new readiness gate.
alter table public.phone_verification_receipts
  add column if not exists provider_config_hash text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phone_verification_receipts_provider_config_hash_check'
      and conrelid = 'public.phone_verification_receipts'::regclass
  ) then
    alter table public.phone_verification_receipts
      add constraint phone_verification_receipts_provider_config_hash_check
      check (
        provider_config_hash is null
        or provider_config_hash ~ '^[a-f0-9]{64}$'
      );
  end if;
end
$$;

create index if not exists phone_verification_receipts_provider_verified_idx
  on public.phone_verification_receipts(
    provider_config_hash,
    verified_at desc
  );

comment on column public.phone_verification_receipts.provider_config_hash is
  'Keyed non-secret binding to Supabase project, SMS provider, and provider configuration identifier; legacy null rows never count as current delivery proof.';
