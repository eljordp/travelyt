-- Durable cross-instance throttling and atomic independent-traveler OTP use.
create table if not exists public.request_rate_limits (
  scope text not null,
  identifier_hash text not null,
  window_start timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (scope, identifier_hash)
);

alter table public.request_rate_limits enable row level security;
revoke all on public.request_rate_limits from public, anon, authenticated;

create or replace function public.consume_request_rate_limit(
  p_scope text,
  p_identifier_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_row public.request_rate_limits%rowtype;
begin
  if p_scope is null or length(p_scope) < 3 or length(p_scope) > 120 or
     p_identifier_hash is null or
     p_identifier_hash !~ '^[a-f0-9]{64}$' or
     p_limit is null or p_limit < 1 or p_limit > 1000 or
     p_window_seconds is null or
     p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid durable rate-limit input';
  end if;

  insert into public.request_rate_limits(scope, identifier_hash, window_start, request_count)
  values (p_scope, p_identifier_hash, v_now, 0)
  on conflict (scope, identifier_hash) do nothing;

  select * into v_row
  from public.request_rate_limits
  where scope = p_scope and identifier_hash = p_identifier_hash
  for update;

  if v_row.window_start <= v_now - make_interval(secs => p_window_seconds) then
    update public.request_rate_limits
    set window_start = v_now, request_count = 1, updated_at = v_now
    where scope = p_scope and identifier_hash = p_identifier_hash;
    return true;
  end if;

  if v_row.request_count >= p_limit then return false; end if;

  update public.request_rate_limits
  set request_count = request_count + 1, updated_at = v_now
  where scope = p_scope and identifier_hash = p_identifier_hash;
  return true;
end;
$$;

revoke all on function public.consume_request_rate_limit(text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_request_rate_limit(text, text, integer, integer)
  to service_role;

create or replace function public.consume_traveler_verification_otp(
  p_verification_id uuid,
  p_supplied_otp_hmac text,
  p_max_attempts integer default 5
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.identity_verifications%rowtype;
  v_attempts integer;
begin
  if p_verification_id is null or
     p_supplied_otp_hmac is null or
     p_supplied_otp_hmac !~ '^[a-f0-9]{64}$' or
     p_max_attempts is null or
     p_max_attempts < 1 or p_max_attempts > 20 then
    return 'invalid_input';
  end if;
  select * into v_row
  from public.identity_verifications
  where id = p_verification_id
  for update;
  if not found then return 'not_found'; end if;
  if v_row.verification_invite_otp_verified_at is not null then return 'already_consumed'; end if;
  if v_row.verification_invite_otp_hash is null or
     v_row.verification_invite_otp_expires_at is null or
     v_row.verification_invite_otp_expires_at <= now() then
    return 'expired';
  end if;
  if coalesce(v_row.verification_invite_otp_attempts, 0) >= p_max_attempts then
    return 'locked';
  end if;
  if v_row.verification_invite_otp_hash <> p_supplied_otp_hmac then
    update public.identity_verifications
    set verification_invite_otp_attempts = coalesce(verification_invite_otp_attempts, 0) + 1
    where id = p_verification_id
    returning verification_invite_otp_attempts into v_attempts;
    return case when v_attempts >= p_max_attempts then 'locked' else 'invalid' end;
  end if;
  update public.identity_verifications
  set
    verification_invite_otp_verified_at = now(),
    verification_invite_otp_hash = null,
    verification_invite_otp_expires_at = null
  where id = p_verification_id;
  return 'verified';
end;
$$;

revoke all on function public.consume_traveler_verification_otp(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_traveler_verification_otp(uuid, text, integer)
  to service_role;

comment on function public.consume_traveler_verification_otp(uuid, text, integer) is
  'Atomically consumes one keyed-HMAC adult-traveler OTP and increments failed attempts under a row lock.';
