# Travelyt Concierge Custody Control Specification

**Status:** Internal product specification  
**Authority boundary:** Travelyt-owned controls; no TSA, airport, carrier, or IAC approval claimed  
**Source boundary:** Public regulations and Travelyt implementation evidence only

## Purpose

Travelyt is a third-party concierge custody and evidence layer. It accepts a
defined service booking, verifies the people and declarations required for that
booking, records seal and custody evidence, and completes only the handoff that
the current booking mode permits.

For a standard departure, Travelyt returns the sealed bags to the verified,
ticketed traveler in the public terminal area. The traveler remains responsible
for airline check-in and baggage acceptance. Passenger-absent transfer to a
carrier or authorized handler is a separate mode that stays locked without a
carrier, station, and booking-specific authorization record.

The ORD public-area and receiver gate is recorded in
`docs/custody/ord-public-handoff-fact-check.md`.

Travelyt does not perform or claim screening, secure-area access, airline tag
issuance, airline acceptance, or regulatory approval.

## Control categories

The executable source of truth is
`src/lib/custody-controls.ts`. It contains nine categories:

1. Acceptance
2. Identity
3. Declarations
4. Seal integrity
5. Custody events
6. Transfers
7. Exceptions
8. Training
9. Record retention

Every control names its owner, trigger, required evidence, fail-closed outcome,
retention class, implementation state, and current implementation references.

## Passenger departure flow

### Default: traveler present

1. Accept one departure booking with a reconciled traveler-and-bag manifest.
2. Clear required traveler identity, consent, and customer declarations.
3. Assign only an individually authorized Travelyt agent.
4. At pickup, bind the booking to a seal ID, photo, GPS point, timestamp, and
   assigned agent.
5. Record route checkpoints without representing them as security screening.
6. Return the sealed bags to the identity-matched, ticketed traveler at the
   terminal.
7. Capture traveler receipt confirmation and close the custody leg.

### Optional: carrier authorized

This mode may replace traveler-present return only when the booking contains a
named provider, an authorization reference, and an enabled carrier-handoff
state. The receiving proof must identify the authorized organization and
receiver, location, time, reference, and acceptance outcome. A missing or
ambiguous authorization fails back to traveler-present return; it never creates
carrier acceptance by inference.

## Arrival flow

Arrival is a separate booking and custody leg. Travelyt records airport release
to the assigned agent, sealed movement to the destination, delivery proof, and
recipient confirmation. It is not combined with departure as one booking or
one custody chain.

## Exception behavior

The normal flow stops on a missing or compromised seal, identity mismatch,
prohibited-item declaration problem, receiver mismatch, refusal, missed cutoff,
customer no-show, offline-proof ambiguity, or unknown external outcome.

The minimum exception record is the booking and bag identity, structured reason
code, actor, timestamp, location, note, containment decision, notifications,
and linked return or reconciliation events. No exception is resolved by editing
or deleting a sealed custody event.

## Current implementation map

| Control surface | Current implementation |
|---|---|
| Booking acceptance and timing | `src/app/api/bookings/route.ts`, `src/lib/service-rules.ts` |
| Traveler manifest and identity gates | `src/lib/passengers.ts`, identity API routes |
| Agent access | `src/lib/driver-access-server.ts`, individual hashed access codes |
| Seal and receiving proof | Driver job flow and booking proof API |
| Custody ledger | Per-bag, append-only, hash-chained `custody_events` |
| Offline evidence | IndexedDB proof queue, digest, authenticated replay |
| Carrier authorization | Fail-closed `src/lib/handoff-policy.ts` |
| Exceptions | Structured operational and booking exception ledgers |

## Honest readiness boundary

Application enforcement exists for acceptance, manifest reconciliation,
identity/declaration gating, seal proof, custody logging, authorization-gated
transfer, and structured exceptions.

The following remain operational gates and must not be counted as completed
because a document exists:

- named active agent and backup with completed competency records;
- an approved initial and recurring training program;
- bound insurance for the final operating model;
- an approved retention and legal-hold schedule;
- a timed physical rehearsal with signed after-action evidence;
- written carrier/station authorization for any passenger-absent checked-bag
  transfer.

## Public regulatory references

- [49 CFR 1544.203 — checked baggage acceptance and control](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1544/section-1544.203)
- [49 CFR 1546 — foreign air carrier security](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1546)
- [49 CFR 1548.5 — IAC security-program scope](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1548/section-1548.5)
- [49 CFR 1548.11 — training for IAC security-related duties](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1548/section-1548.11)
- [49 CFR 1548.15 — cargo-access security threat assessments](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1548/section-1548.15)
