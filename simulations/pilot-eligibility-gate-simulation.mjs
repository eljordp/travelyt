#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkoutEligibilityBlocker,
  derivePilotEligibilitySnapshot,
  missingPilotChecks,
  PILOT_APPROVAL_WINDOW_MINUTES,
  requiresConfirmedOffHoursPlan,
} from "../src/lib/pilot-eligibility.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-08-29T20:00:00.000Z");
const future = "2026-08-30T20:00:00.000Z";
const past = "2026-08-29T19:59:59.000Z";
const tests = [];
const test = (name, run) => tests.push({ name, run });
const eligibleBooking = (overrides = {}) => ({
  airport: "ORD",
  service: "departure",
  flight: "UA100",
  flightTime: "20:00",
  date: "2026-08-30",
  distanceMiles: 15,
  customerIdentityVerifiedAt: "2026-08-29T19:00:00.000Z",
  restrictedItemsAttestedAt: "2026-08-29T19:00:00.000Z",
  consentToSearchAt: "2026-08-29T19:00:00.000Z",
  consentToSearchVersion: "2026-08-30",
  passengers: [],
  ...overrides,
});

test("pending request cannot pay", () => {
  assert.match(checkoutEligibilityBlocker({ status: "pending" }, now), /review/i);
});
test("waitlisted request cannot pay and is told no charge", () => {
  assert.match(checkoutEligibilityBlocker({ status: "waitlisted" }, now), /No charge/i);
});
test("declined request cannot pay and is told no charge", () => {
  assert.match(checkoutEligibilityBlocker({ status: "declined" }, now), /No charge/i);
});
test("explicitly expired approval cannot pay", () => {
  assert.match(checkoutEligibilityBlocker({ status: "expired" }, now), /expired/i);
});
test("approved request without expiration cannot pay", () => {
  assert.match(checkoutEligibilityBlocker({ status: "approved" }, now), /missing or expired/i);
});
test("approved request with past expiration cannot pay", () => {
  assert.match(checkoutEligibilityBlocker({ status: "approved", expiresAt: past }, now), /expired/i);
});
test("approved request with future expiration unlocks checkout", () => {
  assert.equal(checkoutEligibilityBlocker({ status: "approved", expiresAt: future }, now), null);
});
test("an unknown or legacy missing decision fails closed as pending", () => {
  assert.match(checkoutEligibilityBlocker({}, now), /review/i);
});
test("approval requires all five operational checks", () => {
  assert.deepEqual(missingPilotChecks({}), [
    "eligibleFlight",
    "eligibleTraveler",
    "routeWithinPilotArea",
    "noticeSatisfied",
    "capacityConfirmed",
  ]);
});
test("complete approval snapshot has no missing check", () => {
  assert.deepEqual(missingPilotChecks({
    eligibleFlight: true,
    eligibleTraveler: true,
    routeWithinPilotArea: true,
    noticeSatisfied: true,
    capacityConfirmed: true,
  }), []);
});
test("approval window is bounded at 24 hours", () => {
  assert.equal(PILOT_APPROVAL_WINDOW_MINUTES, 1440);
});
test("server derives a complete ORD snapshot with only capacity supplied by admin", () => {
  assert.deepEqual(
    missingPilotChecks(derivePilotEligibilitySnapshot(eligibleBooking(), {
      capacityConfirmed: true,
      now,
    })),
    [],
  );
});
test("30 route miles is eligible but 30.1 is not", () => {
  assert.equal(derivePilotEligibilitySnapshot(eligibleBooking({ distanceMiles: 30 }), { now }).routeWithinPilotArea, true);
  assert.equal(derivePilotEligibilitySnapshot(eligibleBooking({ distanceMiles: 30.1 }), { now }).routeWithinPilotArea, false);
});
test("departure route-aware cutoff rejects a flat four-hour assumption at 30 miles", () => {
  const snapshot = derivePilotEligibilitySnapshot(
    eligibleBooking({ date: "2026-08-29", flightTime: "19:00", distanceMiles: 30 }),
    { now },
  );
  assert.equal(snapshot.noticeSatisfied, false);
});
test("departure with five hours of route-aware notice passes", () => {
  const snapshot = derivePilotEligibilitySnapshot(
    eligibleBooking({ date: "2026-08-29", flightTime: "20:00", distanceMiles: 30 }),
    { now },
  );
  assert.equal(snapshot.noticeSatisfied, true);
});
test("arrival requires four hours notice: 3h59 fails and 4h passes", () => {
  const base = { service: "arrival", date: "2026-08-29" };
  assert.equal(derivePilotEligibilitySnapshot(eligibleBooking({ ...base, flightTime: "18:59" }), { now }).noticeSatisfied, false);
  assert.equal(derivePilotEligibilitySnapshot(eligibleBooking({ ...base, flightTime: "19:00" }), { now }).noticeSatisfied, true);
});
test("valid flight times remain inside the confirmed 24-hour operating window", () => {
  assert.equal(requiresConfirmedOffHoursPlan("departure", "09:00"), false);
  assert.equal(requiresConfirmedOffHoursPlan("departure", "00:01"), false);
  assert.equal(requiresConfirmedOffHoursPlan("arrival", "17:59"), false);
  assert.equal(requiresConfirmedOffHoursPlan("arrival", "23:59"), false);
  assert.equal(
    derivePilotEligibilitySnapshot(
      eligibleBooking({ flightTime: "06:00" }),
      { capacityConfirmed: true, now },
    ).operatingWindowMode,
    "standard",
  );
});
test("unverified traveler remains ineligible", () => {
  const snapshot = derivePilotEligibilitySnapshot(
    eligibleBooking({ customerIdentityVerifiedAt: undefined }),
    { capacityConfirmed: true, now },
  );
  assert.equal(snapshot.eligibleTraveler, false);
});
test("missing or stale baggage-inspection consent remains ineligible", () => {
  assert.equal(
    derivePilotEligibilitySnapshot(
      eligibleBooking({ consentToSearchAt: undefined }),
      { capacityConfirmed: true, now },
    ).eligibleTraveler,
    false,
  );
  assert.equal(
    derivePilotEligibilitySnapshot(
      eligibleBooking({ consentToSearchVersion: "legacy" }),
      { capacityConfirmed: true, now },
    ).eligibleTraveler,
    false,
  );
});

const [checkoutSource, decisionSource, bookingSource, payPage, bookingPage, adminPage, migration] = await Promise.all([
  readFile(path.join(root, "src/app/api/stripe/checkout/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/ops/pilot-eligibility/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/bookings/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/booking/[id]/pay/page.tsx"), "utf8"),
  readFile(path.join(root, "src/app/booking/[id]/page.tsx"), "utf8"),
  readFile(path.join(root, "src/app/admin/page.tsx"), "utf8"),
  readFile(path.join(root, "supabase/migrations/037_pilot_eligibility_gate.sql"), "utf8"),
]);

test("server evaluates eligibility before creating Stripe Checkout", () => {
  assert.ok(checkoutSource.indexOf("checkoutEligibilityBlocker") < checkoutSource.indexOf("stripe.checkout.sessions.create"));
});
test("zero-dollar path cannot bypass eligibility", () => {
  assert.ok(checkoutSource.indexOf("checkoutEligibilityBlocker") < checkoutSource.indexOf("booking.priceCents <= 0"));
});
test("Stripe session expiry cannot outlive the approval", () => {
  assert.match(checkoutSource, /expires_at: Math\.min/);
  assert.match(checkoutSource, /approvalExpiresAt/);
});
test("near-expiry approvals are blocked before Stripe", () => {
  assert.match(checkoutSource, /remainingApprovalSeconds < 30 \* 60/);
});
test("only a full admin may decide eligibility", () => {
  assert.match(decisionSource, /session\.role !== "admin"/);
});
test("admin approval derives four checks and asks only for operating capacity", () => {
  assert.match(adminPage, /REQUIRED_PILOT_CHECKS\.map/);
  assert.match(adminPage, /disabled=!\{?capacityCheck|disabled=\{!capacityCheck\}/);
  assert.match(adminPage, /derivePilotEligibilitySnapshot/);
  assert.match(adminPage, /capacityConfirmed: eligibilityChecks\.capacityConfirmed === true/);
  assert.match(decisionSource, /derivePilotEligibilitySnapshot/);
  assert.match(decisionSource, /body\.snapshot\?\.capacityConfirmed === true/);
  assert.doesNotMatch(decisionSource, /\.\.\.\(body\.snapshot/);
});
test("eligibility decisions are final while the booking stays pending", () => {
  assert.match(decisionSource, /already has a final eligibility decision/);
});
test("generic booking patch cannot forge eligibility", () => {
  assert.match(bookingSource, /dedicated full-admin review action/);
});
test("waitlist and decline never set booking paid fields", () => {
  assert.doesNotMatch(decisionSource, /paid_at|price_cents|status: "paid"/);
});
test("customer pay page hides checkout unless eligibility passes", () => {
  assert.match(payPage, /checkoutUnlocked &&/);
  assert.match(payPage, /Waitlisted and declined|No charge|eligibilityBlocker/);
});
test("booking status page exposes approval gating", () => {
  assert.match(bookingPage, /PILOT_ELIGIBILITY_LABELS/);
  assert.match(bookingPage, /!eligibilityBlocker/);
});
test("database constrains all eligibility states", () => {
  for (const state of ["pending", "approved", "waitlisted", "declined", "expired"]) {
    assert.match(migration, new RegExp(`'${state}'`));
  }
});
test("decision creates an immutable audit-ledger event", () => {
  assert.match(decisionSource, /pilot_eligibility_decision/);
  assert.match(migration, /pilot_eligibility_decision/);
});

const passed = [];
for (const { name, run } of tests) {
  try {
    await run();
    passed.push(name);
  } catch (error) {
    console.error(JSON.stringify({ verdict: "FAIL", passed: passed.length, failed: name }, null, 2));
    throw error;
  }
}

console.log(JSON.stringify({
  verdict: "PASS",
  checks: passed.length,
  paymentRule: "Only a server-derived eligible request with manually confirmed capacity and an unexpired approval can create Stripe Checkout.",
  deniedRule: "Pending, waitlisted, declined, expired, forged, zero-dollar, and near-expiry attempts remain uncharged.",
}, null, 2));
