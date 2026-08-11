# ORD Public Handoff Fact Check and Action Gate

**Status:** Public-source operational checkpoint

**Scope:** Airline-neutral Travelyt concierge service at Chicago O'Hare

**Not authorization:** This record does not approve airline baggage acceptance,
secure-area access, or a passenger-absent handoff.

## Decision

Travelyt's default ORD departure handoff remains a return to the verified,
ticketed traveler in the public terminal/ticketing area. An unbadged Travelyt
agent must not enter or operate inside the sterile area, SIDA, airfield, or
another controlled area.

"Safe baggage handler" is not a usable live receiver identity. It may remain a
planning label only. A live carrier-transfer configuration must identify:

- the carrier and authorized handler organization;
- the receiving employee or carrier-approved role;
- the exact terminal, counter, door, or other station-defined point;
- whether that point is public or controlled;
- the station authorization reference and cutoff;
- receiver name plus a limited credential/badge or station reference;
- time, GPS location, handoff photo, acceptance result, and exception path.

If any field is missing, the app stays in traveler-present return mode.

## Public-source findings

| Question | Verified finding | Travelyt action |
|---|---|---|
| Can an unbadged agent enter a controlled ORD area? | No general right exists. CDA badges are access-control credentials for airfield and secure areas. A company seeking controlled-area access needs an operational need and airport/tenant sponsorship. | Keep the standard handoff in the public terminal. Treat controlled-area access as a separate airport/tenant-sponsored project. |
| Who can receive checked baggage for a U.S. aircraft operator? | The operator must ensure checked baggage is received by its authorized representative and controlled under its security program. | Do not treat an unnamed handler or uniform as authorization. Require the carrier/station record and receiving proof. |
| Who owns screening? | Federal law and the applicable carrier security program assign passenger/property screening to TSA or an authorized regulated screening party. | Travelyt records custody and transfer only. It never records a Travelyt "screening complete" event. |
| Does the same public rule prove RJ will accept a passenger-absent bag? | No. Foreign carriers operate under their TSA-accepted security programs, and the public regulation does not reveal RJ's station procedure. | Obtain RJ's written ORD procedure before enabling the carrier-transfer mode. |

## Action checkpoint

1. Obtain the carrier/station answer naming the receiving organization, role,
   location, cutoff, and rejection path.
2. Classify the location as public terminal or controlled/sterile/SIDA.
3. If controlled, stop: airport/tenant sponsorship and badging or a documented
   authorized escort procedure must be resolved before rehearsal.
4. Configure the carrier overlay only after counsel and operations approve the
   written answer.
5. Run a timed dummy-bag rehearsal and capture the same receiving evidence the
   live app will require.

## Public references

- [49 CFR 1544.203, checked-baggage acceptance and screening](https://www.ecfr.gov/current/title-49/subtitle-B/chapter-XII/subchapter-C/part-1544/section-1544.203)
- [49 CFR 1546.203, foreign-air-carrier checked baggage](https://www.govinfo.gov/content/pkg/CFR-2025-title49-vol9/pdf/CFR-2025-title49-vol9-sec1546-203.pdf)
- [Chicago Department of Aviation ORD badging procedures](https://badging.flychicago.com/ohare/compliance/Pages/default.aspx)
- [Chicago Department of Aviation new-company sponsorship](https://badging.flychicago.com/ohare/compliance/Pages/new-companies.aspx)
- [TSA travel and screening guidance](https://www.tsa.gov/news/press/factsheets/tsa-travel-tips)

Only public sources are summarized here. No SSI or restricted security-program
material belongs in this file or repository.
