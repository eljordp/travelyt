# Agent assignment and acceptance checkpoint

Status: implemented locally; database migration and live verification still required.

This checkpoint covers only dispatcher assignment through verified primary-agent
acceptance. It stops before route start, customer pickup, sealing, custody, and
terminal handoff.

## Dispatcher assignment gate

Dispatch may assign a booking only when:

- the booking is paid and has a payment timestamp;
- the travel date and time are still operationally valid;
- the customer prohibited-item declaration is recorded;
- every traveler in the manifest has the required identity or consent state;
- a primary and a different backup agent are selected;
- both agents have active individual database-backed access;
- both agents have provider-backed Stripe Identity verification plus current
  training, insurance, and vehicle evidence;
- neither selected agent has another active primary or backup assignment on the
  same travel date.

The system writes a private assignment record containing the booking, primary,
backup, dispatcher, assignment time, and acceptance deadline. Replacing an
awaiting assignment requires an audit reason. An accepted assignment cannot be
replaced through this checkpoint.

## Primary-agent acceptance gate

Only the primary agent's individual database-backed session may accept. Before
acceptance, the agent must confirm:

- availability for the assigned date and time;
- assigned device readiness;
- approved seal-kit readiness;
- approved vehicle readiness.

The system rechecks the agent's readiness at acceptance time. It records the
checklist, acceptance timestamp, agent access record, and hashed request/device
signals. The booking moves to `accepted` only after the evidence record is saved.

The primary agent may decline with a required reason. The booking then returns to
the paid dispatch queue. Backup promotion remains a dispatcher action; the backup
cannot silently self-promote.

## Boundaries

- This checkpoint does not claim that training, insurance, identity, or vehicle
  evidence currently exists; missing or expired evidence blocks assignment.
- This checkpoint does not begin physical custody.
- It does not authorize passenger-absent airline handoff or identify a specific
  carrier counter.
- It does not represent TSA, airport, airline, insurer, or legal approval.
