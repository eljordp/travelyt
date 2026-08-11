export const CUSTODY_CONTROL_CATEGORIES = [
  "acceptance",
  "identity",
  "declarations",
  "seal_integrity",
  "custody_events",
  "transfers",
  "exceptions",
  "training",
  "record_retention",
] as const;

export type CustodyControlCategory =
  (typeof CUSTODY_CONTROL_CATEGORIES)[number];

export type CustodyControlState =
  | "enforced_in_app"
  | "procedure_required"
  | "external_authorization_required";

export type CustodyControl = {
  id: string;
  category: CustodyControlCategory;
  title: string;
  owner: "traveler" | "agent" | "operations" | "carrier" | "legal";
  trigger: string;
  requiredEvidence: readonly string[];
  failClosedOutcome: string;
  retentionClass:
    | "booking_record"
    | "custody_ledger"
    | "exception_record"
    | "personnel_record"
    | "legal_schedule_pending";
  state: CustodyControlState;
  implementationRefs: readonly string[];
};

// These are Travelyt-owned concierge controls. They describe what the product
// must prove, not how TSA, an airline, an airport, or an IAC performs a
// regulated security function.
export const TRAVELYT_CONCIERGE_CONTROLS = [
  {
    id: "TVT-ACC-001",
    category: "acceptance",
    title: "Accept one defined custody leg",
    owner: "operations",
    trigger: "Before payment or manual booking approval",
    requiredEvidence: [
      "departure or arrival service selected as a separate booking",
      "airport, flight number, travel date, bag count, and pickup address",
      "route timing can meet the published handoff target",
    ],
    failClosedOutcome: "Reject or hold the booking before custody assignment.",
    retentionClass: "booking_record",
    state: "enforced_in_app",
    implementationRefs: [
      "src/app/api/bookings/route.ts",
      "src/app/quote/page.tsx",
      "src/lib/service-rules.ts",
    ],
  },
  {
    id: "TVT-ACC-002",
    category: "acceptance",
    title: "Reconcile travelers, bags, and service scope",
    owner: "operations",
    trigger: "Before custody starts and after any group-booking change",
    requiredEvidence: [
      "traveler manifest",
      "each bag assigned to an eligible traveler",
      "manifest bag total equals the physical booking bag count",
    ],
    failClosedOutcome: "Place the booking in manual review; do not start custody.",
    retentionClass: "booking_record",
    state: "enforced_in_app",
    implementationRefs: [
      "src/lib/passengers.ts",
      "src/app/api/bookings/route.ts",
      "simulations/multi-passenger-household-simulation.mjs",
    ],
  },
  {
    id: "TVT-ID-001",
    category: "identity",
    title: "Verify required travelers and the assigned agent",
    owner: "operations",
    trigger: "Before pickup or airport release",
    requiredEvidence: [
      "required adult traveler consent and identity-review status",
      "guardian relationship for minors",
      "assigned agent identity or individual access credential",
    ],
    failClosedOutcome: "Block custody and open an identity or access exception.",
    retentionClass: "booking_record",
    state: "enforced_in_app",
    implementationRefs: [
      "src/lib/passengers.ts",
      "src/lib/driver-access-server.ts",
      "src/app/api/bookings/route.ts",
    ],
  },
  {
    id: "TVT-DEC-001",
    category: "declarations",
    title: "Capture customer declarations without performing screening",
    owner: "traveler",
    trigger: "Before pickup or airport release",
    requiredEvidence: [
      "restricted-item declaration timestamp",
      "coverage election or declared value where applicable",
      "customer acknowledgment that the carrier controls baggage acceptance and screening",
    ],
    failClosedOutcome: "Hold the booking for operations review; do not take custody.",
    retentionClass: "booking_record",
    state: "enforced_in_app",
    implementationRefs: [
      "src/app/quote/page.tsx",
      "src/app/api/bookings/route.ts",
      "src/app/terms/page.tsx",
    ],
  },
  {
    id: "TVT-SEAL-001",
    category: "seal_integrity",
    title: "Bind a unique seal and pickup proof to each custody leg",
    owner: "agent",
    trigger: "At departure pickup before movement begins",
    requiredEvidence: [
      "seal identifier",
      "bag photo",
      "GPS location and capture time",
      "assigned agent",
      "traveler approval before departure handoff",
    ],
    failClosedOutcome: "Do not confirm pickup or proceed to a terminal handoff.",
    retentionClass: "custody_ledger",
    state: "enforced_in_app",
    implementationRefs: [
      "src/app/driver/job/[id]/page.tsx",
      "src/app/api/bookings/route.ts",
      "src/lib/custody.ts",
    ],
  },
  {
    id: "TVT-SEAL-002",
    category: "seal_integrity",
    title: "Fail closed on a missing, mismatched, or compromised seal",
    owner: "agent",
    trigger: "At every physical transfer and recipient confirmation",
    requiredEvidence: [
      "expected seal identifier",
      "observed seal condition",
      "exception reason and containment location when the check fails",
    ],
    failClosedOutcome: "Stop transfer, hold the bag, notify operations, and start the exception trail.",
    retentionClass: "exception_record",
    state: "procedure_required",
    implementationRefs: [
      "src/lib/bookings.ts",
      "src/app/api/admin/bookings/[id]/workflow/route.ts",
      "supabase/migrations/024_traveler_consent_and_ops_exceptions.sql",
    ],
  },
  {
    id: "TVT-EVT-001",
    category: "custody_events",
    title: "Record an append-only event for every custody change",
    owner: "operations",
    trigger: "Whenever possession, location, or custody state changes",
    requiredEvidence: [
      "bag identity and booking identity",
      "event sequence and previous-event hash",
      "actor, time, location, verification method, and proof reference",
    ],
    failClosedOutcome: "Flag reconciliation; the physical transfer is not represented as complete.",
    retentionClass: "custody_ledger",
    state: "enforced_in_app",
    implementationRefs: [
      "src/lib/custody.ts",
      "src/app/api/custody/route.ts",
      "supabase/migrations/019_chain_of_custody.sql",
    ],
  },
  {
    id: "TVT-EVT-002",
    category: "custody_events",
    title: "Reconcile offline proof without silently losing the event",
    owner: "operations",
    trigger: "When connectivity interrupts a custody proof upload",
    requiredEvidence: [
      "locally queued proof",
      "SHA-256 reconciliation digest",
      "authenticated replay result",
      "offline reconciliation exception event",
    ],
    failClosedOutcome: "Keep the proof queued and require reconciliation before closure.",
    retentionClass: "exception_record",
    state: "enforced_in_app",
    implementationRefs: [
      "src/lib/offline-custody.ts",
      "src/app/api/bookings/route.ts",
      "supabase/migrations/025_offline_custody_exception_event.sql",
    ],
  },
  {
    id: "TVT-XFR-001",
    category: "transfers",
    title: "Default departure custody to traveler-present terminal return",
    owner: "agent",
    trigger: "At the terminal after sealed transport",
    requiredEvidence: [
      "ticketed traveler identity match",
      "handoff photo, time, and GPS location",
      "traveler confirmation",
    ],
    failClosedOutcome: "Retain custody under operations direction or start the no-show exception process.",
    retentionClass: "custody_ledger",
    state: "enforced_in_app",
    implementationRefs: [
      "src/lib/handoff-policy.ts",
      "src/app/driver/job/[id]/page.tsx",
      "src/app/api/bookings/route.ts",
    ],
  },
  {
    id: "TVT-XFR-002",
    category: "transfers",
    title: "Gate passenger-absent carrier transfer on explicit authorization",
    owner: "carrier",
    trigger: "Before Travelyt offers a checked bag to a carrier or authorized handler",
    requiredEvidence: [
      "named carrier or authorized handler",
      "written station authorization reference",
      "authorized receiving person's name, organization, and credential or reference",
      "handoff location, cutoff, and access class: public terminal or controlled area",
      "receiving proof and acceptance outcome",
    ],
    failClosedOutcome: "Use traveler-present return; do not record carrier acceptance.",
    retentionClass: "custody_ledger",
    state: "external_authorization_required",
    implementationRefs: [
      "src/lib/handoff-policy.ts",
      "src/app/api/bookings/route.ts",
      "src/lib/rj-readiness.ts",
    ],
  },
  {
    id: "TVT-EXC-001",
    category: "exceptions",
    title: "Contain, explain, and reconcile custody exceptions",
    owner: "operations",
    trigger: "On refusal, mismatch, prohibited item, compromised seal, delay, no-show, or uncertain outcome",
    requiredEvidence: [
      "structured reason code",
      "bag and booking identifiers",
      "actor, timestamp, location, and note",
      "hold, return-start, and return-complete events where applicable",
    ],
    failClosedOutcome: "Stop the normal workflow until operations records a resolution.",
    retentionClass: "exception_record",
    state: "enforced_in_app",
    implementationRefs: [
      "src/app/api/admin/bookings/[id]/workflow/route.ts",
      "src/lib/bookings.ts",
      "supabase/migrations/024_traveler_consent_and_ops_exceptions.sql",
    ],
  },
  {
    id: "TVT-TRN-001",
    category: "training",
    title: "Authorize agents only after role-specific qualification",
    owner: "operations",
    trigger: "Before an agent receives an active custody assignment",
    requiredEvidence: [
      "identity and background-review result",
      "role-specific initial training completion",
      "seal, device, vehicle, exception, and handoff competency checks",
      "recurring training status and revocation path",
    ],
    failClosedOutcome: "Do not issue or keep an active custody credential.",
    retentionClass: "personnel_record",
    state: "procedure_required",
    implementationRefs: [
      "src/app/driver/apply/page.tsx",
      "src/lib/driver-access-server.ts",
      "supabase/migrations/015_driver_access_codes.sql",
    ],
  },
  {
    id: "TVT-RET-001",
    category: "record_retention",
    title: "Retain custody evidence under an approved schedule",
    owner: "legal",
    trigger: "At record creation and booking closure",
    requiredEvidence: [
      "record-class owner",
      "approved minimum retention period",
      "litigation or investigation hold rule",
      "access, export, and defensible-deletion procedure",
    ],
    failClosedOutcome: "Preserve the record; do not run an unapproved deletion job.",
    retentionClass: "legal_schedule_pending",
    state: "procedure_required",
    implementationRefs: [
      "supabase/migrations/019_chain_of_custody.sql",
      "src/lib/backup-ops-server.ts",
    ],
  },
] as const satisfies readonly CustodyControl[];

export const PASSENGER_PRESENT_DEPARTURE_SEQUENCE = [
  "booking_accepted",
  "traveler_identity_cleared",
  "declarations_cleared",
  "sealed_pickup",
  "route_checkpoint",
  "traveler_terminal_return",
  "traveler_confirmation",
] as const;

export const CARRIER_AUTHORIZED_DEPARTURE_SEQUENCE = [
  "booking_accepted",
  "traveler_identity_cleared",
  "declarations_cleared",
  "sealed_pickup",
  "route_checkpoint",
  "carrier_authorization_confirmed",
  "carrier_transfer",
] as const;

export const ARRIVAL_DELIVERY_SEQUENCE = [
  "booking_accepted",
  "traveler_identity_cleared",
  "declarations_cleared",
  "airport_release",
  "route_checkpoint",
  "recipient_delivery",
  "recipient_confirmation",
] as const;

export const IAC_REFERENCE_ANNEX = {
  status: "inactive_reference_only",
  runtimeEnabled: false,
  canEnableWithEnvironmentVariable: false,
  sourceBoundary: "sanitized_public_sources_only",
  currentUses: [
    "control-category inspiration",
    "evidence and audit design",
    "training and exception-program structure",
  ],
  activationGates: [
    "current approval verified for the exact legal entity and locations",
    "IAC security coordinator and counsel approve the proposed operation",
    "affected personnel are formally authorized, trained, and assessed as required",
    "air carrier tender, acceptance, screening, and chain-of-custody path is documented",
    "insurance, records, and incident-response obligations are approved",
    "a separate implementation and promotion decision is signed",
  ],
  prohibitedClaims: [
    "IAC status authorizes passenger checked-baggage acceptance",
    "Travelyt operates under a TSA-approved program",
    "Travelyt personnel are covered automatically by another entity's program",
    "an airline must accept property tendered by Travelyt",
  ],
} as const;

export function iacOperationalLaneEnabled(): false {
  return false;
}
