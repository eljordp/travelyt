# IAC Applicability Annex

**Status: INACTIVE — REFERENCE ONLY**  
**Classification:** Sanitized internal decision record; contains no restricted
security-program procedures  
**Runtime effect:** None; it cannot be enabled through an environment variable

## Current decision

Travelyt is not being converted into an indirect air carrier, a cargo service,
or a workaround for passenger checked-baggage acceptance. The IAC model is used
only as a reference for mature control categories such as acceptance, personnel
qualification, custody continuity, transfers, exceptions, training, and
records.

The active Travelyt product remains a third-party concierge custody and evidence
layer. Its standard departure service returns sealed bags to the ticketed
traveler before airline check-in. Any future cargo operation would be a separate
service, contract, workflow, record set, and activation decision.

## Information boundary

This annex does not reproduce, summarize, map, or operationalize restricted
IACSSP instructions. Do not add security-program text, screenshots, diagrams,
procedural details, or excerpts to this repository, public documents, ordinary
SharePoint folders, or cloud AI systems.

The product specification uses public regulations and sanitized control names.
If a future regulated operation is evaluated, the current IAC security
coordinator and counsel must maintain any need-to-know instructions in an
approved restricted system outside this repository.

## Allowed present use

- Compare Travelyt's control categories against mature custody-program themes.
- Improve evidence, audit, personnel, exception, and records design.
- Identify questions for counsel, insurers, carriers, handlers, and the IAC
  security coordinator.
- Keep a future lane staged conceptually without exposing it to customers or
  enabling it in production.

## Prohibited present claims

- IAC status authorizes passenger checked-baggage acceptance.
- Travelyt operates under a TSA-approved program.
- Travelyt agents are automatically covered by another entity's program.
- Cargo screening or known-shipper status has been completed for a Travelyt
  booking.
- An airline or handler must accept property tendered by Travelyt.
- The future cargo lane is live, licensed, tested, or insured.

## Required activation evidence

All items must be resolved in writing before a separate implementation may be
designed or promoted:

1. Current approval and renewal evidence for the exact IAC legal entity.
2. Covered business names, locations, facilities, and responsible security
   coordinator.
3. Written counsel and security-coordinator scope analysis for the proposed
   Travelyt service.
4. Formal personnel relationship, authorization, training, and applicable
   Security Threat Assessment evidence.
5. Shipper acceptance, item classification, documentation, screening, transfer,
   and rejection path for the exact operating lane.
6. Air carrier or intermediary contract and tender requirements.
7. Bound insurance, claims, prohibited-items, privacy, records, and incident
   response requirements.
8. Separate staging simulation and signed physical rehearsal.
9. Signed go/no-go decision naming the legal entity, service, locations, owner,
   effective date, and rollback authority.

Until every applicable item is complete, the code-level status remains
`inactive_reference_only` and `iacOperationalLaneEnabled()` always returns
`false`.

