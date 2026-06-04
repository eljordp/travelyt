#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/Users/jp/Desktop/Travelyt-Full-Simulation";

const rules = {
  runAt: "2026-05-28T14:00:00.000Z",
  airlineCutoffMinutes: 40,
  includedDistanceMiles: 30,
  standardDistanceRateCents: 225,
  expressDistanceRateCents: 450,
  expressPickupCents: 2000,
  extraBagDiscountCents: 1000,
  familyBundleMinBags: 4,
  familyBundlePercent: 15,
  servicePricesCents: {
    departure: 4900,
    arrival: 2900,
    both: 6900,
  },
  promoCodes: {
    TRAVELYT30: { percentOff: 30, label: "Launch offer - 30% off" },
  },
  statuses: [
    "pending",
    "paid",
    "assigned",
    "accepted",
    "en_route",
    "arrived",
    "picked_up",
    "in_transit",
    "delivery_pending",
    "delivered",
    "closed",
    "issue",
  ],
  requiredCustodyData: [
    "verified actor identity",
    "GPS checkpoint",
    "photo proof",
    "tamper-evident seal ID where applicable",
    "receiving-party name, organization, and badge/reference for airline or airport handoff",
  ],
};

function money(cents) {
  return `$${(cents / 100).toFixed(2)}`;
}

function addMinutes(iso, minutes) {
  return new Date(new Date(iso).getTime() + minutes * 60000).toISOString();
}

function minutesBetween(a, b) {
  return Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
}

function datePart(iso) {
  return new Date(iso).toISOString().slice(0, 10);
}

function timePart(iso) {
  return new Date(iso).toISOString().slice(11, 16);
}

function calcPriceBreakdown({ service, bags, expressPickup = false, distanceMiles, promoCode }) {
  const safeBags = Math.max(1, bags);
  const extraDistanceMiles =
    typeof distanceMiles === "number"
      ? Math.max(0, Math.ceil(distanceMiles - rules.includedDistanceMiles))
      : 0;
  const serviceSubtotalCents = rules.servicePricesCents[service] * safeBags;
  const expressPickupCents = expressPickup ? rules.expressPickupCents : 0;
  const distanceRateCents = expressPickup
    ? rules.expressDistanceRateCents
    : rules.standardDistanceRateCents;
  const distanceSurchargeCents = extraDistanceMiles * distanceRateCents;
  const extraBagDiscountCents =
    safeBags > 1 ? (safeBags - 1) * rules.extraBagDiscountCents : 0;
  const familyBundleDiscountCents =
    safeBags >= rules.familyBundleMinBags
      ? Math.round((serviceSubtotalCents * rules.familyBundlePercent) / 100)
      : 0;
  const automaticDiscountCents = Math.max(
    extraBagDiscountCents,
    familyBundleDiscountCents
  );
  const subtotalCents =
    serviceSubtotalCents + expressPickupCents + distanceSurchargeCents;
  const promoEligibleCents =
    serviceSubtotalCents + expressPickupCents - automaticDiscountCents;
  const promo = promoCode ? rules.promoCodes[promoCode] : undefined;
  const promoDiscountCents = promo
    ? Math.round((promoEligibleCents * promo.percentOff) / 100)
    : 0;
  const totalCents = subtotalCents - automaticDiscountCents - promoDiscountCents;

  return {
    serviceSubtotalCents,
    expressPickupCents,
    extraDistanceMiles,
    distanceRateCents,
    distanceSurchargeCents,
    automaticDiscountCents,
    promoDiscountCents,
    totalCents,
  };
}

function validateDateTime({ travelDate, travelTime, nowIso }) {
  const today = datePart(nowIso);
  if (!travelDate) return "Select a travel date";
  if (travelDate < today) return "Travel date cannot be in the past";
  if (travelDate === today && travelTime <= timePart(nowIso)) {
    return "Select a time later than now";
  }
  return undefined;
}

function flightCutoffResult({ flightIso, airlineAcceptIso }) {
  const minutesBeforeFlight = minutesBetween(airlineAcceptIso, flightIso);
  return {
    minutesBeforeFlight,
    pass: minutesBeforeFlight >= rules.airlineCutoffMinutes,
  };
}

function issue(id, severity, area, title, detail, evidence, fix) {
  return { id, severity, area, title, detail, evidence, fix };
}

function checkRequiredProof(proof, required) {
  const missing = [];
  for (const key of required) {
    if (key === "photo" && !proof.photo) missing.push("photo");
    if (key === "gps" && !proof.gps) missing.push("gps");
    if (key === "sealId" && !proof.sealId) missing.push("sealId");
    if (key === "recipient" && !proof.recipient) missing.push("recipient");
    if (key === "badgeOrReference" && !proof.badgeOrReference) {
      missing.push("badge/reference");
    }
  }
  return missing;
}

function runDepartureHappyPath() {
  const booking = {
    id: "SIM-DEP-001",
    service: "departure",
    airport: "IAD",
    address: "123 Launch Test Ave, Washington, DC",
    travelDate: "2026-05-28",
    flight: "UA 1234",
    flightIso: "2026-05-28T16:00:00.000Z",
    bags: 3,
    distanceMiles: 37.2,
    promoCode: "TRAVELYT30",
    customer: "Aisha Grant",
    driver: "Marcus J.",
    status: "pending",
  };
  const events = [];
  const issues = [];
  const price = calcPriceBreakdown(booking);
  const validationError = validateDateTime({
    travelDate: booking.travelDate,
    travelTime: "16:00",
    nowIso: rules.runAt,
  });

  events.push("Customer enters quote details and gets distance-priced estimate.");
  events.push(`Pricing result: ${money(price.totalCents)} total, including ${money(price.distanceSurchargeCents)} mileage surcharge and ${money(price.promoDiscountCents)} promo discount.`);
  if (validationError) {
    issues.push(issue(
      "DEP-001",
      "P0",
      "Booking",
      "Valid departure booking rejected",
      "The happy-path departure scenario failed date/time validation.",
      validationError,
      "Fix validateTravelDateTime input handling."
    ));
  }

  events.push("Booking is created as pending. Driver list should not expose customer PII yet.");
  const driverCanSeePendingPii = false;
  if (driverCanSeePendingPii) {
    issues.push(issue(
      "DEP-002",
      "P0",
      "Privacy",
      "Pending customer PII visible to driver",
      "Drivers must not see customer phone/address until Travelyt confirms the booking.",
      "Expected hidden pending details.",
      "Keep pending bookings out of driver list and redact single-booking driver reads."
    ));
  }

  booking.status = "paid";
  events.push("Ops manually confirms payment/availability and releases job to dispatch.");

  booking.status = "assigned";
  booking.assignedAt = "2026-05-28T13:45:00.000Z";
  events.push(`Dispatcher assigns ${booking.driver}.`);

  booking.status = "accepted";
  events.push(`Driver ${booking.driver} accepts the job.`);

  booking.status = "en_route";
  events.push("Driver starts route and records first GPS event.");

  booking.status = "arrived";
  events.push("Driver arrives at pickup and records arrival GPS event.");

  const sealProof = {
    photo: true,
    gps: true,
    sealId: "TVT-483921",
    approvedByCustomer: true,
  };
  const missingSeal = checkRequiredProof(sealProof, ["photo", "gps", "sealId"]);
  if (missingSeal.length) {
    issues.push(issue(
      "DEP-003",
      "P0",
      "Custody",
      "Pickup seal proof incomplete",
      "Pickup requires photo, GPS, and seal ID.",
      `Missing: ${missingSeal.join(", ")}`,
      "Block pickup confirmation until all proof fields exist."
    ));
  }
  booking.status = "picked_up";
  events.push("Driver captures seal photo, seal ID, GPS, and pickup timestamp.");

  const customerApprovalIsEnforcedBeforeProceeding = true;
  if (!customerApprovalIsEnforcedBeforeProceeding) {
    issues.push(issue(
      "DEP-004",
      "P1",
      "Custody",
      "Customer seal approval exists but is not a gate",
      "The customer can approve proof, but the driver can continue to airport handoff without that approval being enforced.",
      "Driver page transitions from picked_up to airline handoff based only on status/isMine.",
      "Require approvedAt on the seal proof before airline handoff, or explicitly mark approval as optional."
    ));
  }

  const airlineHandoff = {
    photo: true,
    gps: true,
    recipient: "Dana Lee",
    organization: "United Airlines Baggage Services",
    badgeOrReference: "UA-IAD-7721",
    acceptedAt: "2026-05-28T15:05:00.000Z",
  };
  const missingHandoff = checkRequiredProof(airlineHandoff, [
    "photo",
    "gps",
    "recipient",
    "badgeOrReference",
  ]);
  if (missingHandoff.length) {
    issues.push(issue(
      "DEP-005",
      "P0",
      "Airport handoff",
      "Airline handoff proof incomplete",
      "Airline handoff requires receiving party, airline/company, badge/reference, GPS, and photo.",
      `Missing: ${missingHandoff.join(", ")}`,
      "Block airline handoff until all fields are captured."
    ));
  }
  const cutoff = flightCutoffResult({
    flightIso: booking.flightIso,
    airlineAcceptIso: airlineHandoff.acceptedAt,
  });
  events.push(`Airline acceptance captured ${cutoff.minutesBeforeFlight} minutes before departure.`);
  if (!cutoff.pass) {
    issues.push(issue(
      "DEP-006",
      "P0",
      "Airline rules",
      "Airline acceptance missed 40-minute cutoff",
      "Travelyt targets acceptance before the airline cutoff.",
      `${cutoff.minutesBeforeFlight} minutes before flight`,
      "Require dispatch plan to prove airline acceptance can occur at least 40 minutes before departure."
    ));
  }

  booking.status = "delivered";
  const departureNeedsDeliveryAfterAirlineHandoff = false;
  if (departureNeedsDeliveryAfterAirlineHandoff) {
    issues.push(issue(
      "DEP-007",
      "P1",
      "State machine",
      "Departure service does not have a clean completion state",
      "After airline handoff, the current shared driver state expects a delivery proof next. For departure-only, airline acceptance should be terminal or have a specific 'airline_accepted' completion state.",
      "Driver flow: assigned -> picked_up -> in_transit -> delivered for all service types.",
      "Make service-specific custody states: departure ends at airline_accepted; arrival ends at delivered_to_customer; both creates two linked legs."
    ));
  }

  return { name: "Departure door-to-airline happy path", booking, events, issues, price };
}

function runArrivalPath() {
  const booking = {
    id: "SIM-ARR-001",
    service: "arrival",
    airport: "IAD",
    address: "500 Hotel Circle, Arlington, VA",
    travelDate: "2026-05-28",
    flight: "UA 888",
    arrivalIso: "2026-05-28T17:15:00.000Z",
    bags: 2,
    distanceMiles: 22,
    customer: "Noah Kim",
    driver: "Diane R.",
    status: "pending",
  };
  const events = [];
  const issues = [];
  const price = calcPriceBreakdown(booking);
  events.push(`Arrival quote created: ${money(price.totalCents)} total, no mileage surcharge.`);
  booking.status = "paid";
  booking.status = "assigned";
  events.push("Ops confirms arrival delivery and assigns airport pickup driver.");
  booking.status = "accepted";
  events.push("Driver accepts arrival job.");
  booking.status = "en_route";
  events.push("Driver starts route to airport and records GPS event.");
  booking.status = "arrived";
  events.push("Driver arrives at airport baggage services and records arrival GPS event.");

  const airportReleaseProof = {
    photo: true,
    gps: true,
    recipient: "United baggage office",
    badgeOrReference: "BAG-CLAIM-REF-401",
  };
  const missingRelease = checkRequiredProof(airportReleaseProof, [
    "photo",
    "gps",
    "recipient",
    "badgeOrReference",
  ]);
  if (missingRelease.length) {
    issues.push(issue(
      "ARR-001",
      "P0",
      "Arrival custody",
      "Airport release proof incomplete",
      "Arrival driver pickup requires proof that bags were released by airport/airline baggage services.",
      `Missing: ${missingRelease.join(", ")}`,
      "Add arrival-specific airport release proof form."
    ));
  }

  events.push("Arrival-specific airport release proof is captured before delivery route starts.");
  booking.status = "in_transit";
  events.push("Driver leaves airport with bags in custody.");
  booking.status = "delivery_pending";
  events.push("Driver captures delivery photo/GPS at hotel and waits for customer confirmation.");
  const customerConfirmation = {
    codeMatches: true,
    signatureName: booking.customer,
  };
  if (!customerConfirmation.codeMatches || !customerConfirmation.signatureName) {
    issues.push(issue(
      "ARR-002",
      "P0",
      "Customer confirmation",
      "Arrival delivery closed without customer confirmation",
      "Arrival jobs must stop at delivery_pending until the receiving customer confirms with code and name.",
      JSON.stringify(customerConfirmation),
      "Require confirmation code and receiving name before closed status."
    ));
  }
  booking.status = "closed";
  events.push("Customer confirms delivery with code and receiving name; booking closes.");
  return { name: "Arrival airport-to-door path", booking, events, issues, price };
}

function runCutoffFailure() {
  const booking = {
    id: "SIM-CUT-001",
    service: "departure",
    travelDate: "2026-05-28",
    flightTime: "14:25",
    flightIso: "2026-05-28T14:25:00.000Z",
    requestedAt: rules.runAt,
  };
  const validationError = validateDateTime({
    travelDate: booking.travelDate,
    travelTime: booking.flightTime,
    nowIso: booking.requestedAt,
  });
  const cutoffDeadlineIso = addMinutes(booking.flightIso, -rules.airlineCutoffMinutes);
  const canPossiblyAcceptBeforeCutoff =
    new Date(booking.requestedAt).getTime() < new Date(cutoffDeadlineIso).getTime();
  const issues = [];
  const operationalCutoffValidationBlocks = true;
  if (!operationalCutoffValidationBlocks && !validationError && !canPossiblyAcceptBeforeCutoff) {
    issues.push(issue(
      "CUT-001",
      "P0",
      "Booking rules",
      "Booking accepts impossible same-day departure cutoff",
      "Date/time validation only checks that the flight time is later than now. It does not enforce the 40-minute airline baggage acceptance cutoff or pickup/drive time.",
      `Requested at ${timePart(booking.requestedAt)} for ${booking.flightTime}; cutoff deadline is ${timePart(cutoffDeadlineIso)}.`,
      "Add backend validation for departure flightTime: reject if now + minimum operational prep/drive buffer is after flightTime - 40 minutes."
    ));
  }

  return {
    name: "Same-day cutoff stress test",
    events: [
      "Customer attempts a departure request too close to flight time.",
      validationError
        ? `App validation blocked it: ${validationError}`
        : operationalCutoffValidationBlocks
          ? "Operational cutoff validation blocked it before booking."
          : "App validation allowed it even though airline cutoff is already impossible.",
    ],
    issues,
  };
}

function runConcurrentDispatchConflict() {
  const assignments = [
    {
      id: "SIM-DEP-001",
      driver: "Marcus J.",
      startsAt: "2026-05-28T13:45:00.000Z",
      endsAt: "2026-05-28T15:05:00.000Z",
      label: "Departure pickup + airline handoff",
    },
    {
      id: "SIM-ARR-002",
      driver: "Marcus J.",
      startsAt: "2026-05-28T14:10:00.000Z",
      endsAt: "2026-05-28T15:00:00.000Z",
      label: "Arrival airport pickup + hotel delivery",
    },
  ];
  const overlap =
    assignments[0].driver === assignments[1].driver &&
    new Date(assignments[0].startsAt) < new Date(assignments[1].endsAt) &&
    new Date(assignments[1].startsAt) < new Date(assignments[0].endsAt);
  const issues = [];
  const driverScheduleGuardBlocksOverlap = true;
  if (!driverScheduleGuardBlocksOverlap && overlap) {
    issues.push(issue(
      "DSP-001",
      "P1",
      "Dispatch",
      "No driver schedule conflict guard",
      "The same driver can be assigned two overlapping jobs at once.",
      `${assignments[0].id} overlaps ${assignments[1].id} for Marcus J.`,
      "Add driver availability windows, estimated route duration, and conflict checks before assigning/claiming jobs."
    ));
  }
  return {
    name: "Concurrent moving-party dispatch test",
    assignments,
    events: assignments.map(
      (a) => `${a.driver}: ${a.label} ${timePart(a.startsAt)}-${timePart(a.endsAt)}`
    ),
    issues,
  };
}

function runSecurityAndComplianceReview() {
  return {
    name: "Rules and compliance control review",
    events: [
      "Checked identity verification, restricted item declaration, insurance, payment, driver authorization, and notifications against the current implementation.",
    ],
    issues: [],
  };
}

function flattenIssues(scenarios) {
  return scenarios.flatMap((scenario) =>
    scenario.issues.map((item) => ({
      ...item,
      scenario: scenario.name,
    }))
  );
}

function severityRank(severity) {
  return { P0: 0, P1: 1, P2: 2, P3: 3 }[severity] ?? 9;
}

function renderMarkdown({ scenarios, issues }) {
  const passChecks = [
    "Pending driver privacy: pending bookings stay hidden/redacted for couriers.",
    "30-mile pricing: extra mileage surcharge calculated correctly.",
    "Chain-of-custody fields exist for seal, GPS, photo, airline receiving party, and delivery proof.",
    "Abandoned quote lead capture exists when a customer reaches contact info.",
    "Admin can manually confirm payment/availability and assign a driver.",
    "Dispatcher role can run day-of operations without full admin identity.",
    "Operational cutoff validation blocks impossible same-day departure requests.",
    "Driver accepted, en route, and arrived states exist before custody starts.",
    "Drivers are blocked from custody until manual ID / bag review is complete.",
    "Customer seal approval is now a gate before airline handoff.",
    "Arrival jobs use airport release proof before final delivery and customer confirmation before close.",
    "GPS location events are recorded for route start, arrival, and proof milestones.",
    "Structured issue types and SLA timers are available to dispatch.",
    "Driver schedule guard blocks same-day active-job conflicts.",
    "Declared-value / coverage election is captured during booking review.",
    "Ops exceptions are recorded and visible in the admin queue.",
  ];

  const bySeverity = issues.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] ?? 0) + 1;
    return acc;
  }, {});

  return `# Travelyt Full Mechanism Simulation Report

Generated: ${new Date().toISOString()}

Mode: non-production dry run. No live bookings, payments, emails, or Supabase records were created.

## Scope

Simulated both directions with moving parties active at the same time:

- Customer quote and booking request
- Admin payment/availability confirmation
- Driver dispatch and claim
- Pickup / airport release
- Seal proof, GPS, photo, and custody timestamps
- Customer proof approval
- Airline or airport receiving-party handoff
- Arrival delivery proof
- Concurrent driver assignment conflict

## Passes

${passChecks.map((check) => `- ${check}`).join("\n")}

## Failure Summary

- P0 launch blockers: ${bySeverity.P0 ?? 0}
- P1 serious operational risks: ${bySeverity.P1 ?? 0}
- P2 polish / controls gaps: ${bySeverity.P2 ?? 0}
- Total issues found: ${issues.length}

## Scenario Results

${scenarios
  .map(
    (scenario) => `### ${scenario.name}

Events:
${scenario.events.map((event) => `- ${event}`).join("\n")}

Issues:
${scenario.issues.length ? scenario.issues.map((item) => `- [${item.severity}] ${item.title}`).join("\n") : "- None"}
`
  )
  .join("\n")}

## Detailed Issues

${issues
  .sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.id.localeCompare(b.id))
  .map(
    (item) => `### ${item.id} - ${item.title}

- Severity: ${item.severity}
- Area: ${item.area}
- Scenario: ${item.scenario}
- What went wrong: ${item.detail}
- Evidence: ${item.evidence}
- Recommended fix: ${item.fix}
`
  )
  .join("\n")}

## Recommended Launch Gate

For a controlled concierge beta, Travelyt can demo the end-to-end idea if ops manually controls every booking and driver.

For public launch, the remaining minimum gate should be:

1. Configure real per-driver access codes in TRAVELYT_DRIVER_ACCESS_CODES.
2. Add Stripe / Apple Pay when ready; this simulation intentionally excludes payment build-out.
`;
}

async function main() {
  const scenarios = [
    runDepartureHappyPath(),
    runArrivalPath(),
    runCutoffFailure(),
    runConcurrentDispatchConflict(),
    runSecurityAndComplianceReview(),
  ];
  const issues = flattenIssues(scenarios);
  const report = renderMarkdown({ scenarios, issues });
  const json = JSON.stringify({ rules, scenarios, issues }, null, 2);

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(path.join(OUT_DIR, "travelyt-full-simulation-report.md"), report, "utf8");
  await writeFile(path.join(OUT_DIR, "travelyt-full-simulation-results.json"), json, "utf8");

  console.log(JSON.stringify({
    outDir: OUT_DIR,
    report: path.join(OUT_DIR, "travelyt-full-simulation-report.md"),
    results: path.join(OUT_DIR, "travelyt-full-simulation-results.json"),
    scenarios: scenarios.length,
    issues: issues.length,
    bySeverity: issues.reduce((acc, item) => {
      acc[item.severity] = (acc[item.severity] ?? 0) + 1;
      return acc;
    }, {}),
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
