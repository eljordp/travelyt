-- Provider-authenticated Resend evidence for payment receipts.
-- A Resend API 2xx only proves provider acceptance. Signed webhook events are
-- stored first so a fast event cannot be lost before its receipt is linked.
alter table public.booking_payment_receipts
  add column if not exists provider_config_hash text,
  add column if not exists accepted_at timestamptz,
  add column if not exists provider_event_id text,
  add column if not exists provider_event_created_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists bounced_at timestamptz;

alter table public.booking_payment_receipts
  drop constraint if exists booking_payment_receipts_status_check;
alter table public.booking_payment_receipts
  add constraint booking_payment_receipts_status_check
  check (status in (
    'sending', 'accepted', 'sent', 'delivered', 'delayed', 'bounced',
    'complained', 'failed', 'not_configured'
  ));

alter table public.booking_payment_receipts
  drop constraint if exists booking_payment_receipts_provider_config_hash_check;
alter table public.booking_payment_receipts
  add constraint booking_payment_receipts_provider_config_hash_check
  check (
    provider_config_hash is null or
    provider_config_hash ~ '^[a-f0-9]{64}$'
  );

create unique index if not exists booking_payment_receipts_provider_message_idx
  on public.booking_payment_receipts (provider_message_id)
  where provider_message_id is not null;

create table if not exists public.resend_delivery_events (
  provider_event_id text primary key
    check (length(provider_event_id) between 1 and 255),
  provider_message_id text not null
    check (length(provider_message_id) between 1 and 255),
  provider_event_created_at timestamptz not null,
  status text not null
    check (status in ('sent', 'delivered', 'delayed', 'bounced', 'complained')),
  received_at timestamptz not null default now(),
  applied_booking_id text references public.booking_payment_receipts(booking_id)
    on delete set null,
  applied_at timestamptz
);

create index if not exists resend_delivery_events_message_idx
  on public.resend_delivery_events (
    provider_message_id,
    provider_event_created_at desc
  );

alter table public.resend_delivery_events enable row level security;
revoke all on public.resend_delivery_events from public, anon, authenticated;

create or replace function public.reconcile_resend_delivery_events(
  p_provider_message_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.booking_payment_receipts%rowtype;
  v_latest public.resend_delivery_events%rowtype;
  v_sent_at timestamptz;
  v_delivered_at timestamptz;
  v_bounced_at timestamptz;
begin
  select * into v_receipt
  from public.booking_payment_receipts
  where provider_message_id = p_provider_message_id
  for update;

  if not found then return false; end if;

  select * into v_latest
  from public.resend_delivery_events
  where provider_message_id = p_provider_message_id
  order by
    provider_event_created_at desc,
    case status
      when 'complained' then 5
      when 'bounced' then 4
      when 'delivered' then 3
      when 'delayed' then 2
      else 1
    end desc,
    received_at desc,
    provider_event_id desc
  limit 1;

  if not found then return false; end if;

  select
    max(provider_event_created_at) filter (where status = 'sent'),
    max(provider_event_created_at) filter (where status = 'delivered'),
    max(provider_event_created_at) filter (
      where status in ('bounced', 'complained')
    )
  into v_sent_at, v_delivered_at, v_bounced_at
  from public.resend_delivery_events
  where provider_message_id = p_provider_message_id;

  update public.booking_payment_receipts
  set
    status = v_latest.status,
    provider_event_id = v_latest.provider_event_id,
    provider_event_created_at = v_latest.provider_event_created_at,
    sent_at = coalesce(v_sent_at, sent_at),
    delivered_at = coalesce(v_delivered_at, delivered_at),
    bounced_at = coalesce(v_bounced_at, bounced_at),
    last_error = case
      when v_latest.status = 'bounced'
        then 'Resend reported that the message bounced.'
      when v_latest.status = 'complained'
        then 'Resend reported a spam complaint.'
      when v_latest.status = 'delayed'
        then 'Resend reported that delivery was delayed.'
      else null
    end
  where booking_id = v_receipt.booking_id;

  update public.resend_delivery_events
  set applied_booking_id = v_receipt.booking_id, applied_at = now()
  where provider_message_id = p_provider_message_id
    and applied_booking_id is distinct from v_receipt.booking_id;

  return true;
end;
$$;

create or replace function public.record_resend_delivery_event(
  p_provider_message_id text,
  p_provider_event_id text,
  p_provider_event_created_at timestamptz,
  p_status text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider_message_id is null or
     length(trim(p_provider_message_id)) not between 1 and 255 or
     p_provider_event_id is null or
     length(trim(p_provider_event_id)) not between 1 and 255 or
     p_provider_event_created_at is null or
     p_status is null or
     p_status not in ('sent', 'delivered', 'delayed', 'bounced', 'complained') then
    raise exception 'invalid resend delivery event';
  end if;

  insert into public.resend_delivery_events (
    provider_event_id,
    provider_message_id,
    provider_event_created_at,
    status
  ) values (
    trim(p_provider_event_id),
    trim(p_provider_message_id),
    p_provider_event_created_at,
    p_status
  )
  on conflict (provider_event_id) do nothing;

  return public.reconcile_resend_delivery_events(trim(p_provider_message_id));
end;
$$;

create or replace function public.reconcile_resend_events_after_receipt_link()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider_message_id is null then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform public.reconcile_resend_delivery_events(new.provider_message_id);
  elsif old.provider_message_id is distinct from new.provider_message_id then
    perform public.reconcile_resend_delivery_events(new.provider_message_id);
  end if;
  return null;
end;
$$;

drop trigger if exists booking_payment_receipt_reconcile_resend_events
  on public.booking_payment_receipts;
create trigger booking_payment_receipt_reconcile_resend_events
after insert or update of provider_message_id
on public.booking_payment_receipts
for each row execute function public.reconcile_resend_events_after_receipt_link();

revoke all on function public.reconcile_resend_delivery_events(text)
  from public, anon, authenticated;
revoke all on function public.record_resend_delivery_event(text, text, timestamptz, text)
  from public, anon, authenticated;
revoke all on function public.reconcile_resend_events_after_receipt_link()
  from public, anon, authenticated;
grant execute on function public.record_resend_delivery_event(text, text, timestamptz, text)
  to service_role;

comment on table public.resend_delivery_events is
  'Signed Resend webhook events retained before receipt reconciliation.';
comment on function public.record_resend_delivery_event(text, text, timestamptz, text) is
  'Durably records a signed Resend event and reconciles it to a payment receipt when linked.';
