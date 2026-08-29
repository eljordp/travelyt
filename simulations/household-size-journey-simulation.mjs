#!/usr/bin/env node

import assert from "node:assert/strict";
import {
  normalizeBookingPassengers,
  passengerManifestCustodyBlockers,
} from "../src/lib/passengers.ts";
import { calcPriceCents } from "../src/lib/pricing.ts";
import { checkoutEligibilityBlocker } from "../src/lib/pilot-eligibility.ts";

const now = "2026-08-29T20:00:00.000Z";
const travelDate = "2026-09-15";
const approvalExpiry = "2026-08-30T20:00:00.000Z";

function passenger(firstName, index, options = {}) {
  const category = options.category ?? "minor";
  const relationship = options.relationship ?? "child";
  return {
    id: crypto.randomUUID(),
    firstName,
    lastName: "Haddad",
    category,
    relationship,
    dateOfBirth: options.dateOfBirth,
    email: `${firstName.toLowerCase()}.${index}@example.test`,
    bags: options.bags ?? 1,
    guardianAttestedAt: category === "minor" ? now : undefined,
    householdAttestedAt: relationship === "spouse" ? now : undefined,
  };
}

function holder(bags = 1) {
  return {
    id: crypto.randomUUID(),
    firstName: "Sami",
    lastName: "Haddad",
    category: "account_holder",
    relationship: "self",
    email: "sami@example.test",
    bags,
    consentAt: now,
  };
}

const scenarios = [
  {
    label: "2-person couple",
    people: [
      holder(),
      passenger("Rana", 2, { category: "adult", relationship: "spouse", dateOfBirth: "1991-03-12" }),
    ],
    bags: 2,
  },
  {
    label: "6-person family",
    people: [
      holder(),
      passenger("Rana", 2, { category: "adult", relationship: "spouse", dateOfBirth: "1991-03-12" }),
      passenger("Tariq", 3, { category: "adult", relationship: "child", dateOfBirth: "2004-10-19" }),
      passenger("Layla", 4, { category: "minor", dateOfBirth: "2010-02-03" }),
      passenger("Omar", 5, { category: "minor", dateOfBirth: "2013-07-22" }),
      passenger("Noor", 6, { category: "minor", dateOfBirth: "2017-11-09" }),
    ],
    bags: 6,
  },
  {
    label: "12-person family",
    people: [
      holder(),
      passenger("Rana", 2, { category: "adult", relationship: "spouse", dateOfBirth: "1991-03-12" }),
      passenger("Tariq", 3, { category: "adult", relationship: "child", dateOfBirth: "2002-10-19" }),
      passenger("Maya", 4, { category: "adult", relationship: "child", dateOfBirth: "2005-05-14" }),
      passenger("Layla", 5, { category: "minor", dateOfBirth: "2010-02-03" }),
      passenger("Omar", 6, { category: "minor", dateOfBirth: "2011-07-22" }),
      passenger("Noor", 7, { category: "minor", dateOfBirth: "2012-11-09" }),
      passenger("Adam", 8, { category: "minor", dateOfBirth: "2013-01-04" }),
      passenger("Lina", 9, { category: "minor", dateOfBirth: "2014-04-17" }),
      passenger("Yara", 10, { category: "minor", dateOfBirth: "2015-06-21" }),
      passenger("Zayd", 11, { category: "minor", dateOfBirth: "2016-08-09" }),
      passenger("Mira", 12, { category: "minor", dateOfBirth: "2018-12-15" }),
    ],
    bags: 12,
  },
];

function verifiedIndependentAdults(manifest) {
  return manifest.map((person) => person.verificationMethod === "self_service"
    ? { ...person, verificationStatus: "verified", identityVerifiedAt: now }
    : person);
}

function timingEstimate(people, independentAdults) {
  const formMin = Math.ceil(5 + people * 0.75);
  const formMax = Math.ceil(8 + people * 1.5);
  const adultMin = independentAdults ? 5 : 0;
  const adultMax = independentAdults ? 15 : 0;
  return {
    travelerEntry: `${formMin}-${formMax} min`,
    separateAdultVerificationParallel: independentAdults ? `${adultMin}-${adultMax} min` : "none",
    eligibilityReview: "5-15 min target",
    stripeCheckout: "2-5 min target",
    estimatedCustomerToPaid: `${formMin + adultMin + 7}-${formMax + adultMax + 20} min`,
    evidenceClass: "planning estimate, not a measured live SLA",
  };
}

const results = scenarios.map((scenario) => {
  const normalized = normalizeBookingPassengers(scenario.people, {
    accountHolderName: "Sami Haddad",
    accountHolderEmail: "sami@example.test",
    totalBags: scenario.bags,
    travelDate,
    accountHolderVerifiedAt: now,
    now,
  });
  assert.ok("passengers" in normalized, "Traveler manifest should normalize");
  const manifest = normalized.passengers;
  assert.equal(manifest.length, scenario.people.length);
  assert.equal(manifest.reduce((sum, person) => sum + person.bags, 0), scenario.bags);
  assert.equal(new Set(manifest.map((person) => person.email)).size, manifest.length);

  const initialBlockers = passengerManifestCustodyBlockers(manifest, true);
  const independentAdults = manifest.filter((person) => person.verificationMethod === "self_service");
  assert.equal(initialBlockers.length, independentAdults.length);
  const verifiedManifest = verifiedIndependentAdults(manifest);
  assert.deepEqual(passengerManifestCustodyBlockers(verifiedManifest, true), []);

  const pendingPayment = checkoutEligibilityBlocker({ status: "pending" }, new Date(now));
  const approvedPayment = checkoutEligibilityBlocker({
    status: "approved",
    expiresAt: approvalExpiry,
  }, new Date(now));
  const declinedPayment = checkoutEligibilityBlocker({ status: "declined" }, new Date(now));
  assert.ok(pendingPayment);
  assert.equal(approvedPayment, null);
  assert.match(declinedPayment, /No charge/i);

  return {
    household: scenario.label,
    travelers: manifest.length,
    bags: scenario.bags,
    independentAdultEmails: independentAdults.map((person) => person.email),
    initialCustodyBlockers: initialBlockers,
    afterAdultVerification: "custody identity gate clear",
    eligibility: "approved simulation unlocks checkout; declined control remains uncharged",
    arrivalPrice: `$${(calcPriceCents(scenario.bags, "arrival") / 100).toFixed(2)}`,
    departurePrice: `$${(calcPriceCents(scenario.bags, "departure") / 100).toFixed(2)}`,
    timing: timingEstimate(manifest.length, independentAdults.length),
    afterPayment: "driver assignment, physical seal/custody rehearsal, and final handoff remain later operational phases",
  };
});

assert.deepEqual(results.map((result) => result.arrivalPrice), ["$49.00", "$89.00", "$149.00"]);
assert.deepEqual(results.map((result) => result.travelers), [2, 6, 12]);

console.log(JSON.stringify({
  verdict: "PASS",
  journeys: results,
  proofBoundary: "Executable policy/model simulation only. It did not send real email/SMS, collect a real ID/selfie, create a real Stripe session, or move a physical bag.",
}, null, 2));
