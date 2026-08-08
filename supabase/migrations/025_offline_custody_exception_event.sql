-- The initial 024 ledger was applied manually before offline reconciliation
-- existed. Expand its constrained event vocabulary without changing history.
alter table public.booking_exception_events
  drop constraint if exists booking_exception_events_kind_check;
alter table public.booking_exception_events
  add constraint booking_exception_events_kind_check
  check (kind in ('handoff_refused','return_started','return_completed','dispatch_no_go','group_resolution','offline_reconciled'));
