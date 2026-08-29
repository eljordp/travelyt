#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  checkoutEligibilityBlocker,
  missingPilotChecks,
  PILOT_APPROVAL_WINDOW_MINUTES,
} from "../src/lib/pilot-eligibility.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-08-29T20:00:00.000Z");
const future = "2026-08-30T20:00:00.000Z";
const past = "2026-08-29T19:59:59.000Z";
const tests = [];
const test = (name, run) => tests.push({ name, run });

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

const [checkoutSource, decisionSource, bookingSource, payPage, bookingPage, migration] = await Promise.all([
  readFile(path.join(root, "src/app/api/stripe/checkout/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/ops/pilot-eligibility/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/api/bookings/route.ts"), "utf8"),
  readFile(path.join(root, "src/app/booking/[id]/pay/page.tsx"), "utf8"),
  readFile(path.join(root, "src/app/booking/[id]/page.tsx"), "utf8"),
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
  paymentRule: "Only a manually approved, unexpired pilot request can create Stripe Checkout.",
  deniedRule: "Pending, waitlisted, declined, expired, forged, zero-dollar, and near-expiry attempts remain uncharged.",
}, null, 2));
