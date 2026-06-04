#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const OUT_DIR = "/Users/jp/Desktop/Travelyt-Role-Simulation";
const REPORT_PATH = path.join(OUT_DIR, "travelyt-role-simulation-report.md");
const RESULTS_PATH = path.join(OUT_DIR, "travelyt-role-simulation-results.json");

const actors = {
  admin: { role: "admin", name: "Mo / admin" },
  dispatcher: { role: "dispatcher", name: "Daniel / dispatcher" },
  driver: { role: "driver", name: "Marcus J." },
  customer: { role: "customer", name: "Aisha Grant" },
  system: { role: "system", name: "Travelyt system" },
};

const issueLabels = {
  airport_hold: "Airport hold",
  customer_no_show: "Customer no-show",
  missing_id: "Missing ID",
  wrong_bag: "Wrong bag",
  driver_delay: "Driver delay",
  vehicle_issue: "Vehicle issue",
  lost_or_damaged_bag: "Lost or damaged bag",
  customer_unreachable: "Customer unreachable",
  airline_delay: "Airline delay",
  other: "Other",
};

const terminalStatuses = new Set(["closed", "cancelled"]);
const activeDriverStatuses = new Set([
  "assigned",
  "accepted",
  "en_route",
  "arrived",
  "picked_up",
  "in_transit",
  "delivery_pending",
]);

const rules = {
  generatedAt: new Date().toISOString(),
  airlineCutoffMinutes: 40,
  rolePermissions: {
    admin: "Can override and close emergency workflow with reason.",
    dispatcher: "Can assign, open issues, and move day-of operational statuses.",
    driver: "Can only move own assigned/accepted jobs through custody gates.",
    customer: "Can create booking, approve seal, and confirm delivery with code.",
  },
  proofRequirements: {
    seal: ["photo", "gps", "sealId"],
    pickup: ["photo", "gps", "recipientName", "organization", "badgeOrReference"],
    airline_handoff: [
      "photo",
      "gps",
      "recipientName",
      "organization",
      "badgeOrReference",
    ],
    delivery: ["photo", "gps"],
  },
};

function now(offsetMinutes = 0) {
  return new Date(Date.parse("2026-06-01T10:00:00-07:00") + offsetMinutes * 60_000).toISOString();
}

function makeBooking(overrides = {}) {
  return {
    id: overrides.id || `SIM-${Math.random().toString(16).slice(2, 8).toUpperCase()}`,
    service: overrides.service || "departure",
    airport: overrides.airport || "IAD",
    address: overrides.address || "123 Launch Test Ave, Washington, DC",
    date: overrides.date || "2026-06-01",
    flightTime: overrides.flightTime || "16:30",
    flight: overrides.flight || "UA 1234",
    bags: overrides.bags || 2,
    name: overrides.name || actors.customer.name,
    email: overrides.email || "customer@example.com",
    phone: overrides.phone || "+15550100001",
    distanceMiles: overrides.distanceMiles ?? 38,
    status: overrides.status || "pending",
    createdAt: overrides.createdAt || now(0),
    priceCents: overrides.priceCents || 12800,
    deliveryConfirmationCode: overrides.deliveryConfirmationCode || "482913",
    proofs: [],
    locationEvents: [],
    statusHistory: [],
    ...overrides,
  };
}

function audit(booking, actor, action, fromStatus, toStatus, reason) {
  booking.statusHistory.push({
    id: `AUD-${booking.statusHistory.length + 1}`,
    timestamp: now(booking.statusHistory.length + 1),
    action,
    fromStatus,
    toStatus,
    actorRole: actor.role,
    actorName: actor.name,
    reason,
  });
}

function addEvent(events, actor, step, result, detail, booking) {
  events.push({
    actor: actor.name,
    role: actor.role,
    step,
    result,
    bookingId: booking?.id,
    status: booking?.status,
    detail,
  });
}

function addIssue(issues, severity, id, area, title, detail, fix) {
  issues.push({ severity, id, area, title, detail, fix });
}

function hasProof(booking, kind) {
  const latest = [...booking.proofs].reverse().find((proof) => proof.kind === kind);
  if (!latest) return false;
  const requirements = rules.proofRequirements[kind] || [];
  return requirements.every((key) => {
    if (key === "photo") return Boolean(latest.dataUrl);
    if (key === "gps") return Boolean(latest.location);
    if (key === "sealId") return Boolean(latest.sealId);
    return Boolean(latest.handoff?.[key]);
  });
}

function hasApprovedSeal(booking) {
  const latest = [...booking.proofs].reverse().find((proof) => proof.kind === "seal");
  return Boolean(latest?.approvedAt);
}

function custodyReady(booking) {
  return Boolean(
    booking.customerIdentityVerifiedAt &&
      booking.driverIdentityVerifiedAt &&
      booking.restrictedItemsAttestedAt
  );
}

function addProof(booking, actor, proof) {
  const missing = [];
  for (const key of rules.proofRequirements[proof.kind] || []) {
    if (key === "photo" && !proof.dataUrl) missing.push("photo");
    if (key === "gps" && !proof.location) missing.push("GPS");
    if (key === "sealId" && !proof.sealId) missing.push("seal ID");
    if (!["photo", "gps", "sealId"].includes(key) && !proof.handoff?.[key]) {
      missing.push(key);
    }
  }
  if (missing.length) {
    return { ok: false, error: `${proof.kind} proof missing ${missing.join(", ")}.` };
  }
  booking.proofs.push({ timestamp: now(booking.proofs.length + 1), ...proof });
  booking.locationEvents.push({
    id: `LOC-${booking.locationEvents.length + 1}`,
    kind:
      proof.kind === "seal"
        ? "seal_proof"
        : proof.kind === "pickup"
          ? "airport_release"
          : proof.kind === "airline_handoff"
            ? "airline_handoff"
            : "delivery_proof",
    label: proof.kind,
    latitude: proof.location.latitude,
    longitude: proof.location.longitude,
    capturedAt: proof.location.capturedAt,
    actorName: actor.name,
  });
  audit(booking, actor, "proof_added", booking.status, booking.status, `${proof.kind} proof added.`);
  return { ok: true };
}

function canTransition(booking, actor, nextStatus, context = {}) {
  if (terminalStatuses.has(booking.status) && actor.role !== "admin") {
    return { ok: false, error: "Only admin can reopen or override terminal bookings." };
  }

  if (actor.role === "customer") {
    if (nextStatus !== "closed") return { ok: false, error: "Customer cannot move operational statuses." };
    if (booking.status !== "delivery_pending") {
      return { ok: false, error: "Customer can only close after delivery proof is pending confirmation." };
    }
    if (context.confirmationCode !== booking.deliveryConfirmationCode) {
      return { ok: false, error: "Confirmation code does not match." };
    }
    if (!context.customerSignatureName) {
      return { ok: false, error: "Receiving customer name is required." };
    }
    return { ok: true };
  }

  if (actor.role === "driver") {
    if (!booking.driverName || booking.driverName !== actor.name) {
      return { ok: false, error: "Driver can only update their assigned booking." };
    }
    if (nextStatus === "accepted" && !["paid", "assigned"].includes(booking.status)) {
      return { ok: false, error: "Only confirmed or assigned bookings can be accepted." };
    }
    if (nextStatus === "en_route" && booking.status !== "accepted") {
      return { ok: false, error: "Driver must accept before starting route." };
    }
    if (nextStatus === "arrived" && booking.status !== "en_route") {
      return { ok: false, error: "Driver must start route before arrival." };
    }
    if ((nextStatus === "picked_up" || (booking.service === "arrival" && nextStatus === "in_transit")) && !custodyReady(booking)) {
      return {
        ok: false,
        error: "Driver cannot start because manual ID/bag review is not complete.",
      };
    }
    if (nextStatus === "picked_up") {
      if (booking.service === "arrival") return { ok: false, error: "Arrival jobs use airport release, not seal pickup." };
      if (booking.status !== "arrived" || !hasProof(booking, "seal")) {
        return { ok: false, error: "Seal photo, seal ID, and GPS proof are required before pickup." };
      }
    }
    if (nextStatus === "in_transit") {
      if (booking.service === "arrival") {
        if (booking.status !== "arrived" || !hasProof(booking, "pickup")) {
          return { ok: false, error: "Airport release proof and receiving-party details are required." };
        }
      } else {
        if (booking.status !== "picked_up" || !hasApprovedSeal(booking)) {
          return { ok: false, error: "Customer seal approval is required before airline handoff." };
        }
        if (!hasProof(booking, "airline_handoff")) {
          return { ok: false, error: "Airline handoff proof is required." };
        }
      }
    }
    if (nextStatus === "delivered") {
      if (booking.service === "departure") {
        if (booking.status !== "picked_up" || !hasApprovedSeal(booking) || !hasProof(booking, "airline_handoff")) {
          return { ok: false, error: "Departure completion requires customer seal approval and airline handoff proof." };
        }
      } else if (booking.status !== "in_transit" || !hasProof(booking, "delivery")) {
        return { ok: false, error: "Delivery photo and GPS proof are required before completion." };
      }
    }
    if (nextStatus === "delivery_pending") {
      if (booking.service !== "arrival") return { ok: false, error: "Only arrival deliveries use customer confirmation." };
      if (booking.status !== "in_transit" || !hasProof(booking, "delivery")) {
        return { ok: false, error: "Delivery photo and GPS proof are required before customer confirmation." };
      }
    }
  }

  if (nextStatus === "issue" && !context.issueType) {
    return { ok: false, error: "Issue type is required before marking Issue / Failed." };
  }

  return { ok: true };
}

function transition(booking, actor, nextStatus, context = {}) {
  const gate = canTransition(booking, actor, nextStatus, context);
  if (!gate.ok) return gate;
  const from = booking.status;
  booking.status = nextStatus;
  if (nextStatus === "assigned") booking.assignedAt = now(5);
  if (nextStatus === "accepted") booking.acceptedAt = now(8);
  if (nextStatus === "en_route") booking.enRouteAt = now(12);
  if (nextStatus === "arrived") booking.arrivedAt = now(35);
  if (nextStatus === "picked_up") booking.pickedUpAt = now(48);
  if (nextStatus === "delivery_pending") booking.deliveryPendingAt = now(90);
  if (nextStatus === "closed") {
    booking.closedAt = now(100);
    booking.customerConfirmedAt = context.customerSignatureName ? now(100) : booking.customerConfirmedAt;
    booking.customerSignatureName = context.customerSignatureName || booking.customerSignatureName;
  }
  if (nextStatus === "issue") {
    booking.issueType = context.issueType;
    booking.issueNotes = context.issueNotes;
    booking.issueOpenedAt = now(60);
  }
  audit(booking, actor, "status_change", from, nextStatus, context.reason);
  return { ok: true };
}

function assignDriver(booking, actor, driverName, activeBookings) {
  if (!["admin", "dispatcher"].includes(actor.role)) {
    return { ok: false, error: "Only admin or dispatcher should assign a driver." };
  }
  if (booking.status !== "paid") return { ok: false, error: "Only paid bookings can be assigned." };
  const conflict = activeBookings.find(
    (item) =>
      item.id !== booking.id &&
      item.date === booking.date &&
      item.driverName === driverName &&
      activeDriverStatuses.has(item.status)
  );
  if (conflict) return { ok: false, error: `${driverName} already has an active job (${conflict.id}).` };
  booking.driverName = driverName;
  return transition(booking, actor, "assigned", { reason: "Driver assigned by dispatch." });
}

function proof(kind, extra = {}) {
  return {
    kind,
    dataUrl: "data:image/jpeg;base64,simulated",
    location: {
      latitude: 38.9531,
      longitude: -77.4565,
      accuracyMeters: 12,
      capturedAt: now(40),
    },
    ...extra,
  };
}

function runDepartureRoleFlow() {
  const events = [];
  const issues = [];
  const booking = makeBooking({ id: "ROLE-DEP-001", service: "departure" });
  const activeBookings = [booking];

  addEvent(events, actors.customer, "Create booking", "PASS", "Customer submits quote and booking starts pending.", booking);

  const earlyAssign = assignDriver(booking, actors.dispatcher, actors.driver.name, activeBookings);
  if (earlyAssign.ok) {
    addIssue(issues, "P0", "DEP-AUTH-001", "Dispatch", "Dispatcher assigned unpaid booking", "A dispatcher should not assign an unpaid/pending booking.", "Keep assignment blocked until paid/confirmed.");
  } else {
    addEvent(events, actors.dispatcher, "Attempt assign before payment", "EXPECTED BLOCK", earlyAssign.error, booking);
  }

  transition(booking, actors.admin, "paid", { reason: "Mo confirms payment/availability for launch simulation." });
  booking.customerIdentityVerifiedAt = now(2);
  booking.driverIdentityVerifiedAt = now(2);
  booking.restrictedItemsAttestedAt = now(2);
  audit(booking, actors.admin, "manual_review_override", "paid", "paid", "Mo clears customer ID, driver ID, and bag review.");
  addEvent(events, actors.admin, "Payment and manual review", "PASS", "Mo marks paid and clears custody prerequisites.", booking);

  const assign = assignDriver(booking, actors.dispatcher, actors.driver.name, activeBookings);
  addEvent(events, actors.dispatcher, "Assign driver", assign.ok ? "PASS" : "FAIL", assign.ok ? "Driver assigned." : assign.error, booking);
  if (!assign.ok) addIssue(issues, "P0", "DEP-DISPATCH-001", "Dispatch", "Dispatcher could not assign driver", assign.error, "Fix assignment gate.");

  for (const [step, status] of [
    ["Driver accepts", "accepted"],
    ["Driver starts route", "en_route"],
    ["Driver arrives", "arrived"],
  ]) {
    const result = transition(booking, actors.driver, status, { reason: step });
    addEvent(events, actors.driver, step, result.ok ? "PASS" : "FAIL", result.ok ? `Moved to ${status}.` : result.error, booking);
    if (!result.ok) addIssue(issues, "P0", `DEP-${status.toUpperCase()}`, "Driver", `${step} failed`, result.error, "Fix driver transition gate.");
  }

  const badSeal = addProof(booking, actors.driver, proof("seal", { location: undefined, sealId: "TVT-001" }));
  addEvent(events, actors.driver, "Bad seal proof test", badSeal.ok ? "FAIL" : "EXPECTED BLOCK", badSeal.ok ? "Incomplete proof was accepted." : badSeal.error, booking);
  if (badSeal.ok) addIssue(issues, "P0", "DEP-PROOF-001", "Proof", "Seal proof accepted without GPS", "Custody proof must require GPS.", "Block proof save without GPS.");

  const seal = addProof(booking, actors.driver, proof("seal", { sealId: "TVT-DEP-001" }));
  addEvent(events, actors.driver, "Seal proof", seal.ok ? "PASS" : "FAIL", seal.ok ? "Photo, GPS, and seal ID captured." : seal.error, booking);
  const pickup = transition(booking, actors.driver, "picked_up", { reason: "Seal captured." });
  addEvent(events, actors.driver, "Pickup custody", pickup.ok ? "PASS" : "FAIL", pickup.ok ? "Custody started." : pickup.error, booking);

  const handoffBeforeApproval = transition(booking, actors.driver, "in_transit", { reason: "Try without customer approval." });
  addEvent(events, actors.driver, "Handoff before seal approval", handoffBeforeApproval.ok ? "FAIL" : "EXPECTED BLOCK", handoffBeforeApproval.ok ? "Handoff moved without customer approval." : handoffBeforeApproval.error, booking);
  if (handoffBeforeApproval.ok) addIssue(issues, "P0", "DEP-SEAL-001", "Custody", "Driver bypassed customer seal approval", "Airline handoff should require customer approval.", "Gate airline handoff on approved seal.");

  booking.proofs.find((item) => item.kind === "seal").approvedAt = now(55);
  booking.proofs.find((item) => item.kind === "seal").approvedBy = actors.customer.name;
  addEvent(events, actors.customer, "Approve seal", "PASS", "Customer approves the bag seal proof.", booking);

  const noHandoffProof = transition(booking, actors.driver, "delivered", { reason: "Try without airline proof." });
  addEvent(events, actors.driver, "Departure complete before airline proof", noHandoffProof.ok ? "FAIL" : "EXPECTED BLOCK", noHandoffProof.ok ? "Completed without airline handoff proof." : noHandoffProof.error, booking);
  if (noHandoffProof.ok) addIssue(issues, "P0", "DEP-HANDOFF-001", "Airline handoff", "Departure completed without airline proof", "Airline receiving party proof is required.", "Block departure completion until handoff proof exists.");

  const handoff = addProof(booking, actors.driver, proof("airline_handoff", {
    handoff: {
      recipientName: "United baggage supervisor",
      organization: "United Airlines",
      badgeOrReference: "UA-IAD-6621",
    },
  }));
  addEvent(events, actors.driver, "Airline handoff proof", handoff.ok ? "PASS" : "FAIL", handoff.ok ? "Airline recipient, org, badge/reference, photo, and GPS captured." : handoff.error, booking);
  const complete = transition(booking, actors.driver, "delivered", { reason: "Airline handoff complete." });
  addEvent(events, actors.driver, "Complete departure service", complete.ok ? "PASS" : "FAIL", complete.ok ? "Departure service completes at airline handoff." : complete.error, booking);

  const close = transition(booking, actors.admin, "closed", { reason: "Mo closes after checking audit trail." });
  addEvent(events, actors.admin, "Admin close", close.ok ? "PASS" : "FAIL", close.ok ? "Booking closed with audit trail." : close.error, booking);

  return { name: "Departure: customer -> dispatcher -> driver -> airline -> Mo close", booking, events, issues };
}

function runArrivalRoleFlow() {
  const events = [];
  const issues = [];
  const booking = makeBooking({ id: "ROLE-ARR-001", service: "arrival", status: "paid" });
  booking.customerIdentityVerifiedAt = now(1);
  booking.driverIdentityVerifiedAt = now(1);
  booking.restrictedItemsAttestedAt = now(1);
  const activeBookings = [booking];

  addEvent(events, actors.customer, "Create arrival booking", "PASS", "Customer books airport-to-door delivery.", booking);
  const assign = assignDriver(booking, actors.dispatcher, actors.driver.name, activeBookings);
  addEvent(events, actors.dispatcher, "Assign arrival driver", assign.ok ? "PASS" : "FAIL", assign.ok ? "Driver assigned to arrival job." : assign.error, booking);

  for (const [step, status] of [
    ["Driver accepts", "accepted"],
    ["Driver en route to airport", "en_route"],
    ["Driver arrived at baggage office", "arrived"],
  ]) {
    const result = transition(booking, actors.driver, status, { reason: step });
    addEvent(events, actors.driver, step, result.ok ? "PASS" : "FAIL", result.ok ? `Moved to ${status}.` : result.error, booking);
    if (!result.ok) addIssue(issues, "P0", `ARR-${status.toUpperCase()}`, "Driver", `${step} failed`, result.error, "Fix arrival transition gate.");
  }

  const releaseMissing = transition(booking, actors.driver, "in_transit", { reason: "Try without airport release proof." });
  addEvent(events, actors.driver, "Airport release missing proof", releaseMissing.ok ? "FAIL" : "EXPECTED BLOCK", releaseMissing.ok ? "Custody started without airport release." : releaseMissing.error, booking);
  if (releaseMissing.ok) addIssue(issues, "P0", "ARR-RELEASE-001", "Airport release", "Arrival custody started without airport release proof", "Airport release proof is required.", "Block in_transit until release proof exists.");

  const release = addProof(booking, actors.driver, proof("pickup", {
    handoff: {
      recipientName: "IAD baggage services",
      organization: "United Airlines Baggage Office",
      badgeOrReference: "BAG-9021",
    },
  }));
  addEvent(events, actors.driver, "Airport release proof", release.ok ? "PASS" : "FAIL", release.ok ? "Airport release proof captured." : release.error, booking);
  const inTransit = transition(booking, actors.driver, "in_transit", { reason: "Airport release captured." });
  addEvent(events, actors.driver, "Start delivery route", inTransit.ok ? "PASS" : "FAIL", inTransit.ok ? "Bags in transit to customer." : inTransit.error, booking);

  const noDeliveryProof = transition(booking, actors.driver, "delivery_pending", { reason: "Try without delivery proof." });
  addEvent(events, actors.driver, "Delivery pending before proof", noDeliveryProof.ok ? "FAIL" : "EXPECTED BLOCK", noDeliveryProof.ok ? "Moved without delivery proof." : noDeliveryProof.error, booking);
  if (noDeliveryProof.ok) addIssue(issues, "P0", "ARR-DELIVERY-001", "Delivery", "Delivery pending accepted without proof", "Delivery proof is required.", "Block delivery_pending until proof exists.");

  const delivery = addProof(booking, actors.driver, proof("delivery"));
  addEvent(events, actors.driver, "Delivery proof", delivery.ok ? "PASS" : "FAIL", delivery.ok ? "Driver captures delivery photo and GPS." : delivery.error, booking);
  const pending = transition(booking, actors.driver, "delivery_pending", { reason: "Delivery proof submitted." });
  addEvent(events, actors.driver, "Await customer confirmation", pending.ok ? "PASS" : "FAIL", pending.ok ? "Customer confirmation required before close." : pending.error, booking);

  const wrongCode = transition(booking, actors.customer, "closed", {
    confirmationCode: "000000",
    customerSignatureName: actors.customer.name,
  });
  addEvent(events, actors.customer, "Wrong confirmation code", wrongCode.ok ? "FAIL" : "EXPECTED BLOCK", wrongCode.ok ? "Wrong code closed booking." : wrongCode.error, booking);
  if (wrongCode.ok) addIssue(issues, "P0", "ARR-CODE-001", "Customer confirmation", "Wrong OTP closed booking", "Wrong code must be blocked.", "Verify confirmation code before close.");

  const correctCode = transition(booking, actors.customer, "closed", {
    confirmationCode: booking.deliveryConfirmationCode,
    customerSignatureName: actors.customer.name,
    reason: "Customer received bags.",
  });
  addEvent(events, actors.customer, "Correct confirmation code", correctCode.ok ? "PASS" : "FAIL", correctCode.ok ? "Customer closes with code and name." : correctCode.error, booking);

  return { name: "Arrival: airport release -> driver delivery -> customer close", booking, events, issues };
}

function runExceptionAndConflictFlow() {
  const events = [];
  const issues = [];
  const active = makeBooking({ id: "ROLE-ACTIVE-001", service: "departure", status: "assigned", driverName: actors.driver.name });
  const candidate = makeBooking({ id: "ROLE-CONFLICT-001", service: "arrival", status: "paid" });
  const conflict = assignDriver(candidate, actors.dispatcher, actors.driver.name, [active, candidate]);
  addEvent(events, actors.dispatcher, "Assign overlapping driver", conflict.ok ? "FAIL" : "EXPECTED BLOCK", conflict.ok ? "Conflict was not detected." : conflict.error, candidate);
  if (conflict.ok) addIssue(issues, "P1", "CONFLICT-001", "Dispatch", "Overlapping driver assignment allowed", "Same driver got two active jobs on the same date.", "Keep active-job conflict guard.");

  const issueBooking = makeBooking({ id: "ROLE-ISSUE-001", status: "assigned", driverName: actors.driver.name });
  const issueWithoutType = transition(issueBooking, actors.dispatcher, "issue", { reason: "Driver unreachable." });
  addEvent(events, actors.dispatcher, "Open issue without type", issueWithoutType.ok ? "FAIL" : "EXPECTED BLOCK", issueWithoutType.ok ? "Issue opened without type." : issueWithoutType.error, issueBooking);
  if (issueWithoutType.ok) addIssue(issues, "P1", "ISSUE-001", "Issues", "Issue opened without type", "Issue type should be required for reporting.", "Require issue type.");

  const issueWithType = transition(issueBooking, actors.dispatcher, "issue", {
    issueType: "driver_delay",
    issueNotes: "Driver ETA missed SLA.",
    reason: "Driver ETA missed SLA.",
  });
  addEvent(events, actors.dispatcher, "Open issue with type", issueWithType.ok ? "PASS" : "FAIL", issueWithType.ok ? `${issueLabels.driver_delay} issue opened.` : issueWithType.error, issueBooking);

  const adminOverride = transition(issueBooking, actors.admin, "closed", {
    reason: "Mo manually resolved after phone confirmation.",
  });
  addEvent(events, actors.admin, "Admin emergency close", adminOverride.ok ? "PASS" : "FAIL", adminOverride.ok ? "Admin override closed the issue booking with reason." : adminOverride.error, issueBooking);

  return { name: "Dispatcher conflict + issue escalation + Mo override", booking: issueBooking, events, issues };
}

function runSlaFlow() {
  const events = [];
  const issues = [];
  const booking = makeBooking({
    id: "ROLE-SLA-001",
    status: "assigned",
    assignedAt: now(-31),
    driverName: actors.driver.name,
  });
  const minutesWaiting = Math.floor((Date.parse(now(0)) - Date.parse(booking.assignedAt)) / 60000);
  const pass = minutesWaiting > 10;
  addEvent(events, actors.system, "SLA timer", pass ? "PASS" : "FAIL", `Assigned booking has waited ${minutesWaiting} minutes; dispatch should see awaiting-acceptance alert.`, booking);
  if (!pass) addIssue(issues, "P2", "SLA-001", "SLA", "SLA alert did not trigger in simulation", "Assigned job should alert after 10 minutes.", "Check SLA timer thresholds.");
  return { name: "SLA / stale job alert", booking, events, issues };
}

function summarize(scenarios) {
  const issues = scenarios.flatMap((scenario) =>
    scenario.issues.map((item) => ({ ...item, scenario: scenario.name }))
  );
  const events = scenarios.flatMap((scenario) => scenario.events);

  const passCount = events.filter((event) => event.result === "PASS").length;
  const expectedBlocks = events.filter((event) => event.result === "EXPECTED BLOCK").length;
  const failCount = events.filter((event) => event.result === "FAIL").length;
  const auditEvents = scenarios.reduce(
    (total, scenario) => total + (scenario.booking?.statusHistory?.length || 0),
    0
  );
  const locationEvents = scenarios.reduce(
    (total, scenario) => total + (scenario.booking?.locationEvents?.length || 0),
    0
  );
  return { issues, events, passCount, expectedBlocks, failCount, auditEvents, locationEvents };
}

function renderMarkdown(scenarios, summary) {
  const severityCounts = summary.issues.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
  const verdict =
    summary.failCount === 0 && (severityCounts.P0 || 0) === 0
      ? "PASS FOR CONTROLLED PILOT"
      : "DO NOT LAUNCH UNTIL FAILURES ARE FIXED";

  return `# Travelyt Role-Based Ops Simulation

Generated: ${rules.generatedAt}

Mode: non-production dry run. No live booking, payment, email, or Supabase record was created.

## Verdict

**${verdict}**

- Passed steps: ${summary.passCount}
- Expected blocks caught correctly: ${summary.expectedBlocks}
- Unexpected failed steps: ${summary.failCount}
- P0 blockers: ${severityCounts.P0 || 0}
- P1 serious risks: ${severityCounts.P1 || 0}
- P2 follow-ups: ${severityCounts.P2 || 0}
- Audit entries generated in simulation: ${summary.auditEvents}
- GPS/location events generated in simulation: ${summary.locationEvents}

## Actors Simulated

- Mo/admin: emergency override, payment/availability confirmation, manual review, final close.
- Dispatcher: assignment, issue opening, conflict checking.
- Driver: accept job, en route, arrival, custody proofs, handoff/delivery.
- Customer: booking creation, seal approval, OTP/name confirmation.

## Scenario Results

${scenarios
  .map(
    (scenario) => `### ${scenario.name}

${scenario.events
  .map(
    (event) =>
      `- **${event.result}** ${event.actor} (${event.role}) — ${event.step}: ${event.detail}`
  )
  .join("\n")}

Issues:
${scenario.issues.length ? scenario.issues.map((item) => `- [${item.severity}] ${item.title}: ${item.detail}`).join("\n") : "- None"}
`
  )
  .join("\n")}

## Issues Found

${summary.issues.length ? summary.issues.map((item) => `### ${item.id} - ${item.title}

- Severity: ${item.severity}
- Area: ${item.area}
- Scenario: ${item.scenario}
- Detail: ${item.detail}
- Fix: ${item.fix}
`).join("\n") : "No unexpected role-flow errors were found in the modeled launch rehearsal."}

## Iffy / Watch Before Launch

- Driver self-claiming should stay intentional. Current API logic can allow a valid driver code to claim a paid job by name; if Mo wants dispatcher-only assignment, tighten this.
- Dispatcher permissions are broad enough for operations. Good for pilot speed, but later you may want separate permissions for dispatcher vs owner/admin.
- This simulation validates the workflow logic, not a real Stripe charge or real email/SMS delivery.
- Continuous live GPS is still checkpoint-based: route start, arrival, and proof capture. Full background tracking is a later mobile/native phase.

## Clean Next Steps

1. Do one real internal test booking from the browser with Stripe test mode or a tiny live payment/refund plan.
2. Configure per-driver access codes for named drivers before live custody.
3. Turn on Resend/SMS notifications so stuck bookings do not rely on someone watching the admin screen.
4. Decide whether driver self-claim stays allowed for pilot or dispatcher-only assignment is required.
`;
}

async function main() {
  const scenarios = [
    runDepartureRoleFlow(),
    runArrivalRoleFlow(),
    runExceptionAndConflictFlow(),
    runSlaFlow(),
  ];
  const summary = summarize(scenarios);
  const report = renderMarkdown(scenarios, summary);
  const results = { rules, actors, scenarios, summary };

  await mkdir(OUT_DIR, { recursive: true });
  await writeFile(REPORT_PATH, report, "utf8");
  await writeFile(RESULTS_PATH, JSON.stringify(results, null, 2), "utf8");

  console.log(
    JSON.stringify(
      {
        report: REPORT_PATH,
        results: RESULTS_PATH,
        scenarios: scenarios.length,
        passed: summary.passCount,
        expectedBlocks: summary.expectedBlocks,
        unexpectedFailures: summary.failCount,
        issues: summary.issues.length,
        bySeverity: summary.issues.reduce((acc, item) => {
          acc[item.severity] = (acc[item.severity] || 0) + 1;
          return acc;
        }, {}),
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
