#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  normalizeBookingPassengers,
  passengerManifestCustodyBlockers,
} from "../src/lib/passengers.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = "2026-08-10T20:00:00.000Z";
const travelDate = "2026-08-15";

const ids = {
  father: "7bb72245-cfa2-46a9-9dcf-699102d676d9",
  mother: "4c3d85df-1078-4b62-a579-cb58cc3cf754",
  adultSon: "f4f37835-4dd3-4a5b-912e-26c7fbf1df5b",
  childOne: "846c2f7a-f2b0-454d-87d5-ea26f9667ef0",
  childTwo: "bbd9f1cb-adbc-4f10-8e49-93e2f66842d0",
  childThree: "fd48ab6a-a0cc-4742-8a8e-4626d82e6dc2",
  secondAdult: "bc9d7655-dbc9-43f7-bcc3-82f30e1d59a2",
};

const father = {
  id: ids.father,
  firstName: "Wrong",
  lastName: "Name",
  category: "account_holder",
  relationship: "self",
  bags: 1,
  consentAt: now,
};
const mother = {
  id: ids.mother,
  firstName: "Rana",
  lastName: "Haddad",
  category: "adult",
  relationship: "spouse",
  dateOfBirth: "1991-03-12",
  email: "rana@example.test",
  bags: 1,
  householdAttestedAt: now,
};
const adultSon = {
  id: ids.adultSon,
  firstName: "Tariq",
  lastName: "Haddad",
  category: "minor", // Deliberately wrong: the server must correct this using DOB.
  relationship: "child",
  dateOfBirth: "2004-10-19",
  email: "tariq@example.test",
  bags: 1,
  verificationStatus: "verified", // Deliberate client spoof attempt.
  identityVerifiedAt: now,
};
const minorChildren = [
  {
    id: ids.childOne,
    firstName: "Layla",
    lastName: "Haddad",
    category: "adult", // Deliberately wrong: DOB controls.
    relationship: "child",
    dateOfBirth: "2010-02-03",
    email: "layla@example.test",
    bags: 1,
    guardianAttestedAt: now,
  },
  {
    id: ids.childTwo,
    firstName: "Omar",
    lastName: "Haddad",
    category: "minor",
    relationship: "child",
    dateOfBirth: "2013-07-22",
    email: "omar@example.test",
    bags: 1,
    guardianAttestedAt: now,
  },
  {
    id: ids.childThree,
    firstName: "Noor",
    lastName: "Haddad",
    category: "minor",
    relationship: "child",
    dateOfBirth: "2017-11-09",
    email: "noor@example.test",
    bags: 2,
    guardianAttestedAt: now,
  },
];
const exactFamilyInput = [father, mother, adultSon, ...minorChildren];

function normalize(passengers = exactFamilyInput, overrides = {}) {
  return normalizeBookingPassengers(passengers, {
    accountHolderName: "Sami Haddad",
    accountHolderEmail: "sami@example.test",
    totalBags: 7,
    travelDate,
    accountHolderVerifiedAt: now,
    now,
    ...overrides,
  });
}

function expectPassengers(result) {
  assert.ok("passengers" in result, "Expected a valid traveler manifest");
  return result.passengers;
}

function expectError(result, pattern) {
  assert.ok("error" in result, "Expected the booking policy to reject this traveler manifest");
  assert.match(result.error, pattern);
}

function verified(passengers, ...passengerIds) {
  return passengers.map((passenger) => passengerIds.includes(passenger.id)
    ? { ...passenger, verificationStatus: "verified", identityVerifiedAt: now }
    : passenger);
}

const tests = [];
function test(name, run) {
  tests.push({ name, run });
}

test("Mo household normalizes to six travelers and seven assigned bags", () => {
  const passengers = expectPassengers(normalize());
  assert.equal(passengers.length, 6);
  assert.equal(passengers.reduce((sum, passenger) => sum + passenger.bags, 0), 7);
  assert.equal(passengers[0].firstName, "Sami");
  assert.equal(passengers[0].lastName, "Haddad");
});

test("Household roles become one holder, one spouse, one independent adult, and three minors", () => {
  const passengers = expectPassengers(normalize());
  assert.deepEqual(passengers.map(({ category }) => category), [
    "account_holder", "adult", "adult", "minor", "minor", "minor",
  ]);
  assert.deepEqual(passengers.map(({ verificationMethod }) => verificationMethod), [
    "primary_account", "household_spouse", "self_service", "guardian", "guardian", "guardian",
  ]);
});

test("Every family member keeps their own email in the traveler manifest", () => {
  const passengers = expectPassengers(normalize());
  assert.deepEqual(passengers.map(({ email }) => email), [
    "sami@example.test",
    "rana@example.test",
    "tariq@example.test",
    "layla@example.test",
    "omar@example.test",
    "noor@example.test",
  ]);
});

test("Client cannot misclassify the adult son as a minor or spoof verified status", () => {
  const son = expectPassengers(normalize()).find((passenger) => passenger.id === ids.adultSon);
  assert.equal(son.category, "adult");
  assert.equal(son.verificationMethod, "self_service");
  assert.equal(son.verificationStatus, "invite_required");
  assert.equal(son.identityVerifiedAt, undefined);
});

test("Client cannot misclassify a minor as an adult", () => {
  const child = expectPassengers(normalize()).find((passenger) => passenger.id === ids.childOne);
  assert.equal(child.category, "minor");
  assert.equal(child.verificationMethod, "guardian");
});

test("Only the unverified adult son blocks custody in Mo's exact household", () => {
  const passengers = expectPassengers(normalize());
  assert.deepEqual(passengerManifestCustodyBlockers(passengers, true), [
    "Tariq Haddad still needs traveler verification.",
  ]);
});

test("Custody clears after the adult son is independently verified", () => {
  const passengers = expectPassengers(normalize());
  assert.deepEqual(passengerManifestCustodyBlockers(verified(passengers, ids.adultSon), true), []);
});

test("An unverified father still blocks custody even after the adult son verifies", () => {
  const passengers = expectPassengers(normalize(exactFamilyInput, { accountHolderVerifiedAt: undefined }));
  assert.deepEqual(passengerManifestCustodyBlockers(verified(passengers, ids.adultSon), false), [
    "Account holder identity review is not complete.",
  ]);
});

test("A child who turns 18 on the travel date is an independent adult", () => {
  const birthdaySon = { ...adultSon, dateOfBirth: "2008-08-15" };
  const passengers = expectPassengers(normalize([father, mother, birthdaySon, ...minorChildren]));
  const son = passengers.find((passenger) => passenger.id === ids.adultSon);
  assert.equal(son.category, "adult");
  assert.equal(son.verificationMethod, "self_service");
});

test("A child who turns 18 the next day remains a guardian-authorized minor", () => {
  const almostAdult = {
    ...adultSon,
    dateOfBirth: "2008-08-16",
    email: undefined,
    guardianAttestedAt: now,
    bags: 1,
  };
  const passengers = expectPassengers(normalize([father, mother, almostAdult, ...minorChildren]));
  const son = passengers.find((passenger) => passenger.id === ids.adultSon);
  assert.equal(son.category, "minor");
  assert.equal(son.verificationMethod, "guardian");
});

test("Adult child without a separate email is rejected", () => {
  expectError(normalize([father, mother, { ...adultSon, email: undefined }, ...minorChildren]), /email for separate adult verification/);
});

test("Spouse without household authorization is rejected", () => {
  expectError(normalize([father, { ...mother, householdAttestedAt: undefined }, adultSon, ...minorChildren]), /spouse household authorization/);
});

test("Minor without guardian authorization is rejected", () => {
  const children = [{ ...minorChildren[0], guardianAttestedAt: undefined }, ...minorChildren.slice(1)];
  expectError(normalize([father, mother, adultSon, ...children]), /guardian authorization/);
});

test("A minor stays guardian-authorized even when an email is supplied", () => {
  const childWithEmail = { ...minorChildren[0], email: "layla@example.test" };
  const passengers = expectPassengers(normalize([father, mother, adultSon, childWithEmail, ...minorChildren.slice(1)]));
  const child = passengers.find((passenger) => passenger.id === ids.childOne);
  assert.equal(child.verificationMethod, "guardian");
});

test("All bags must be assigned exactly once across the family", () => {
  expectError(normalize(exactFamilyInput, { totalBags: 8 }), /Assign all 8 bags.*7 assigned/);
});

test("Duplicate traveler record IDs are rejected", () => {
  const duplicatedId = { ...minorChildren[1], id: ids.childOne };
  expectError(normalize([father, mother, adultSon, minorChildren[0], duplicatedId, minorChildren[2]]), /unique record/);
});

test("Duplicate adult identity cannot bypass detection by changing the email", () => {
  const duplicateSon = {
    ...adultSon,
    id: ids.secondAdult,
    email: "another-email@example.test",
    bags: 0,
  };
  expectError(normalize([...exactFamilyInput, duplicateSon]), /appears more than once/);
});

test("A future or travel-after-birth date is rejected", () => {
  expectError(normalize([father, mother, { ...adultSon, dateOfBirth: "2027-01-01" }, ...minorChildren]), /valid date of birth|future/);
});

test("Two adult children require two separate verifications", () => {
  const secondAdult = {
    id: ids.secondAdult,
    firstName: "Maya",
    lastName: "Haddad",
    category: "adult",
    relationship: "child",
    dateOfBirth: "2002-05-14",
    email: "maya@example.test",
    bags: 0,
  };
  const passengers = expectPassengers(normalize([...exactFamilyInput, secondAdult]));
  assert.deepEqual(passengerManifestCustodyBlockers(passengers, true), [
    "Tariq Haddad still needs traveler verification.",
    "Maya Haddad still needs traveler verification.",
  ]);
  assert.deepEqual(passengerManifestCustodyBlockers(verified(passengers, ids.adultSon), true), [
    "Maya Haddad still needs traveler verification.",
  ]);
  assert.deepEqual(passengerManifestCustodyBlockers(verified(passengers, ids.adultSon, ids.secondAdult), true), []);
});

test("Two independent adults cannot share one verification email", () => {
  const secondAdult = {
    id: ids.secondAdult,
    firstName: "Maya",
    lastName: "Haddad",
    category: "adult",
    relationship: "child",
    dateOfBirth: "2002-05-14",
    email: adultSon.email,
    bags: 0,
  };
  expectError(normalize([...exactFamilyInput, secondAdult]), /separate email/);
});

test("An independent adult cannot reuse the account holder email", () => {
  expectError(normalize([
    father,
    mother,
    { ...adultSon, email: "sami@example.test" },
    ...minorChildren,
  ]), /separate email/);
});

test("Rejected, resent, and manual-review adult states all remain custody-blocking", () => {
  const passengers = expectPassengers(normalize());
  for (const verificationStatus of ["rejected", "invite_sent", "manual_review"]) {
    const manifest = passengers.map((passenger) => passenger.id === ids.adultSon
      ? { ...passenger, verificationStatus }
      : passenger);
    assert.deepEqual(passengerManifestCustodyBlockers(manifest, true), [
      "Tariq Haddad still needs traveler verification.",
    ]);
  }
});

test("A verified label without identity evidence does not clear custody", () => {
  const passengers = expectPassengers(normalize());
  const forgedManifest = passengers.map((passenger) => passenger.id === ids.adultSon
    ? { ...passenger, verificationStatus: "verified", identityVerifiedAt: undefined }
    : passenger);
  assert.deepEqual(passengerManifestCustodyBlockers(forgedManifest, true), [
    "Tariq Haddad still needs traveler verification.",
  ]);
});

test("The family flow is connected to invite, atomic OTP, Stripe verification, rejection review, and custody routes", async () => {
  const [verifyPage, inviteRoute, verificationRoute, reviewRoute, custodyRoute] = await Promise.all([
    readFile(path.join(root, "src/app/verify-traveler/page.tsx"), "utf8"),
    readFile(path.join(root, "src/app/api/identity/verification-request/route.ts"), "utf8"),
    readFile(path.join(root, "src/app/api/identity/traveler-verification/route.ts"), "utf8"),
    readFile(path.join(root, "src/app/api/identity/verification-review/route.ts"), "utf8"),
    readFile(path.join(root, "src/app/api/bookings/route.ts"), "utf8"),
  ]);
  assert.match(verifyPage, /request_code/);
  assert.match(verifyPage, /action: "consent"/);
  assert.match(inviteRoute, /verificationStatus: "invite_sent"/);
  assert.match(verificationRoute, /consume_traveler_verification_otp/);
  assert.match(verificationRoute, /createStripeIdentitySession/);
  assert.match(verificationRoute, /verificationStatus: "pending"/);
  assert.match(reviewRoute, /action !== "reject"/);
  assert.doesNotMatch(reviewRoute, /status:\s*"verified"/);
  assert.match(custodyRoute, /passengerManifestCustodyBlockers/);
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
  household: "husband + wife + four children, including one son age 21 on travel date",
  detail: "Age classification, consent ownership, duplicate protection, bag reconciliation, independent-adult review, and custody gating all passed.",
}, null, 2));
