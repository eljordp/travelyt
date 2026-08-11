-- Travelyt Custody Protocol: carrier-neutral event vocabulary.
-- Existing event values stay valid so already-sealed records remain readable.
-- The new vocabulary describes Travelyt's own custody evidence rather than
-- borrowing TSA or airline workflow names for the core ledger. Screening is
-- never recorded as a Travelyt checkpoint. The legacy security_handoff value
-- stays valid only because hash-chained historical rows cannot be rewritten.

alter table public.custody_events
  drop constraint if exists custody_events_event_type_check;

alter table public.custody_events
  add constraint custody_events_event_type_check check (event_type in (
    'bag_registered',
    'custody_accepted',
    'route_checkpoint',
    'traveler_return',
    'recipient_confirmed',
    'carrier_transfer',
    'exception_opened',
    'badge_issued',
    'picked_up',
    'in_transit',
    'security_handoff',
    'delivered',
    'exception'
  ));

alter table public.custody_events
  drop constraint if exists custody_events_actor_role_check;

alter table public.custody_events
  add constraint custody_events_actor_role_check check (actor_role in (
    'traveler',
    'agent',
    'operations',
    'recipient',
    'carrier',
    'customer',
    'driver',
    'employee',
    'tsa',
    'airline',
    'system'
  ));

alter table public.custody_events
  drop constraint if exists custody_events_verified_method_check;

alter table public.custody_events
  add constraint custody_events_verified_method_check check (verified_method in (
    'none',
    'access_code',
    'account_session',
    'manual_record',
    'employee_credential',
    'provider_assertion',
    'id_document',
    'facial_liveness',
    'confirmation_code'
  ));
